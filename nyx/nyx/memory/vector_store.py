"""
Stockage vectoriel des souvenirs épisodiques.

Ce module gère :
- L'ajout de nouveaux souvenirs avec embedding
- La recherche par similarité sémantique
- Le calcul du decay et la suppression des souvenirs oubliés
- L'archivage des souvenirs sous le seuil
"""

import json
from pathlib import Path
from datetime import datetime
from typing import Optional
import uuid

from nyx.core.types import Souvenir
from nyx.core.math_utils import clamp01, similarite_cosinus
from nyx.core.decay import calculer_force_actuelle


class VectorStore:
    """
    Magasin de souvenirs vectoriels.
    """
    
    def __init__(self, config: dict):
        """
        Initialiser le store de souvenirs.
        
        Args:
            config: Configuration de la mémoire
        """
        self.config = config
        self.seuil_oubli = config.get("seuil_oubli", 0.1)
        self.plafond_memoire_mo = config.get("plafond_memoire_mo", 500)
        
        # Chemins des fichiers
        data_dir = Path(__file__).parent.parent.parent / "data" / "memories"
        self.vector_memory_path = data_dir / "vector_memory.json"
        self.archive_path = data_dir / "archive.json"
        
        # Charger les souvenirs existants
        self.souvenirs: list[Souvenir] = []
        self._charger_souvenirs()
    
    def _charger_souvenirs(self):
        """Charger les souvenirs depuis le fichier JSON."""
        if self.vector_memory_path.exists():
            try:
                with open(self.vector_memory_path, 'r', encoding='utf-8') as f:
                    data = json.load(f)
                    self.souvenirs = [Souvenir.from_dict(item) for item in data]
            except (json.JSONDecodeError, IOError, KeyError) as e:
                print(f"⚠ Impossible de charger vector_memory.json: {e}")
                self.souvenirs = []
        else:
            self.souvenirs = []
    
    def _sauvegarder_souvenirs(self):
        """Sauvegarder les souvenirs sur le disque."""
        self.vector_memory_path.parent.mkdir(parents=True, exist_ok=True)
        try:
            with open(self.vector_memory_path, 'w', encoding='utf-8') as f:
                json.dump(
                    [s.to_dict() for s in self.souvenirs],
                    f,
                    ensure_ascii=False,
                    indent=2
                )
        except IOError as e:
            print(f"⚠ Erreur sauvegarde vector_memory.json: {e}")
    
    def ajouter_souvenir(
        self,
        texte: str,
        I0: float,
        valence: float = 0.0,
        embedding: Optional[list[float]] = None,
        metadata: Optional[dict] = None
    ) -> Souvenir:
        """
        Ajouter un nouveau souvenir.
        
        Args:
            texte: Contenu textuel du souvenir
            I0: Intensité initiale (0 à 1)
            valence: Valence émotionnelle (-1 à 1)
            embedding: Vecteur d'embedding (optionnel, sera calculé si absent)
            metadata: Métadonnées optionnelles
        
        Returns:
            Le souvenir créé
        """
        from nyx.llm.ollama_client import OllamaClient
        
        # Calculer l'embedding si non fourni
        if embedding is None:
            client = OllamaClient()
            embedding = client.embed(texte)
        
        souvenir = Souvenir(
            id=str(uuid.uuid4()),
            texte=texte,
            embedding=embedding,
            I0=clamp01(I0),
            valence=clamp01(valence + 1) * 0.5 - 0.5,  # Ramener à -1..1 si nécessaire
            metadata=metadata or {}
        )
        
        self.souvenirs.append(souvenir)
        self._sauvegarder_souvenirs()
        
        # Vérifier le plafond mémoire
        self._enforcer_cap()
        
        return souvenir
    
    def rechercher_pertinents(
        self,
        requete: str,
        top_k: int = 5,
        seuil_min: float = 0.3
    ) -> list[dict]:
        """
        Rechercher les souvenirs les plus pertinents.
        
        Args:
            requete: Texte de la requête
            top_k: Nombre de résultats à retourner
            seuil_min: Seuil minimum de similarité
        
        Returns:
            Liste des souvenirs pertinents avec leur score
        """
        from nyx.llm.ollama_client import OllamaClient
        
        if not self.souvenirs:
            return []
        
        # Embedder la requête
        client = OllamaClient()
        embedding_requete = client.embed(requete)
        
        # Calculer les similarités
        resultats = []
        now = datetime.now()
        
        for souvenir in self.souvenirs:
            # Calculer le temps écoulé en heures
            temps_ecoule = (now - souvenir.timestamp_creation).total_seconds() / 3600
            
            # Calculer la force actuelle avec decay
            force_actuelle = calculer_force_actuelle(
                souvenir.I0,
                souvenir.valence,
                temps_ecoule,
                self.config
            )
            
            # Ignorer les souvenirs sous le seuil d'oubli
            if force_actuelle < self.seuil_oubli:
                continue
            
            # Calculer la similarité sémantique
            similarite = similarite_cosinus(embedding_requete, souvenir.embedding)
            
            # Score combiné : similarité × force actuelle
            score = similarite * force_actuelle
            
            if score >= seuil_min:
                resultats.append({
                    "id": souvenir.id,
                    "texte": souvenir.texte,
                    "score": score,
                    "similarite": similarite,
                    "force_actuelle": force_actuelle,
                    "valence": souvenir.valence,
                    "I0": souvenir.I0,
                })
                
                # Mettre à jour last_access
                souvenir.last_access = now
        
        # Trier par score décroissant
        resultats.sort(key=lambda x: x["score"], reverse=True)
        
        # Sauvegarder les mises à jour de last_access
        self._sauvegarder_souvenirs()
        
        return resultats[:top_k]
    
    def _enforcer_cap(self):
        """
        Appliquer le plafond mémoire en supprimant les souvenirs les moins prioritaires.
        
        Priorité = force_actuelle × similarité_moyenne_aux_autres
        On garde les souvenirs forts ET distinctifs.
        """
        import numpy as np
        
        if len(self.souvenirs) < 10:
            return  # Pas besoin de nettoyer
        
        # Estimer la taille actuelle (approximation)
        taille_estimee_octets = sum(
            len(s.texte.encode('utf-8')) + len(s.embedding) * 4
            for s in self.souvenirs
        )
        plafond_octets = self.plafond_memoire_mo * 1024 * 1024
        
        if taille_estimee_octets <= plafond_octets:
            return  # Sous le plafond
        
        # Calculer les priorités
        now = datetime.now()
        priorites = []
        
        for i, souvenir in enumerate(self.souvenirs):
            temps_ecoule = (now - souvenir.timestamp_creation).total_seconds() / 3600
            force = calculer_force_actuelle(souvenir.I0, souvenir.valence, temps_ecoule, self.config)
            
            # Pénaliser les souvenirs très similaires aux autres (redondance)
            embeddings_other = [s.embedding for j, s in enumerate(self.souvenirs) if j != i]
            if embeddings_other:
                similarite_moyenne = sum(
                    similarite_cosinus(souvenir.embedding, emb)
                    for emb in embeddings_other
                ) / len(embeddings_other)
            else:
                similarite_moyenne = 0
            
            priorite = force * (1 - similarite_moyenne)
            priorites.append((i, priorite))
        
        # Trier par priorité croissante (supprimer les moins prioritaires)
        priorites.sort(key=lambda x: x[1])
        
        # Supprimer jusqu'à atteindre le plafond
        nb_a_supprimer = max(1, len(self.souvenirs) // 10)  # Supprimer 10% à la fois
        for idx, _ in priorites[:nb_a_supprimer]:
            del self.souvenirs[idx]
        
        self._sauvegarder_souvenirs()
    
    def obtenir_tous(self) -> list[dict]:
        """Retourner tous les souvenirs (pour debug/export)."""
        return [s.to_dict() for s in self.souvenirs]
    
    def compter(self) -> int:
        """Retourner le nombre de souvenirs."""
        return len(self.souvenirs)

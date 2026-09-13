"""
Graphe de traits de personnalité.

Ce module gère :
- Le chargement du seed primitif (config/primitive_seed.json)
- L'activation et le renforcement des traits
- La co-activation entre traits (création/mise à jour des arêtes)
- Le clustering par thème
- Le retour à l'homéostasie
"""

import json
from pathlib import Path
from datetime import datetime
from typing import Optional

from nyx.core.types import TraitNode, TraitEdge
from nyx.core.decay import appliquer_homéostasie_trait


class GraphStore:
    """
    Graphe de traits de personnalité.
    """
    
    def __init__(self, config: dict):
        """
        Initialiser le graphe de traits.
        
        Args:
            config: Configuration de la mémoire
        """
        self.config = config
        self.seuil_promotion = config.get("seuil_promotion_graphe", 0.8)
        
        # Chemins des fichiers
        data_dir = Path(__file__).parent.parent.parent / "data" / "graph"
        self.nodes_path = data_dir / "nodes.json"
        self.edges_path = data_dir / "edges.json"
        
        # Charger les nœuds et arêtes
        self.noeuds: list[TraitNode] = []
        self.aretes: list[TraitEdge] = []
        self._charger_graphe()
        
        # Si le graphe est vide, charger le seed primitif
        if not self.noeuds:
            self._charger_seed_primitif()
    
    def _charger_graphe(self):
        """Charger le graphe depuis les fichiers JSON."""
        # Charger les nœuds
        if self.nodes_path.exists():
            try:
                with open(self.nodes_path, 'r', encoding='utf-8') as f:
                    data = json.load(f)
                    self.noeuds = [TraitNode.from_dict(item) for item in data]
            except (json.JSONDecodeError, IOError, KeyError) as e:
                print(f"⚠ Impossible de charger nodes.json: {e}")
                self.noeuds = []
        else:
            self.noeuds = []
        
        # Charger les arêtes
        if self.edges_path.exists():
            try:
                with open(self.edges_path, 'r', encoding='utf-8') as f:
                    data = json.load(f)
                    self.aretes = [TraitEdge.from_dict(item) for item in data]
            except (json.JSONDecodeError, IOError, KeyError) as e:
                print(f"⚠ Impossible de charger edges.json: {e}")
                self.aretes = []
        else:
            self.aretes = []
    
    def _sauvegarder_graphe(self):
        """Sauvegarder le graphe sur le disque."""
        self.nodes_path.parent.mkdir(parents=True, exist_ok=True)
        
        try:
            with open(self.nodes_path, 'w', encoding='utf-8') as f:
                json.dump(
                    [n.to_dict() for n in self.noeuds],
                    f,
                    ensure_ascii=False,
                    indent=2
                )
            
            with open(self.edges_path, 'w', encoding='utf-8') as f:
                json.dump(
                    [e.to_dict() for e in self.aretes],
                    f,
                    ensure_ascii=False,
                    indent=2
                )
        except IOError as e:
            print(f"⚠ Erreur sauvegarde graphe: {e}")
    
    def _charger_seed_primitif(self):
        """Charger le seed primitif depuis la configuration."""
        seed_path = Path(__file__).parent.parent.parent / "config" / "primitive_seed.json"
        
        if seed_path.exists():
            try:
                with open(seed_path, 'r', encoding='utf-8') as f:
                    seed = json.load(f)
                
                # Créer les nœuds
                for trait_data in seed.get("traits", []):
                    self.noeuds.append(TraitNode(
                        id=trait_data["id"],
                        nom=trait_data["nom"],
                        valeur=trait_data["valeur"],
                        description=trait_data.get("description", "")
                    ))
                
                # Créer les arêtes primitives
                for lien_data in seed.get("liens_primitifs", []):
                    self.aretes.append(TraitEdge(
                        source=lien_data["source"],
                        cible=lien_data["cible"],
                        force=lien_data["force"]
                    ))
                
                self._sauvegarder_graphe()
                print("  ✓ Graphe initialisé avec seed primitif")
            except (json.JSONDecodeError, IOError, KeyError) as e:
                print(f"⚠ Impossible de charger primitive_seed.json: {e}")
    
    def activer_trait(self, trait_id: str, intensite: float = 0.1):
        """
        Activer un trait (augmenter sa valeur).
        
        Args:
            trait_id: ID du trait à activer
            intensite: Amount d'augmentation (0 à 1)
        """
        for noeud in self.noeuds:
            if noeud.id == trait_id:
                noeud.valeur = min(1.0, noeud.valeur + intensite)
                noeud.last_activation = datetime.now()
                
                # Propager l'activation aux traits connectés
                self._propager_activation(trait_id, intensite * 0.5)
                
                self._sauvegarder_graphe()
                return
        
        # Si le trait n'existe pas, on pourrait le créer (optionnel)
        print(f"⚠ Trait '{trait_id}' non trouvé dans le graphe")
    
    def _propager_activation(self, trait_source_id: str, intensite: float):
        """
        Propager l'activation aux traits connectés.
        
        Args:
            trait_source_id: ID du trait source
            intensite: Intensité à propager
        """
        # Trouver les arêtes partant de ce trait
        aretes_sortantes = [e for e in self.aretes if e.source == trait_source_id]
        
        for arete in aretes_sortantes:
            # Trouver le nœud cible
            for noeud in self.noeuds:
                if noeud.id == arete.cible:
                    # Renforcer l'arête
                    arete.force = min(1.0, arete.force + intensite * 0.1)
                    arete.last_coactivation = datetime.now()
                    
                    # Activer le nœud cible proportionnellement à la force de l'arête
                    noeud.valeur = min(1.0, noeud.valeur + intensite * arete.force)
                    noeud.last_activation = datetime.now()
    
    def renforcer_coactivation(self, trait_a: str, trait_b: str, intensite: float = 0.05):
        """
        Renforcer la co-activation entre deux traits.
        
        Args:
            trait_a: ID du premier trait
            trait_b: ID du second trait
            intensite: Amount de renforcement
        """
        # Vérifier si une arête existe déjà
        for arete in self.aretes:
            if (arete.source == trait_a and arete.cible == trait_b) or \
               (arete.source == trait_b and arete.cible == trait_a):
                arete.force = min(1.0, arete.force + intensite)
                arete.last_coactivation = datetime.now()
                self._sauvegarder_graphe()
                return
        
        # Créer une nouvelle arête
        nouvelle_arete = TraitEdge(
            source=trait_a,
            cible=trait_b,
            force=intensite
        )
        self.aretes.append(nouvelle_arete)
        self._sauvegarder_graphe()
    
    def appliquer_homéostasie_globale(self, facteur_retour: float = 0.01):
        """
        Appliquer le retour à l'homéostasie à tous les traits.
        
        À appeler périodiquement (ex: chaque tick) pour que les traits
        non activés retournent progressivement vers leur baseline.
        
        Args:
            facteur_retour: Vitesse de retour à l'homéostasie
        """
        cible_homeostase = 0.5  # Valeur par défaut
        
        for noeud in self.noeuds:
            ancienne_valeur = noeud.valeur
            noeud.valeur = appliquer_homéostasie_trait(
                noeud.valeur,
                cible_homeostase,
                facteur_retour
            )
        
        # Décroissance lente des arêtes non utilisées
        for arete in self.aretes:
            temps_depuis_coactivation = (datetime.now() - arete.last_coactivation).days
            if temps_depuis_coactivation > 7:  # Après 7 jours sans utilisation
                arete.force = max(0.01, arete.force * 0.95)
        
        self._sauvegarder_graphe()
    
    def obtenir_traits_actifs(self, seuil: float = 0.6) -> list[dict]:
        """
        Obtenir les traits actuellement au-dessus du seuil.
        
        Args:
            seuil: Seuil d'activation
        
        Returns:
            Liste des traits actifs
        """
        return [
            {"id": n.id, "nom": n.nom, "valeur": n.valeur}
            for n in self.noeuds
            if n.valeur >= seuil
        ]
    
    def cluster_par_theme(self) -> dict[str, list[str]]:
        """
        Grouper les traits par thèmes (heuristique simple).
        
        Returns:
            Dictionnaire thème -> liste de traits
        """
        # Heuristique basée sur les connexions fortes
        clusters = {}
        traits_visites = set()
        
        for noeud in self.noeuds:
            if noeud.id in traits_visites:
                continue
            
            # Nouveau cluster
            cluster_id = noeud.id
            clusters[cluster_id] = [noeud.id]
            traits_visites.add(noeud.id)
            
            # Ajouter les traits fortement connectés
            for arete in self.aretes:
                if arete.force < 0.5:
                    continue
                
                if arete.source == noeud.id and arete.cible not in traits_visites:
                    clusters[cluster_id].append(arete.cible)
                    traits_visites.add(arete.cible)
                elif arete.cible == noeud.id and arete.source not in traits_visites:
                    clusters[cluster_id].append(arete.source)
                    traits_visites.add(arete.source)
        
        return clusters

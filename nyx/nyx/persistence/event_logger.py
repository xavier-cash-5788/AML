"""
Logger d'événements append-only.

Ce module écrit dans events_log.jsonl (JSON Lines) :
- Un événement par ligne
- Jamais modifié, seulement ajouté
- Idéal pour le debug, l'audit, et la reconstruction d'historique
"""

import json
from pathlib import Path
from datetime import datetime
from typing import Optional, Any


class EventLogger:
    """
    Logger d'événements en mode append-only.
    """
    
    def __init__(self):
        """Initialiser le logger."""
        data_dir = Path(__file__).parent.parent.parent / "data"
        self.events_log_path = data_dir / "events_log.jsonl"
        
        # Créer le fichier s'il n'existe pas
        self.events_log_path.parent.mkdir(parents=True, exist_ok=True)
        if not self.events_log_path.exists():
            self.events_log_path.touch()
    
    def loguer(self, evenement_type: str, donnees: dict):
        """
        Logger un événement générique.
        
        Args:
            evenement_type: Type d'événement (ex: "interaction", "feedback", "decay")
            donnees: Données de l'événement
        """
        entree = {
            "timestamp": datetime.now().isoformat(),
            "type": evenement_type,
            "donnees": donnees,
        }
        
        with open(self.events_log_path, 'a', encoding='utf-8') as f:
            f.write(json.dumps(entree, ensure_ascii=False) + '\n')
    
    def loguer_interaction(
        self,
        message_id: str,
        message_utilisateur: str,
        reponse_nyx: str,
        emotion: dict,
        niveau_stress: float,
        souvenirs_utilises: list[str]
    ):
        """
        Logger une interaction complète.
        
        Args:
            message_id: ID unique du message
            message_utilisateur: Message de l'utilisateur
            reponse_nyx: Réponse de Nyx
            emotion: Émotion détectée
            niveau_stress: Niveau de stress au moment de l'interaction
            souvenirs_utilises: IDs des souvenirs récupérés
        """
        self.loguer("interaction", {
            "message_id": message_id,
            "message_utilisateur": message_utilisateur[:200],  # Tronquer si trop long
            "reponse_nyx": reponse_nyx[:500],
            "emotion": emotion,
            "niveau_stress": niveau_stress,
            "souvenirs_utilises": souvenirs_utilises,
        })
    
    def loguer_feedback(
        self,
        message_id: str,
        positif: bool
    ):
        """
        Logger un feedback utilisateur.
        
        Args:
            message_id: ID du message concerné
            positif: True pour 👍, False pour 👎
        """
        self.loguer("feedback", {
            "message_id": message_id,
            "positif": positif,
        })
    
    def loguer_decay(
        self,
        nb_souvenirs_avant: int,
        nb_souvenirs_apres: int,
        nb_oublies: int
    ):
        """
        Logger une opération de decay/suppression.
        
        Args:
            nb_souvenirs_avant: Nombre de souvenirs avant cleanup
            nb_souvenirs_apres: Nombre après
            nb_oublies: Nombre de souvenirs oubliés/supprimés
        """
        self.loguer("decay", {
            "avant": nb_souvenirs_avant,
            "apres": nb_souvenirs_apres,
            "oublies": nb_oublies,
        })
    
    def loguer_evolution(
        self,
        generation: int,
        meilleure_fitness: float,
        hyperparams_gagnants: dict
    ):
        """
        Logger un résultat de neuro-évolution.
        
        Args:
            generation: Numéro de génération
            meilleure_fitness: Score de fitness du meilleur individu
            hyperparams_gagnants: Hyperparamètres gagnants
        """
        self.loguer("evolution", {
            "generation": generation,
            "meilleure_fitness": meilleure_fitness,
            "hyperparams": hyperparams_gagnants,
        })
    
    def lire_derniers_evenements(
        self,
        n: int = 100,
        filtre_type: Optional[str] = None
    ) -> list[dict]:
        """
        Lire les N derniers événements.
        
        Args:
            n: Nombre d'événements à lire
            filtre_type: Filtrer par type d'événement (optionnel)
        
        Returns:
            Liste des événements
        """
        evenements = []
        
        try:
            with open(self.events_log_path, 'r', encoding='utf-8') as f:
                for ligne in f:
                    ligne = ligne.strip()
                    if not ligne:
                        continue
                    
                    try:
                        evenement = json.loads(ligne)
                        
                        if filtre_type and evenement.get("type") != filtre_type:
                            continue
                        
                        evenements.append(evenement)
                    except json.JSONDecodeError:
                        continue
        except IOError:
            return []
        
        # Retourner les N derniers
        return evenements[-n:]

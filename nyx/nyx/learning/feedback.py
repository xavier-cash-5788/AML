"""
Gestionnaire de feedback humain (👍 / 👎).

Ce module est LA source de vérité pour le reward dans tout le système.
Tous les mécanismes d'apprentissage (RL, neuro-évolution, méta-apprentissage)
doivent utiliser ce fichier pour obtenir le signal de reward.
"""

import json
from pathlib import Path
from datetime import datetime
import uuid
from typing import Optional


class FeedbackManager:
    """
    Gère l'enregistrement et la consultation du feedback humain.
    """
    
    def __init__(self):
        """Initialiser le gestionnaire de feedback."""
        data_dir = Path(__file__).parent.parent.parent / "data"
        self.feedback_log_path = data_dir / "feedback_log.json"
        
        # Charger le journal existant
        self.feedback_log: list[dict] = []
        self._charger_journal()
    
    def _charger_journal(self):
        """Charger le journal de feedback depuis le fichier JSON."""
        if self.feedback_log_path.exists():
            try:
                with open(self.feedback_log_path, 'r', encoding='utf-8') as f:
                    self.feedback_log = json.load(f)
            except (json.JSONDecodeError, IOError) as e:
                print(f"⚠ Impossible de charger feedback_log.json: {e}")
                self.feedback_log = []
        else:
            self.feedback_log = []
    
    def _sauvegarder_journal(self):
        """Sauvegarder le journal sur le disque."""
        self.feedback_log_path.parent.mkdir(parents=True, exist_ok=True)
        try:
            with open(self.feedback_log_path, 'w', encoding='utf-8') as f:
                json.dump(
                    self.feedback_log,
                    f,
                    ensure_ascii=False,
                    indent=2
                )
        except IOError as e:
            print(f"⚠ Erreur sauvegarde feedback_log.json: {e}")
    
    def enregistrer_feedback(
        self,
        message_id: str,
        positif: bool,
        contexte: Optional[dict] = None
    ) -> dict:
        """
        Enregistrer un nouveau feedback.
        
        Args:
            message_id: ID du message concerné
            positif: True pour 👍, False pour 👎
            contexte: Contexte optionnel (état du système au moment du feedback)
        
        Returns:
            L'entrée de feedback créée
        """
        entree = {
            "id": str(uuid.uuid4()),
            "timestamp": datetime.now().isoformat(),
            "message_id": message_id,
            "positif": positif,
            "contexte": contexte or {},
        }
        
        self.feedback_log.append(entree)
        self._sauvegarder_journal()
        
        return entree
    
    def obtenir_reward_pour_message(self, message_id: str) -> Optional[float]:
        """
        Obtenir le reward pour un message donné.
        
        Args:
            message_id: ID du message
        
        Returns:
            +1 pour 👍, -1 pour 👎, None si aucun feedback
        """
        for entree in self.feedback_log:
            if entree["message_id"] == message_id:
                return 1.0 if entree["positif"] else -1.0
        return None
    
    def obtenir_historique_feedback(
        self,
        limite: Optional[int] = None
    ) -> list[dict]:
        """
        Obtenir l'historique des feedbacks.
        
        Args:
            limite: Nombre maximum d'entrées à retourner (None = tout)
        
        Returns:
            Liste des entrées de feedback
        """
        if limite:
            return self.feedback_log[-limite:]
        return self.feedback_log.copy()
    
    def compter_feedbacks(self) -> dict:
        """
        Compter les feedbacks positifs et négatifs.
        
        Returns:
            Dictionnaire avec les comptes
        """
        positifs = sum(1 for f in self.feedback_log if f["positif"])
        negatifs = sum(1 for f in self.feedback_log if not f["positif"])
        
        return {
            "positifs": positifs,
            "negatifs": negatifs,
            "total": positifs + negatifs,
            "ratio": positifs / max(1, positifs + negatifs)
        }
    
    def obtenir_reward_moyen_recent(self, n_derniers: int = 10) -> float:
        """
        Calculer le reward moyen sur les N derniers feedbacks.
        
        Utile pour le méta-apprentissage et l'ajustement des taux.
        
        Args:
            n_derniers: Nombre de feedbacks à considérer
        
        Returns:
            Reward moyen (-1 à 1)
        """
        recents = self.feedback_log[-n_derniers:]
        
        if not recents:
            return 0.0
        
        rewards = [1.0 if f["positif"] else -1.0 for f in recents]
        return sum(rewards) / len(rewards)

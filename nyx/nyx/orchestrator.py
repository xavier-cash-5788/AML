"""
Orchestrateur principal de Nyx.

Ce module coordonne tous les sous-systèmes pour traiter un message utilisateur :
1. Analyse émotionnelle du message entrant
2. Récupération des souvenirs pertinents
3. Mise à jour de l'état de régulation
4. Construction du prompt contextuel
5. Génération de la réponse via LLM
6. Stockage du nouveau souvenir
7. Mise à jour des apprentissages (feedback, RL, etc.)
"""

from typing import Optional
from datetime import datetime
import uuid


class Orchestrator:
    """
    Orchestrateur principal du système Nyx.
    
    Coordonne tous les modules pour produire une réponse cohérente
    et maintenir l'état interne du système.
    """
    
    def __init__(self, config: dict):
        """
        Initialiser l'orchestrateur avec la configuration.
        
        Args:
            config: Dictionnaire de configuration complet
        """
        self.config = config
        
        # Initialiser les composants
        self._initialiser_composants()
        
        # État courant
        self.message_courant_id: Optional[str] = None
        self.contexte_conversation: list[dict] = []
    
    def _initialiser_composants(self):
        """Initialiser tous les composants du système."""
        from nyx.llm.ollama_client import OllamaClient
        from nyx.memory.vector_store import VectorStore
        from nyx.memory.graph_store import GraphStore
        from nyx.emotion.evaluator import EmotionEvaluator
        from nyx.regulation.amygdala import Amygdala
        from nyx.regulation.prefrontal import Prefrontal
        from nyx.hormones.hormonal_state import HormonalState
        from nyx.learning.feedback import FeedbackManager
        from nyx.persistence.event_logger import EventLogger
        
        # Client LLM
        self.llm_client = OllamaClient(
            base_url="http://localhost:11434",
            modele_defaut=self.config.get("llm", {}).get("modele_generation", "llama3.2:3b")
        )
        
        # Mémoire
        self.vector_store = VectorStore(self.config.get("memory", {}))
        self.graph_store = GraphStore(self.config.get("memory", {}))
        
        # Émotion
        self.emotion_evaluator = EmotionEvaluator(self.llm_client)
        
        # Régulation
        self.amygdale = Amygdala(self.config.get("regulation", {}))
        self.prefrontal = Prefrontal(self.config.get("regulation", {}))
        
        # Hormones
        self.etat_hormonal = HormonalState(self.config.get("hormones", {}))
        
        # Feedback
        self.feedback_manager = FeedbackManager()
        
        # Logger d'événements
        self.event_logger = EventLogger()
        
        print("  ✓ Composants initialisés")
    
    def traiter_message(self, message_utilisateur: str) -> str:
        """
        Traiter un message utilisateur et générer une réponse.
        
        Args:
            message_utilisateur: Le message de l'utilisateur
        
        Returns:
            La réponse générée par Nyx
        """
        # Générer un ID unique pour ce message
        self.message_courant_id = str(uuid.uuid4())
        timestamp = datetime.now()
        
        # 1. Analyser l'émotion du message
        emotion = self.emotion_evaluator.analyser_emotion(message_utilisateur)
        
        # 2. Mettre à jour l'état hormonal selon l'émotion
        self.etat_hormonal.mettre_a_jour_emotion(emotion)
        
        # 3. Vérifier l'état de stress (amygdale)
        niveau_stress = self.amygdale.evaluer_niveau_stress(emotion)
        
        # 4. Rechercher des souvenirs pertinents
        souvenirs_pertinents = self.vector_store.rechercher_pertinents(
            message_utilisateur,
            top_k=5
        )
        
        # 5. Construire le prompt contextuel
        prompt_systeme = self._construire_prompt_systeme(
            souvenirs_pertinents=souvenirs_pertinents,
            emotion_actuelle=emotion,
            niveau_stress=niveau_stress,
            etat_hormonal=self.etat_hormonal.etat_courant
        )
        
        # 6. Générer la réponse
        try:
            reponse = self.llm_client.generer(
                prompt=message_utilisateur,
                system_prompt=prompt_systeme,
                temperature=self.config.get("llm", {}).get("temperature", 0.7),
                max_tokens=self.config.get("llm", {}).get("max_tokens", 512)
            )
        except Exception as e:
            reponse = f"[Erreur de génération: {e}]"
        
        # 7. Créer un nouveau souvenir
        self.vector_store.ajouter_souvenir(
            texte=f"Utilisateur: {message_utilisateur}\nNyx: {reponse}",
            I0=0.9,  # Intensité initiale élevée pour les nouvelles interactions
            valence=emotion.get("valence", 0.0),
            metadata={
                "type": "interaction",
                "emotion": emotion,
                "niveau_stress": niveau_stress,
            }
        )
        
        # 8. Mettre à jour le graphe de traits si pertinent
        self._mettre_a_jour_graphe_traits(emotion)
        
        # 9. Logger l'événement
        self.event_logger.loguer_interaction(
            message_id=self.message_courant_id,
            message_utilisateur=message_utilisateur,
            reponse_nyx=reponse,
            emotion=emotion,
            niveau_stress=niveau_stress,
            souvenirs_utilises=[s["id"] for s in souvenirs_pertinents]
        )
        
        # 10. Ajouter au contexte de conversation
        self.contexte_conversation.append({
            "role": "user",
            "content": message_utilisateur,
            "timestamp": timestamp.isoformat()
        })
        self.contexte_conversation.append({
            "role": "assistant",
            "content": reponse,
            "timestamp": timestamp.isoformat(),
            "message_id": self.message_courant_id
        })
        
        # Garder le contexte limité
        if len(self.contexte_conversation) > 20:
            self.contexte_conversation = self.contexte_conversation[-20:]
        
        return reponse
    
    def enregistrer_feedback(self, message_id: str, positif: bool):
        """
        Enregistrer un feedback utilisateur sur une réponse.
        
        Args:
            message_id: ID du message concerné
            positif: True pour 👍, False pour 👎
        """
        self.feedback_manager.enregistrer_feedback(
            message_id=message_id,
            positif=positif,
            contexte={
                "etat_hormonal": self.etat_hormonal.etat_courant,
            }
        )
        
        # Mettre à jour les hormones selon le feedback
        if positif:
            self.etat_hormonal.ajuster("dopamine", +0.05)
        else:
            self.etat_hormonal.ajuster("cortisol", +0.03)
        
        self.event_logger.loguer_feedback(
            message_id=message_id,
            positif=positif
        )
    
    def _construire_prompt_systeme(
        self,
        souvenirs_pertinents: list[dict],
        emotion_actuelle: dict,
        niveau_stress: float,
        etat_hormonal: dict
    ) -> str:
        """
        Construire le prompt système avec tout le contexte.
        
        Args:
            souvenirs_pertinents: Liste des souvenirs récupérés
            emotion_actuelle: Émotion détectée dans le message
            niveau_stress: Niveau de stress actuel
            etat_hormonal: État hormonal courant
        
        Returns:
            Le prompt système complet
        """
        # Section souvenirs
        section_souvenirs = ""
        if souvenirs_pertinents:
            section_souvenirs = "\n\n📚 SOUVENIRS PERTINENTS:\n"
            for i, souvenir in enumerate(souvenirs_pertinents, 1):
                section_souvenirs += f"{i}. {souvenir['texte'][:100]}...\n"
        
        # Section état émotionnel
        section_emotion = (
            f"\n\n🧠 ÉTAT ÉMOTIONNEL ACTUEL:\n"
            f"- Valence: {emotion_actuelle.get('valence', 0):.2f}\n"
            f"- Arousal: {emotion_actuelle.get('arousal', 0):.2f}\n"
            f"- Stress: {niveau_stress:.2f}\n"
        )
        
        # Prompt système de base
        prompt_systeme = (
            "Tu es Nyx, un agent conversationnel avec mémoire persistante.\n"
            "Tu discutes naturellement avec l'utilisateur en tenant compte :\n"
            "- De tes souvenirs passés (ci-dessous)\n"
            "- De ton état émotionnel simulé\n"
            "- Du contexte de la conversation\n\n"
            "Sois naturel, empathique, et n'hésite pas à faire référence à vos échanges passés si pertinent.\n"
            "Si tu ne te souviens pas de quelque chose, dis-le simplement.\n"
            f"{section_souvenirs}"
            f"{section_emotion}"
        )
        
        return prompt_systeme
    
    def _mettre_a_jour_graphe_traits(self, emotion: dict):
        """
        Mettre à jour le graphe de traits selon l'émotion détectée.
        
        Args:
            emotion: Dictionnaire d'émotion avec valence/arousal
        """
        # Logique simplifiée pour l'instant
        # À implémenter complètement dans graph_store.py
        pass

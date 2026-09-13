"""
Évaluateur d'émotion du message utilisateur.

Ce module analyse l'émotion contenue dans un message texte.
Deux approches sont possibles :
A) Appel au LLM en mode structuré (JSON)
B) Classifieur appris sur embeddings (optionnel, à entraîner)
"""

from typing import Optional


class EmotionEvaluator:
    """
    Évalue l'émotion d'un message entrant.
    
    Retourne un dictionnaire avec :
    - valence: -1 (négatif) à 1 (positif)
    - arousal: 0 (calme) à 1 (excité)
    - emotion_dominante: nom de l'émotion principale
    - confiance: 0 à 1
    """
    
    def __init__(self, llm_client):
        """
        Initialiser l'évaluateur.
        
        Args:
            llm_client: Client Ollama pour l'analyse LLM
        """
        self.llm_client = llm_client
        self.classifieur = None  # Optionnel, à charger si entraîné
    
    def analyser_emotion(self, message: str) -> dict:
        """
        Analyser l'émotion d'un message.
        
        Args:
            message: Le message à analyser
        
        Returns:
            Dictionnaire d'émotion
        """
        # Approche A : LLM structuré (par défaut)
        return self._analyser_avec_llm(message)
    
    def _analyser_avec_llm(self, message: str) -> dict:
        """
        Utiliser le LLM pour analyser l'émotion en mode structuré.
        
        Args:
            message: Le message à analyser
        
        Returns:
            Dictionnaire d'émotion
        """
        system_prompt = (
            "Tu es un analyseur d'émotion. Analyse le message et retourne UNIQUEMENT un JSON valide.\n"
            "Format exact : {\"valence\": float, \"arousal\": float, \"emotion_dominante\": string, \"confiance\": float}\n"
            "valence: -1 (très négatif) à 1 (très positif)\n"
            "arousal: 0 (calme) à 1 (très excité/énervé)\n"
            "emotion_dominante: parmi [joie, tristesse, colere, peur, surprise, degout, neutre]\n"
            "confiance: 0 à 1\n"
            "Exemple: {\"valence\": 0.7, \"arousal\": 0.4, \"emotion_dominante\": \"joie\", \"confiance\": 0.85}"
        )
        
        format_json = {
            "type": "object",
            "properties": {
                "valence": {"type": "number"},
                "arousal": {"type": "number"},
                "emotion_dominante": {"type": "string"},
                "confiance": {"type": "number"}
            },
            "required": ["valence", "arousal", "emotion_dominante", "confiance"]
        }
        
        try:
            resultat = self.llm_client.generer_structuré(
                prompt=f"Analyse l'émotion de ce message : {message}",
                format_json=format_json,
                system_prompt=system_prompt
            )
            
            return {
                "valence": float(resultat.get("valence", 0)),
                "arousal": float(resultat.get("arousal", 0.5)),
                "emotion_dominante": resultat.get("emotion_dominante", "neutre"),
                "confiance": float(resultat.get("confiance", 0.5))
            }
        except Exception as e:
            # Fallback : analyse simplifiée par mots-clés
            print(f"⚠ Analyse LLM échouée, fallback mots-clés: {e}")
            return self._analyser_mots_cles(message)
    
    def _analyser_mots_cles(self, message: str) -> dict:
        """
        Analyse de secours par mots-clés (si LLM indisponible).
        
        Args:
            message: Le message à analyser
        
        Returns:
            Dictionnaire d'émotion approximatif
        """
        message_lower = message.lower()
        
        positifs = ["content", "heureux", "super", "génial", "merci", "aime", "bien", "oui", "cool", "excellent"]
        negatifs = ["triste", "fâché", "mal", "pas bien", "non", "déçu", "horrible", "déteste", "nul"]
        calmes = ["calme", "tranquille", "repos", "détendu", "paisible"]
        excites = ["excité", "énervé", "urgent", "vite", "stress", "panique"]
        
        score_positif = sum(1 for mot in positifs if mot in message_lower)
        score_negatif = sum(1 for mot in negatifs if mot in message_lower)
        score_calme = sum(1 for mot in calmes if mot in message_lower)
        score_excite = sum(1 for mot in excites if mot in message_lower)
        
        valence = (score_positif - score_negatif) / max(1, score_positif + score_negatif)
        arousal = score_excite / max(1, score_calme + score_excite)
        
        if score_positif > score_negatif:
            emotion = "joie" if arousal > 0.5 else "neutre"
        elif score_negatif > score_positif:
            emotion = "colere" if arousal > 0.5 else "tristesse"
        else:
            emotion = "neutre"
        
        return {
            "valence": valence,
            "arousal": arousal,
            "emotion_dominante": emotion,
            "confiance": 0.4  # Confiance faible pour cette méthode
        }

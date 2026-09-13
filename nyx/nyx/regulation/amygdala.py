"""
Module amygdale — Détection de menace et sensibilisation.

Ce module implémente la boucle de détection de stress/sensibilisation,
inspirée (comme métaphore de conception) du fonctionnement de l'amygdale.

Principe :
- Détecte les émotions négatives fortes
- Augmente progressivement la sensibilisation en cas de stress répété
- Influence la réactivité du système
"""

from typing import Optional


class Amygdala:
    """
    Simulation de l'amygdale pour la détection de stress.
    """
    
    def __init__(self, config: dict):
        """
        Initialiser l'amygdale.
        
        Args:
            config: Configuration de régulation
        """
        self.config = config
        self.seuil_sensibilisation = config.get("seuil_sensibilisation_amygdale", 0.7)
        self.taux_sensibilisation = config.get("taux_sensibilisation", 0.1)
        self.taux_desensibilisation = config.get("taux_desensibilisation", 0.05)
        
        # État courant
        self.niveau_stress = 0.5  # Niveau de stress actuel (0 à 1)
        self.sensibilisation = 0.0  # Degré de sensibilisation accumulé (0 à 1)
    
    def evaluer_niveau_stress(self, emotion: dict) -> float:
        """
        Évaluer le niveau de stress basé sur l'émotion détectée.
        
        Args:
            emotion: Dictionnaire d'émotion
        
        Returns:
            Niveau de stress (0 à 1)
        """
        valence = emotion.get("valence", 0)
        arousal = emotion.get("arousal", 0.5)
        emotion_dominante = emotion.get("emotion_dominante", "neutre")
        
        # Stress élevé pour émotions négatives + fort arousal
        if emotion_dominante in ("peur", "colere"):
            stress_detecte = 0.7 + 0.3 * arousal
        elif valence < -0.3:
            stress_detecte = 0.4 + 0.3 * abs(valence)
        elif arousal > 0.8 and valence < 0:
            stress_detecte = 0.5 + 0.2 * arousal
        else:
            stress_detecte = 0.2  # Stress de base faible
        
        # Mettre à jour le niveau de stress (lissage)
        self.niveau_stress = 0.7 * self.niveau_stress + 0.3 * stress_detecte
        
        # Vérifier la sensibilisation
        if self.niveau_stress > self.seuil_sensibilisation:
            self._sensibiliser()
        else:
            self._desensibiliser()
        
        return self.niveau_stress
    
    def _sensibiliser(self):
        """
        Augmenter la sensibilisation (stress répété).
        """
        self.sensibilisation = min(1.0, self.sensibilisation + self.taux_sensibilisation)
    
    def _desensibiliser(self):
        """
        Diminuer la sensibilisation (période calme).
        """
        self.sensibilisation = max(0.0, self.sensibilisation - self.taux_desensibilisation)
    
    def obtenir_facteur_reactivite(self) -> float:
        """
        Obtenir le facteur de réactivité basé sur la sensibilisation.
        
        Plus la sensibilisation est élevée, plus le système est réactif
        (potentiellement trop — analogue à l'hypervigilance).
        
        Returns:
            Facteur multiplicateur de réactivité (0.5 à 2.0)
        """
        # Base = 1.0, augmente avec la sensibilisation
        return 1.0 + self.sensibilisation
    
    def est_en_mode_defense(self) -> bool:
        """
        Vérifier si le système est en mode "défense" (stress élevé + sensibilisation).
        
        Returns:
            True si en mode défense
        """
        return self.niveau_stress > 0.6 and self.sensibilisation > 0.5
    
    def obtenir_etat(self) -> dict:
        """
        Obtenir l'état complet de l'amygdale.
        
        Returns:
            Dictionnaire avec niveau_stress et sensibilisation
        """
        return {
            "niveau_stress": round(self.niveau_stress, 3),
            "sensibilisation": round(self.sensibilisation, 3),
            "mode_defense": self.est_en_mode_defense(),
            "facteur_reactivite": round(self.obtenir_facteur_reactivite(), 3),
        }
    
    def reset(self):
        """
        Reset complet de l'amygdale.
        """
        self.niveau_stress = 0.5
        self.sensibilisation = 0.0

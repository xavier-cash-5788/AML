"""
Module cortex préfrontal — Régulation et contrôle.

Ce module implémente la boucle de régulation, inspirée (comme métaphore
de conception) du fonctionnement du cortex préfrontal.

Principe :
- Contrebalance l'amygdale (stress) par la régulation
- Gère le "gating" des habitudes (inhibition en cas de stress élevé)
- Applique un retour au calme progressif
"""

from typing import Optional


class Prefrontal:
    """
    Simulation du cortex préfrontal pour la régulation.
    """
    
    def __init__(self, config: dict):
        """
        Initialiser le préfrontal.
        
        Args:
            config: Configuration de régulation
        """
        self.config = config
        self.taux_recuperation = config.get("taux_recuperation_prefrontal", 0.05)
        self.facteur_attenuation = config.get("facteur_attenuation_stress", 0.3)
        
        # État courant
        self.force_regulation = 0.5  # Capacité de régulation (0 à 1)
        self.stress_perçu = 0.0  # Stress après régulation (0 à 1)
    
    def appliquer_regulation(self, niveau_stress_amygdale: float) -> float:
        """
        Appliquer la régulation sur le niveau de stress de l'amygdale.
        
        Args:
            niveau_stress_amygdale: Niveau de stress brut venant de l'amygdale
        
        Returns:
            Niveau de stress régulé (après atténuation)
        """
        # La force de régulation diminue quand le stress est trop élevé
        self.force_regulation = max(0.2, self.force_regulation - 0.1 * niveau_stress_amygdale)
        
        # Atténuation du stress proportionnelle à la force de régulation
        facteur_attenuation = self.facteur_attenuation * self.force_regulation
        self.stress_perçu = niveau_stress_amygdale * (1 - facteur_attenuation)
        
        return self.stress_perçu
    
    def recuperer(self):
        """
        Appliquer la récupération naturelle (retour au calme).
        
        À appeler périodiquement pour restaurer la capacité de régulation.
        """
        self.force_regulation = min(1.0, self.force_regulation + self.taux_recuperation)
        self.stress_perçu = max(0.0, self.stress_perçu - self.taux_recuperation)
    
    def peut_inhiber_habitude(self) -> bool:
        """
        Vérifier si le préfrontal a assez de force pour inhiber une habitude.
        
        Le "gating" des habitudes est désactivé quand le stress est trop élevé
        (analogue : sous stress fort, on agit de manière impulsive).
        
        Returns:
            True si le gating est actif
        """
        return self.force_regulation > 0.4 and self.stress_perçu < 0.6
    
    def obtenir_etat(self) -> dict:
        """
        Obtenir l'état complet du préfrontal.
        
        Returns:
            Dictionnaire avec force_regulation et stress_perçu
        """
        return {
            "force_regulation": round(self.force_regulation, 3),
            "stress_perçu": round(self.stress_perçu, 3),
            "gating_actif": self.peut_inhiber_habitude(),
        }
    
    def reset(self):
        """
        Reset complet du préfrontal.
        """
        self.force_regulation = 0.5
        self.stress_perçu = 0.0

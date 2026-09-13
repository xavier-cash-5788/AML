"""
État hormonal simulé.

Ce module gère les 5 "hormones" du système :
- Dopamine : reward, motivation, apprentissage
- Sérotonine : humeur, patience, confiance
- Adrénaline : vigilance, réactivité
- Cortisol : stress, mémoire négative
- Ocytocine : empathie, lien social

Ces hormones sont des métaphores de conception, pas des simulations biologiques.
"""

from typing import Optional


class HormonalState:
    """
    État hormonal courant du système.
    """
    
    def __init__(self, config: dict):
        """
        Initialiser l'état hormonal.
        
        Args:
            config: Configuration des hormones
        """
        self.config = config
        
        # Baselines
        self.baseline_dopamine = config.get("baseline_dopamine", 0.5)
        self.baseline_serotonine = config.get("baseline_serotonine", 0.5)
        self.baseline_adrenaline = config.get("baseline_adrenaline", 0.3)
        self.baseline_cortisol = config.get("baseline_cortisol", 0.3)
        self.baseline_ocytocine = config.get("baseline_ocytocine", 0.5)
        
        # Vitesses
        self.vitesse_montee = config.get("vitesse_montee", 0.1)
        self.vitesse_descente = config.get("vitesse_descente", 0.02)
        
        # État courant
        self.etat_courant = {
            "dopamine": self.baseline_dopamine,
            "serotonine": self.baseline_serotonine,
            "adrenaline": self.baseline_adrenaline,
            "cortisol": self.baseline_cortisol,
            "ocytocine": self.baseline_ocytocine,
        }
    
    def ajuster(self, hormone: str, delta: float):
        """
        Ajuster le niveau d'une hormone.
        
        Args:
            hormone: Nom de l'hormone
            delta: Variation (+ ou -)
        """
        if hormone not in self.etat_courant:
            print(f"⚠ Hormone inconnue: {hormone}")
            return
        
        # Appliquer le delta avec la vitesse appropriée
        if delta > 0:
            self.etat_courant[hormone] += delta * self.vitesse_montee
        else:
            self.etat_courant[hormone] += delta * self.vitesse_descente
        
        # Borner entre 0 et 1
        self.etat_courant[hormone] = max(0.0, min(1.0, self.etat_courant[hormone]))
    
    def mettre_a_jour_emotion(self, emotion: dict):
        """
        Mettre à jour les hormones selon l'émotion détectée.
        
        Args:
            emotion: Dictionnaire d'émotion (valence, arousal, emotion_dominante)
        """
        valence = emotion.get("valence", 0)
        arousal = emotion.get("arousal", 0.5)
        emotion_dominante = emotion.get("emotion_dominante", "neutre")
        
        # Dopamine : positive pour joie/surprise
        if emotion_dominante in ("joie", "surprise"):
            self.ajuster("dopamine", 0.1 * (1 + valence))
        elif emotion_dominante in ("tristesse", "degout"):
            self.ajuster("dopamine", -0.05)
        
        # Sérotonine : liée à la valence positive
        if valence > 0:
            self.ajuster("serotonine", 0.05 * valence)
        elif valence < 0:
            self.ajuster("serotonine", -0.03 * abs(valence))
        
        # Adrénaline : liée à l'arousal
        if arousal > 0.6:
            self.ajuster("adrenaline", 0.08 * arousal)
        elif arousal < 0.3:
            self.ajuster("adrenaline", -0.02)
        
        # Cortisol : stress, émotions négatives fortes
        if emotion_dominante in ("peur", "colere") or valence < -0.5:
            self.ajuster("cortisol", 0.1 * abs(valence))
        
        # Ocytocine : interactions sociales positives
        if emotion_dominante == "joie" and valence > 0.3:
            self.ajuster("ocytocine", 0.05 * valence)
    
    def appliquer_decay_naturel(self):
        """
        Appliquer le retour vers les baselines (decay naturel).
        
        À appeler périodiquement pour que les hormones retournent
        progressivement vers leurs niveaux de base.
        """
        for hormone in self.etat_courant:
            baseline = getattr(self, f"baseline_{hormone}", 0.5)
            actuelle = self.etat_courant[hormone]
            
            # Retour lent vers la baseline
            ecart = baseline - actuelle
            self.etat_courant[hormone] += ecart * self.vitesse_descente
            
            # Borner
            self.etat_courant[hormone] = max(0.0, min(1.0, self.etat_courant[hormone]))
    
    def obtenir_facteur(self, hormone: str) -> float:
        """
        Obtenir le facteur multiplicateur pour une hormone.
        
        Utile pour moduler d'autres processus (apprentissage, mémoire, etc.)
        
        Args:
            hormone: Nom de l'hormone
        
        Returns:
            Facteur multiplicateur (typiquement 0.5 à 1.5)
        """
        niveau = self.etat_courant.get(hormone, 0.5)
        baseline = getattr(self, f"baseline_{hormone}", 0.5)
        
        if baseline == 0:
            return 1.0
        
        # Ratio par rapport à la baseline
        return niveau / baseline
    
    def obtenir_resume(self) -> dict:
        """
        Obtenir un résumé de l'état hormonal.
        
        Returns:
            Dictionnaire avec les niveaux et écarts par rapport aux baselines
        """
        resume = {}
        for hormone, niveau in self.etat_courant.items():
            baseline = getattr(self, f"baseline_{hormone}", 0.5)
            resume[hormone] = {
                "niveau": round(niveau, 3),
                "baseline": baseline,
                "ecart": round(niveau - baseline, 3),
            }
        return resume

"""
Module de calcul de decay (décroissance exponentielle).

Ce module implémente les formules de decay exponentiel pour la mémoire.
C'est l'un des modules les plus solides du prototype v1, conservé et amélioré.

Formule principale : F(t) = I₀ × e^(-λt)

Où λ varie selon la valence émotionnelle :
- λ neutre : taux de base
- λ positif : plus lent (les souvenirs positifs persistent plus longtemps)
- λ négatif : plus rapide (mécanisme de protection contre les ruminations)
"""

from nyx.core.math_utils import clamp01, force_decay


def calculer_decay_lambda(valence: float, config: dict) -> float:
    """
    Calculer le taux de decay lambda en fonction de la valence émotionnelle.
    
    Args:
        valence: Valence émotionnelle du souvenir (-1 à 1)
        config: Dictionnaire de configuration contenant :
            - decay_lambda_neutre: Taux de base
            - decay_lambda_positif: Taux pour valence positive
            - decay_lambda_negatif: Taux pour valence négative
    
    Returns:
        Le taux de decay lambda approprié
    """
    lambda_neutre = config.get("decay_lambda_neutre", 0.01)
    lambda_positif = config.get("decay_lambda_positif", 0.005)
    lambda_negatif = config.get("decay_lambda_negatif", 0.02)
    
    if valence > 0.2:
        return lambda_positif
    elif valence < -0.2:
        return lambda_negatif
    else:
        return lambda_neutre


def calculer_force_actuelle(
    I0: float,
    valence: float,
    temps_ecoule: float,
    config: dict
) -> float:
    """
    Calculer la force actuelle d'un souvenir.
    
    Combinaison de :
    - L'intensité initiale I₀
    - La valence émotionnelle (qui détermine lambda)
    - Le temps écoulé depuis la création
    
    Args:
        I0: Intensité initiale du souvenir
        valence: Valence émotionnelle (-1 à 1)
        temps_ecoule: Temps écoulé (en heures, ou unité cohérente avec la config)
        config: Configuration du système
    
    Returns:
        Force actuelle du souvenir (entre 0 et 1)
    """
    lambda_decay = calculer_decay_lambda(valence, config)
    return force_decay(I0, lambda_decay, temps_ecoule)


def calculer_temps_avant_oubli(
    I0: float,
    valence: float,
    seuil_oubli: float,
    config: dict
) -> float:
    """
    Calculer le temps restant avant qu'un souvenir tombe sous le seuil d'oubli.
    
    Formule inversée : t = -ln(seuil / I₀) / λ
    
    Args:
        I0: Intensité initiale du souvenir
        valence: Valence émotionnelle (-1 à 1)
        seuil_oubli: Seuil en dessous duquel le souvenir est considéré oublié
        config: Configuration du système
    
    Returns:
        Temps estimé avant oubli (dans la même unité que lambda)
        Retourne float('inf') si le souvenir ne décroît jamais sous le seuil
    """
    if I0 <= seuil_oubli:
        return 0.0
    
    lambda_decay = calculer_decay_lambda(valence, config)
    
    if lambda_decay <= 0:
        return float('inf')
    
    try:
        import math
        return -math.log(seuil_oubli / I0) / lambda_decay
    except (ValueError, ZeroDivisionError):
        return float('inf')


def appliquer_homéostasie_trait(
    valeur_actuelle: float,
    cible_homeostase: float,
    facteur_retour: float
) -> float:
    """
    Appliquer un retour à l'homéostasie pour un trait de personnalité.
    
    Les traits tendent naturellement vers leur valeur d'homéostasie
    quand ils ne sont pas activés.
    
    Args:
        valeur_actuelle: Valeur actuelle du trait (0 à 1)
        cible_homeostase: Valeur cible d'homéostasie (typiquement 0.5)
        facteur_retour: Vitesse de retour à l'homéostasie (0 à 1)
    
    Returns:
        Nouvelle valeur du trait après retour à l'homéostasie
    """
    écart = cible_homeostase - valeur_actuelle
    return clamp01(valeur_actuelle + écart * facteur_retour)

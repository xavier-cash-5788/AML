"""
Utilitaires mathématiques et fonctions pures.

Ce module contient les fonctions de base utilisées dans tout le système :
- clamp, clamp01 : bornage de valeurs
- fmt_bytes : formatage de taille mémoire
- formules de decay exponentiel
"""

import math
from typing import Union

Number = Union[int, float]


def clamp(value: Number, min_val: Number, max_val: Number) -> Number:
    """
    Borner une valeur entre min_val et max_val.
    
    Args:
        value: La valeur à borner
        min_val: La borne inférieure
        max_val: La borne supérieure
    
    Returns:
        La valeur bornée
    """
    return max(min_val, min(value, max_val))


def clamp01(value: Number) -> Number:
    """
    Borner une valeur entre 0 et 1.
    
    Utile pour les normalisations, probabilités, etc.
    """
    return clamp(value, 0, 1)


def fmt_bytes(octets: int) -> str:
    """
    Formater une taille en octets en chaîne lisible.
    
    Exemples:
        512 -> "512 o"
        1536 -> "1.5 Ko"
        524288 -> "512.0 Ko"
        1048576 -> "1.0 Mo"
    """
    if octets < 1024:
        return f"{octets} o"
    elif octets < 1024 * 1024:
        return f"{octets / 1024:.1f} Ko"
    elif octets < 1024 * 1024 * 1024:
        return f"{octets / (1024 * 1024):.1f} Mo"
    else:
        return f"{octets / (1024 * 1024 * 1024):.1f} Go"


def force_decay(I0: float, lambda_decay: float, t: float) -> float:
    """
    Calculer la force actuelle d'un souvenir après décroissance exponentielle.
    
    Formule : F(t) = I₀ × e^(-λt)
    
    Où :
        I₀ : intensité initiale du souvenir
        λ : taux de décroissance (lambda)
        t : temps écoulé (en unités cohérentes avec lambda)
    
    Args:
        I0: Intensité initiale (entre 0 et 1)
        lambda_decay: Taux de décroissance (positif)
        t: Temps écoulé
    
    Returns:
        Force actuelle du souvenir (entre 0 et 1)
    """
    if I0 <= 0:
        return 0.0
    return clamp01(I0 * math.exp(-lambda_decay * t))


def similarite_cosinus(vec_a: list[float], vec_b: list[float]) -> float:
    """
    Calculer la similarité cosinus entre deux vecteurs.
    
    Args:
        vec_a: Premier vecteur
        vec_b: Second vecteur
    
    Returns:
        Similarité cosinus (entre -1 et 1, typiquement ramené à 0-1 pour embeddings)
    """
    if len(vec_a) != len(vec_b):
        raise ValueError("Les vecteurs doivent avoir la même dimension")
    
    produit_scalaire = sum(a * b for a, b in zip(vec_a, vec_b))
    norme_a = math.sqrt(sum(a * a for a in vec_a))
    norme_b = math.sqrt(sum(b * b for b in vec_b))
    
    if norme_a == 0 or norme_b == 0:
        return 0.0
    
    return produit_scalaire / (norme_a * norme_b)

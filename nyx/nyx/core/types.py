"""
Types de données partagés dans tout le projet Nyx.

Ce module définit les dataclasses et TypedDict utilisées pour structurer
les données échangées entre les différents sous-systèmes.
"""

from dataclasses import dataclass, field
from typing import Optional
from datetime import datetime


@dataclass
class Souvenir:
    """
    Un souvenir épisodique dans la mémoire vectorielle.
    
    Attributes:
        id: Identifiant unique du souvenir
        texte: Le contenu textuel du souvenir
        embedding: Le vecteur d'embedding (liste de floats)
        I0: Intensité initiale (au moment de la création)
        valence: Valence émotionnelle (-1 à 1)
        timestamp_creation: Date de création du souvenir
        last_access: Dernier accès au souvenir (pour le calcul du temps écoulé)
        metadata: Métadonnées optionnelles (contexte, source, etc.)
    """
    id: str
    texte: str
    embedding: list[float]
    I0: float
    valence: float = 0.0
    timestamp_creation: datetime = field(default_factory=datetime.now)
    last_access: datetime = field(default_factory=datetime.now)
    metadata: dict = field(default_factory=dict)
    
    def to_dict(self) -> dict:
        """Sérialiser en dictionnaire pour stockage JSON."""
        return {
            "id": self.id,
            "texte": self.texte,
            "embedding": self.embedding,
            "I0": self.I0,
            "valence": self.valence,
            "timestamp_creation": self.timestamp_creation.isoformat(),
            "last_access": self.last_access.isoformat(),
            "metadata": self.metadata,
        }
    
    @classmethod
    def from_dict(cls, data: dict) -> "Souvenir":
        """Désérialiser depuis un dictionnaire JSON."""
        return cls(
            id=data["id"],
            texte=data["texte"],
            embedding=data["embedding"],
            I0=data["I0"],
            valence=data.get("valence", 0.0),
            timestamp_creation=datetime.fromisoformat(data["timestamp_creation"]),
            last_access=datetime.fromisoformat(data["last_access"]),
            metadata=data.get("metadata", {}),
        )


@dataclass
class TraitNode:
    """
    Un nœud dans le graphe de traits de personnalité.
    
    Attributes:
        id: Identifiant unique du trait
        nom: Nom lisible du trait (ex: "Curiosité intellectuelle")
        valeur: Valeur actuelle du trait (0 à 1)
        description: Description du trait
        last_activation: Dernière activation du trait
    """
    id: str
    nom: str
    valeur: float
    description: str = ""
    last_activation: datetime = field(default_factory=datetime.now)
    
    def to_dict(self) -> dict:
        """Sérialiser en dictionnaire pour stockage JSON."""
        return {
            "id": self.id,
            "nom": self.nom,
            "valeur": self.valeur,
            "description": self.description,
            "last_activation": self.last_activation.isoformat(),
        }
    
    @classmethod
    def from_dict(cls, data: dict) -> "TraitNode":
        """Désérialiser depuis un dictionnaire JSON."""
        return cls(
            id=data["id"],
            nom=data["nom"],
            valeur=data["valeur"],
            description=data.get("description", ""),
            last_activation=datetime.fromisoformat(data["last_activation"]),
        )


@dataclass
class TraitEdge:
    """
    Une arête dans le graphe de traits (co-activation entre deux traits).
    
    Attributes:
        source: ID du trait source
        cible: ID du trait cible
        force: Force de la connexion (0 à 1)
        last_coactivation: Dernière co-activation des deux traits
    """
    source: str
    cible: str
    force: float
    last_coactivation: datetime = field(default_factory=datetime.now)
    
    def to_dict(self) -> dict:
        """Sérialiser en dictionnaire pour stockage JSON."""
        return {
            "source": self.source,
            "cible": self.cible,
            "force": self.force,
            "last_coactivation": self.last_coactivation.isoformat(),
        }
    
    @classmethod
    def from_dict(cls, data: dict) -> "TraitEdge":
        """Désérialiser depuis un dictionnaire JSON."""
        return cls(
            source=data["source"],
            cible=data["cible"],
            force=data["force"],
            last_coactivation=datetime.fromisoformat(data["last_coactivation"]),
        )


@dataclass
class FaitSemantique:
    """
    Un fait sémantique extrait par compression de souvenirs.
    
    Attributes:
        id: Identifiant unique
        contenu: Le fait sous forme textuelle
        embedding_latent: Vecteur latent (après encodage par auto-encodeur)
        sources: Liste des IDs de souvenirs qui ont contribué à ce fait
        confiance: Niveau de confiance dans ce fait (0 à 1)
    """
    id: str
    contenu: str
    embedding_latent: list[float]
    sources: list[str] = field(default_factory=list)
    confiance: float = 0.5
    
    def to_dict(self) -> dict:
        """Sérialiser en dictionnaire pour stockage JSON."""
        return {
            "id": self.id,
            "contenu": self.contenu,
            "embedding_latent": self.embedding_latent,
            "sources": self.sources,
            "confiance": self.confiance,
        }
    
    @classmethod
    def from_dict(cls, data: dict) -> "FaitSemantique":
        """Désérialiser depuis un dictionnaire JSON."""
        return cls(
            id=data["id"],
            contenu=data["contenu"],
            embedding_latent=data["embedding_latent"],
            sources=data.get("sources", []),
            confiance=data.get("confiance", 0.5),
        )


@dataclass
class FeedbackEntry:
    """
    Une entrée dans le journal de feedback humain.
    
    Attributes:
        id: Identifiant unique
        timestamp: Date du feedback
        message_id: ID du message concerné
        positif: True si 👍, False si 👎
        contexte: Contexte optionnel (état du système au moment du feedback)
    """
    id: str
    timestamp: datetime
    message_id: str
    positif: bool
    contexte: dict = field(default_factory=dict)
    
    def to_dict(self) -> dict:
        """Sérialiser en dictionnaire pour stockage JSON."""
        return {
            "id": self.id,
            "timestamp": self.timestamp.isoformat(),
            "message_id": self.message_id,
            "positif": self.positif,
            "contexte": self.contexte,
        }
    
    @classmethod
    def from_dict(cls, data: dict) -> "FeedbackEntry":
        """Désérialiser depuis un dictionnaire JSON."""
        return cls(
            id=data["id"],
            timestamp=datetime.fromisoformat(data["timestamp"]),
            message_id=data["message_id"],
            positif=data["positif"],
            contexte=data.get("contexte", {}),
        )

"""
Client pour appeler Ollama en local.

Ce module gère :
- Les appels de génération de texte (LLM)
- Les appels d'embedding (nomic-embed-text)
- Le cache local des embeddings pour éviter les appels redondants
"""

import requests
import json
from typing import Optional
from pathlib import Path


class OllamaClient:
    """
    Client HTTP pour interagir avec l'API Ollama locale.
    """
    
    def __init__(self, base_url: str = "http://localhost:11434", modele_defaut: str = "llama3.2:3b"):
        """
        Initialiser le client Ollama.
        
        Args:
            base_url: URL de base de l'API Ollama
            modele_defaut: Modèle par défaut pour la génération
        """
        self.base_url = base_url.rstrip('/')
        self.modele_defaut = modele_defaut
        self.cache_embeddings: dict[str, list[float]] = {}
        self._charger_cache_embeddings()
    
    def _charger_cache_embeddings(self):
        """Charger le cache d'embeddings depuis le disque si disponible."""
        cache_path = Path("data/cache_embeddings.json")
        if cache_path.exists():
            try:
                with open(cache_path, 'r', encoding='utf-8') as f:
                    self.cache_embeddings = json.load(f)
            except (json.JSONDecodeError, IOError):
                self.cache_embeddings = {}
    
    def _sauvegarder_cache_embeddings(self):
        """Sauvegarder le cache d'embeddings sur le disque."""
        cache_path = Path("data/cache_embeddings.json")
        cache_path.parent.mkdir(parents=True, exist_ok=True)
        try:
            with open(cache_path, 'w', encoding='utf-8') as f:
                json.dump(self.cache_embeddings, f, ensure_ascii=False)
        except IOError as e:
            print(f"Attention: impossible de sauvegarder le cache embeddings: {e}")
    
    def generer(
        self,
        prompt: str,
        modele: Optional[str] = None,
        temperature: float = 0.7,
        max_tokens: int = 512,
        system_prompt: Optional[str] = None
    ) -> str:
        """
        Générer une réponse avec le LLM.
        
        Args:
            prompt: Le prompt utilisateur
            modele: Modèle à utiliser (par défaut: modele_defaut)
            temperature: Température de génération (0.0 à 1.0)
            max_tokens: Nombre maximum de tokens en sortie
            system_prompt: Prompt système optionnel
        
        Returns:
            La réponse générée par le LLM
        """
        url = f"{self.base_url}/api/generate"
        
        payload = {
            "model": modele or self.modele_defaut,
            "prompt": prompt,
            "stream": False,
            "options": {
                "temperature": temperature,
                "num_predict": max_tokens,
            }
        }
        
        if system_prompt:
            payload["system"] = system_prompt
        
        try:
            response = requests.post(url, json=payload, timeout=60)
            response.raise_for_status()
            result = response.json()
            return result.get("response", "")
        except requests.exceptions.RequestException as e:
            raise RuntimeError(f"Erreur lors de l'appel à Ollama: {e}")
    
    def generer_structuré(
        self,
        prompt: str,
        format_json: dict,
        modele: Optional[str] = None,
        system_prompt: Optional[str] = None
    ) -> dict:
        """
        Générer une réponse structurée en JSON.
        
        Args:
            prompt: Le prompt utilisateur
            format_json: Schéma JSON attendu (format Ollama)
            modele: Modèle à utiliser
            system_prompt: Prompt système optionnel
        
        Returns:
            La réponse parsed comme dictionnaire
        """
        url = f"{self.base_url}/api/generate"
        
        payload = {
            "model": modele or self.modele_defaut,
            "prompt": prompt,
            "stream": False,
            "format": format_json,
        }
        
        if system_prompt:
            payload["system"] = system_prompt
        
        try:
            response = requests.post(url, json=payload, timeout=60)
            response.raise_for_status()
            result = response.json()
            reponse_texte = result.get("response", "{}")
            return json.loads(reponse_texte)
        except (requests.exceptions.RequestException, json.JSONDecodeError) as e:
            raise RuntimeError(f"Erreur lors de la génération structurée: {e}")
    
    def embed(self, texte: str, modele: str = "nomic-embed-text") -> list[float]:
        """
        Obtenir l'embedding d'un texte.
        
        Utilise un cache local pour éviter de recalculer les embeddings
        pour des textes identiques.
        
        Args:
            texte: Le texte à embedder
            modele: Modèle d'embedding à utiliser
        
        Returns:
            Le vecteur d'embedding (liste de floats)
        """
        # Vérifier le cache
        cache_key = f"{modele}:{texte}"
        if cache_key in self.cache_embeddings:
            return self.cache_embeddings[cache_key]
        
        url = f"{self.base_url}/api/embeddings"
        
        payload = {
            "model": modele,
            "prompt": texte,
        }
        
        try:
            response = requests.post(url, json=payload, timeout=60)
            response.raise_for_status()
            result = response.json()
            embedding = result.get("embedding", [])
            
            # Mettre en cache
            self.cache_embeddings[cache_key] = embedding
            self._sauvegarder_cache_embeddings()
            
            return embedding
        except requests.exceptions.RequestException as e:
            raise RuntimeError(f"Erreur lors de l'embedding: {e}")
    
    def verifier_modeles_disponibles(self) -> list[str]:
        """
        Vérifier quels modèles sont disponibles localement.
        
        Returns:
            Liste des noms de modèles disponibles
        """
        url = f"{self.base_url}/api/tags"
        
        try:
            response = requests.get(url, timeout=10)
            response.raise_for_status()
            result = response.json()
            return [modele["name"] for modele in result.get("models", [])]
        except requests.exceptions.RequestException:
            return []
    
    def est_disponible(self) -> bool:
        """
        Vérifier si le serveur Ollama est accessible.
        
        Returns:
            True si Ollama répond, False sinon
        """
        try:
            response = requests.get(f"{self.base_url}/api/tags", timeout=5)
            return response.status_code == 200
        except requests.exceptions.RequestException:
            return False

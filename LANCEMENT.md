# 🚀 Comment lancer Nyx sur Ubuntu

## Prérequis

### 1. Installer Ollama

Ollama est le moteur LLM local requis par Nyx.

```bash
# Télécharger et installer Ollama
curl -fsSL https://ollama.com/install.sh | sh

# Vérifier l'installation
ollama --version
```

### 2. Lancer le serveur Ollama

```bash
# Démarrer le serveur Ollama (en arrière-plan)
ollama serve &

# Ou dans un nouvel onglet de terminal
ollama serve
```

### 3. Télécharger les modèles requis

```bash
# Modèle de génération de texte
ollama pull llama3.2:3b

# Modèle d'embedding (pour la mémoire sémantique)
ollama pull nomic-embed-text
```

---

## Installation de Nyx

### 1. Créer un environnement virtuel (recommandé)

```bash
cd /workspace
python3 -m venv .venv
source .venv/bin/activate
```

### 2. Installer les dépendances

```bash
pip install -r requirements.txt
```

> ⏱️ **Note :** L'installation de `torch` peut prendre plusieurs minutes selon votre connexion.

---

## Lancer Nyx

### Option 1 : Interface en ligne de commande (CLI)

```bash
cd /workspace
PYTHONPATH=/workspace/nyx:$PYTHONPATH python -m nyx.main
```

Ou plus simplement :

```bash
cd /workspace/nyx
python -m nyx.main
```

### Option 2 : Utiliser le script run.py

```bash
cd /workspace
python scripts/run.py --mode cli
```

---

## Commandes utiles

### Vérifier qu'Ollama fonctionne

```bash
# Tester la connexion au serveur
curl http://localhost:11434/api/tags

# Tester un modèle
ollama run llama3.2:3b "Bonjour"
```

### Gérer l'environnement virtuel

```bash
# Activer l'environnement
source .venv/bin/activate

# Désactiver l'environnement
deactivate
```

### Scripts utilitaires

```bash
# Réinitialiser la mémoire (attention : destructif !)
python scripts/reset_memory.py

# Exporter l'historique des conversations
python scripts/export_journal.py

# Entraîner le classifieur émotionnel
python scripts/train_classifier.py

# Lancer un cycle de neuro-évolution
python scripts/run_evolution_cycle.py
```

---

## Dépannage

### Erreur : "Ollama ne semble pas accessible"

1. Vérifiez que le serveur Ollama tourne :
   ```bash
   ps aux | grep ollama
   ```

2. Redémarrez Ollama :
   ```bash
   pkill ollama
   ollama serve &
   ```

3. Vérifiez le port (par défaut 11434) :
   ```bash
   netstat -tlnp | grep 11434
   ```

### Erreur : "ModuleNotFoundError"

Réinstallez les dépendances :
```bash
source .venv/bin/activate
pip install -r requirements.txt --force-reinstall
```

### Erreur : "Modèle non disponible"

Téléchargez les modèles manquants :
```bash
ollama pull llama3.2:3b
ollama pull nomic-embed-text
```

---

## Structure rapide

```
/workspace/
├── config/              # Fichiers de configuration JSON
├── data/                # Données persistantes (mémoire, feedback, etc.)
├── nyx/                 # Code source principal
│   └── nyx/            # Package Python
│       ├── main.py     # Point d'entrée CLI
│       └── ...         # Modules (memory, emotion, learning, etc.)
├── scripts/             # Scripts utilitaires
├── interface/           # Interface web (optionnelle)
└── requirements.txt     # Dépendances Python
```

---

## Premier usage

1. Lancez Nyx comme décrit ci-dessus
2. Parlez naturellement avec l'agent
3. Utilisez 👍 / 👎 pour donner du feedback sur les réponses
4. Tapez `quit` ou `exit` pour quitter

Le feedback (👍/👎) est **essentiel** : c'est la seule source de vérité pour l'apprentissage du système.

---

## Configuration personnalisée

Pour modifier le comportement de Nyx, éditez `config/user_config.json` :

```json
{
  "interface": {
    "mode": "cli"
  },
  "memory": {
    "decay_lambda_neutre": 0.02
  },
  "llm": {
    "modele_generation": "llama3.1:8b"
  }
}
```

Ne modifiez **jamais** `default_config.json` directement.

---

## Ressources

- `README.md` — Vue d'ensemble et philosophie du projet
- `docs/ARCHITECTURE.md` — Détails techniques de chaque module
- `docs/AUDIT_V1.md` — Analyse du prototype précédent
- `config/` — Tous les fichiers de configuration

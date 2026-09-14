# Nyx

Système de mémoire conversationnelle locale, avec graphe de traits persistant, régulation émotionnelle simulée, et apprentissage par feedback humain.

100% local. Python. Stockage JSON. Aucune dépendance cloud.

---

## Ce que Nyx est

Nyx est un agent conversationnel construit autour d'un LLM local (via Ollama), entouré de plusieurs couches de traitement qui :

- **retiennent** des souvenirs sous forme de vecteurs sémantiques, avec un mécanisme d'oubli progressif (decay exponentiel) et de consolidation (promotion vers un graphe permanent) ;
- **modélisent** une dynamique de traits de personnalité qui évoluent avec l'usage (graphe de nœuds/arêtes, homéostasie, co-activation) ;
- **régulent** la réactivité du système selon une boucle inspirée (au sens de métaphore de conception, voir plus bas) de l'amygdale et du cortex préfrontal ;
- **apprennent** de manière continue via trois mécanismes complémentaires : compression (auto-encodeur), ajustement des hyperparamètres (neuro-évolution), et calibration du taux d'apprentissage (méta-apprentissage) ;
- **s'améliorent** à partir d'un signal de retour explicite et non ambigu : deux boutons, 👍 et 👎, sur chaque réponse.

Le projet est la suite d'un premier prototype (nom de code "Mnémosyne", en TypeScript/React) qui a fait l'objet d'un audit complet de son code source. Cet audit a révélé un écart important entre le vocabulaire employé dans le code (amygdale, hormones, ADN primitif, conscience) et les mécanismes réellement implémentés (majoritairement du comptage de mots-clés et des seuils numériques fixes). Nyx est une reconstruction qui garde les parties de cette première version jugées solides à l'examen, et remplace celles qui ne l'étaient pas.

## Ce que Nyx n'est pas

Ce point mérite d'être écrit noir sur blanc, dans le fichier le plus visible du projet, plutôt que découvert plus tard :

- **Nyx n'est pas une preuve, ni une tentative de preuve, de conscience artificielle.** Les modules de ce projet (régulation, hormones, graphe de traits) sont des mécanismes d'ingénierie inspirés de concepts issus des neurosciences et de la psychologie, utilisés comme métaphores de conception utiles pour structurer un comportement cohérent — pas comme des simulations fidèles de processus biologiques, et encore moins comme la preuve d'un vécu subjectif chez le système.
- **Les noms des variables et des modules ne garantissent pas la sophistication du mécanisme sous-jacent.** Un trait nommé "peur de l'abandon" est un nombre flottant entre 0 et 1, modifié par des règles explicites et lisibles dans le code — pas une expérience de peur. Cette distinction est documentée en détail dans `docs/AUDIT_V1.md`.
- **Nyx ne remplace pas un professionnel de santé mentale**, que ce soit pour l'utilisateur ou par la simulation d'un quelconque état émotionnel du système lui-même.

Si un module ou un log donne l'impression contraire, c'est une question de formulation à corriger, pas une caractéristique voulue du système.

## Pourquoi documenter ça dans le README plutôt que le taire

Un projet de cette nature — mémoire persistante, traits qui évoluent, régulation émotionnelle simulée — produit naturellement des sorties qui *paraissent* évoquer un vécu intérieur, simplement parce que le LLM sous-jacent est très bon pour générer du texte cohérent avec n'importe quel contexte qu'on lui injecte. Documenter cette limite dès le README, plutôt que de laisser le mystère s'installer au fil de l'usage, est une décision de conception à part entière, pas une formalité.

---

## Installation

### Prérequis

- Python 3.11 ou supérieur
- [Ollama](https://ollama.com) installé et lancé localement
- Les modèles suivants tirés via Ollama :

```bash
ollama pull llama3.2:3b
ollama pull nomic-embed-text
```

### Installation du projet

```bash
git clone <url-du-depot> nyx
cd nyx
python -m venv .venv
source .venv/bin/activate   # ou .venv\Scripts\activate sous Windows
pip install -r requirements.txt
```

### Premier lancement

```bash
python -m nyx.main
```

Au premier lancement, Nyx charge `config/default_config.json` et `config/primitive_seed.json`, initialise les fichiers vides dans `data/`, et démarre soit l'interface en ligne de commande, soit l'interface web, selon la configuration choisie dans `config/user_config.json`.

### Configuration personnalisée

Ne jamais modifier `config/default_config.json` directement. Créer ou éditer `config/user_config.json` avec uniquement les clés à surcharger, par exemple :

```json
{
  "llm": {
    "modele_generation": "llama3.1:8b"
  },
  "memory": {
    "decay_lambda_neutre": 0.02
  }
}
```

---

## Structure du projet

```
nyx/
├── config/          # Fichiers de configuration JSON
├── data/            # Toutes les données persistantes (souvenirs, graphe, logs...)
├── nyx/             # Package Python — toute la logique
├── interface/       # Couche de présentation (CLI, web)
├── scripts/         # Tâches ponctuelles (entraînement, maintenance, reset)
└── tests/           # Tests unitaires
```

Le détail complet de chaque fichier et son rôle est dans `docs/ARCHITECTURE.md`.

---

## Le signal de feedback (👍 / 👎)

C'est le mécanisme le plus important du projet. Chaque réponse affichée peut être marquée 👍 ou 👎. Ce jugement explicite est la **seule** source de vérité utilisée pour :

- mettre à jour le Q-learning des habitudes (`nyx/learning/reinforcement.py`)
- calibrer l'erreur de prédiction émotionnelle (`nyx/prediction/rpe_engine.py`)
- alimenter la fonction de fitness de la neuro-évolution des hyperparamètres (`nyx/learning/evolution.py`)

Sans ce signal, ces trois mécanismes n'ont aucune donnée de qualité pour s'améliorer — c'était précisément la faiblesse identifiée dans la version précédente du projet, où le signal de récompense était dérivé indirectement d'un comptage de mots-clés sur le message de l'utilisateur, sans jamais lui demander explicitement son avis.

---

## Documentation complémentaire

- `docs/ARCHITECTURE.md` — détail de chaque module et fichier
- `docs/AUDIT_V1.md` — compte-rendu de l'audit du prototype précédent, module par module
- `docs/CONFIG_REFERENCE.md` — explication de chaque paramètre de configuration
- `docs/FAISABILITE_APPRENTISSAGE.md` — notes honnêtes sur ce que la compression, la neuro-évolution et le méta-apprentissage peuvent réellement accomplir à l'échelle d'un seul utilisateur, et où ces techniques ont dû être adaptées par rapport à leur définition académique standard

## Licence

CC BY-NC-ND : Permet uniquement de partager l'œuvre originale sans modification ni utilisation commerciale.

## État du projet

En reconstruction active depuis l'audit du prototype "Mnémosyne" (septembre 2026). Les modules listés dans `docs/ARCHITECTURE.md` sont en cours d'implémentation progressive, dans l'ordre du plan de mise en œuvre défini dans ce même document.

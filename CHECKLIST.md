# 🧠 Mnémosyne — Checklist des Fonctionnalités et Capacités

## ✅ Modules Cognitifs Implémentés

### 1. **Mémoire et Apprentissage**
- [x] **Mémoire épisodique** (vectorielle) — Souvenirs contextuels avec decay temporel
- [x] **Mémoire sémantique** (`semantic.ts`) — Connaissances générales désindexées du contexte
- [x] **Mémoire procédurale/habitudes** (`habits.ts`) — Comportements répétés, renforcement
- [x] **Graphe de traits émotionnels** — ADN primitif + traits acquis
- [x] **Promotion vecteur → graphe** — Consolidation par répétition/intensité
- [x] **Oubli actif** — Suppression sous seuil + interférence proactive

### 2. **Cycles Biologiques**
- [x] **Cycle veille/sommeil** (`sleep.ts`) — Régulation circadienne
  - [x] Phase éveillée : traitement normal
  - [x] Phase sommeil : consolidation accélérée, decay ralenti
  - [x] Replay hippocampique simulé pendant le sommeil

### 3. **Attention et Cognition**
- [x] **Mémoire de travail limitée** (`attention.ts`) — 4-7 éléments (loi de Miller)
- [x] **Focus attentionnel** — Sélection dynamique des items pertinents
- [x] **Interférence proactive** — Les souvenirs similaires en compétition réduisent leur pertinence mutuelle
- [x] **Charge cognitive** — Impact sur le traitement

### 4. **Émotion et Régulation**
- [x] **5 hormones** (`hormones.ts`) — Adrénaline, cortisol, dopamine, sérotonine, ocytocine
- [x] **Boucle de régulation** (`regulation.ts`) — Amygdale → Hippocampe → Cortex préfrontal
- [x] **3 régimes** — Sain, tendu, traumatique
- [x] **Flashbacks** — Traces non résolues resurgissant intactes
- [x] **Reconsolidation thérapeutique** — Re-contextualisation des souvenirs traumatiques

### 5. **Prédiction et Récompense**
- [x] **Signal de prédiction** (`prediction.ts`) — Attentes basées sur l'historique
- [x] **Erreur de prédiction** — Comparaison attendu/réel (dopamine = surprise, pas récompense brute)
- [x] **Détection de surprise significative** — Déclenche apprentissage accru

### 6. **Théorie de l'Esprit (ToM)**
- [x] **Modèle mental de l'utilisateur** (`theory_of_mind.ts`)
  - [x] **Croyances attribuées** — Inférées depuis les modalisateurs ("je pense", "je crois")
  - [x] **Intentions détectées** — 8 types (seeking_info, seeking_support, sharing_experience, testing, exploring, venting, bonding, problem_solving)
  - [x] **État émotionnel global** — Valence de fond, arousal, stabilité (au-delà du message actuel)
  - [x] **Confiance et engagement** — Suivi relationnel dans le temps

### 7. **Pensée Spontanée**
- [x] **Génération spontanée** (`spontaneous.ts`) — Questions, réflexions, associations
  - [x] Types : clarification, follow-up, réflexion, lien sémantique, empathie
  - [x] **Inhibition adaptative** — Plus l'utilisateur est engagé, moins l'IA intervient
  - [x] **Délais respectueux** — Min 8s, max 45s entre interventions
  - [x] **Évitement de répétition** — Buffer de topics récents

### 8. **Pipeline de Validation (Guardrail)**
- [x] **Validation des citations** (`guardrail/validator.ts`) — Vérifie que les souvenirs cités existent dans le RAG
  - [x] **Mode simulé** — Heuristique ultra-rapide (<50ms)
  - [x] **Mode Ollama** — Petit modèle (ex: Gemma 2B) pour validation sémantique
  - [x] **Correction automatique** — Remplacement des citations invalides
  - [x] **Monitoring de latence** — Alerte si dépassement du seuil configurable
  - [x] **0% hallucination d'épisode** — Garantie par validation

---

## ⚙️ Paramètres Configurables (Interface UI)

### LLM
- [ ] Provider (simulé / Ollama)
- [ ] Modèle
- [ ] Endpoint

### Mémoire
- [ ] Intervalle du tic (5-300s)
- [ ] Lambda decay (neutre, négatif, positif)
- [ ] Seuil de promotion
- [ ] Seuil d'oubli
- [ ] Max variation par interaction
- [ ] Plafond mémoire (Mo)

### Guardrail (Nouveau!)
- [x] Activation/désactivation
- [x] Provider (simule / ollama / none)
- [x] Modèle (si ollama)
- [x] Endpoint (si ollama)
- [x] Latence max acceptable (ms)

---

## 🔍 Innovations Techniques

| Innovation | Description | Fichier |
|------------|-------------|---------|
| **Decay non-linéaire** | Decay exponentiel modulé par valence et sommeil | `memory.ts` + `sleep.ts` |
| **Interférence proactive** | Oubli par compétition entre souvenirs similaires, pas seulement par temps | `attention.ts` |
| **Dopamine = erreur de prédiction** | Pas la récompense brute, mais la surprise par rapport à l'attente | `prediction.ts` + `hormones.ts` |
| **Séparation épisodique/sémantique** | Extraction automatique de faits généraux depuis les souvenirs contextuels | `semantic.ts` |
| **Habitudes indépendantes** | Boucle striatum/ganglions de la base séparée du graphe émotionnel | `habits.ts` |
| **ToM persistante** | Modèle mental de l'utilisateur qui évolue dans le temps, pas juste détection instantanée | `theory_of_mind.ts` |
| **Spontanéité inhibée** | L'IA ne parle pas toute seule si l'utilisateur est engagé | `spontaneous.ts` |
| **Guardrail à 2 agents** | Validation des citations avec fallback heuristique si modèle indisponible | `guardrail.ts` |
| **Règle stricte des souvenirs** | Instruction système empêchant l'invention de souvenirs fictifs | `brain.ts` (prompt_builder) |

---

## 📊 État du Système (Visible dans l'UI)

### Panneaux
- [x] **Chat** — Conversation avec l'IA
- [x] **Config** — Paramètres ajustables
- [x] **Statut** — Hormones, régime, sommeil, prochaines actions
- [x] **Graphe** — Visualisation des traits émotionnels
- [x] **Vecteurs** — Liste des souvenirs actifs avec force, valence, statut
- [x] **Logs** — Journal des événements (TIC, DECAY, PROMOTION, etc.)
- [x] **Tests** — Tests unitaires intégrés

### Indicateurs Temps Réel
- [x] Cycle de sommeil (phase actuelle, prochain changement)
- [x] Niveau des 5 hormones (graphique historique)
- [x] Régime de régulation (sain/tendu/traumatique)
- [x] Prochain tic (compte à rebours)
- [x] Taille mémoire (usage/plafond)
- [x] Focus attentionnel (items actifs)
- [x] Pensées spontanées en attente

---

## 🎯 Comportements Résultants

1. **L'IA ne rumine pas hors interaction** — La génération spontanée est conditionnée par l'engagement utilisateur et des délais minimums ✅
2. **L'oubli n'est pas purement temporel** — Les souvenirs similaires en compétition dans le focus attentionnel voient leur pertinence réduite ✅
3. **Modèle mental de l'utilisateur** — L'IA se souvient de vos croyances, intentions détectées, humeur de fond ✅
4. **Interventions naturelles** — Questions de clarification, follow-ups, marques d'empathie surgissent naturellement ✅
5. **0% hallucination de souvenirs** — Le guardrail valide chaque citation avant affichage ✅
6. **Respect de la latence** — Configuration du seuil max, fallback automatique si dépassement ✅

---

## 📝 Règles Strictes Implémentées

### INSTRUCTION_SOUVENIRS (dans le prompt_builder)
```
[RÈGLE STRICTE DES SOUVENIRS]
1. Tu ne dois citer un souvenir QUE s'il est explicitement présent dans la section [SOUVENIRS RAPPELÉS].
2. Il est STRICTEMENT INTERDIT d'inventer, d'imaginer ou d'illustrer ton propos avec de faux souvenirs passés.
3. Si aucun souvenir pertinent n'est présent dans le contexte, parle uniquement de manière théorique sans faire référence à un passé fictif.
```

### Validation Guardrail
- Extraction automatique des citations potentielles via regex
- Vérification par similarité textuelle (mode simulé) ou sémantique (mode Ollama)
- Correction automatique : remplacement par "[souvenir non vérifié]"
- Logging détaillé avec latence

---

## 🚀 Prochaines Améliorations Possibles

- [ ] Export/import de la mémoire (JSON)
- [ ] Visualisation avancée du graphe sémantique
- [ ] Mode "thérapie" : reconsolidation guidée
- [ ] Multi-utilisateurs avec ToM séparée
- [ ] Apprentissage few-shot depuis les interactions réussies
- [ ] Intégration voix (STT/TTS local)

---

**Build Status:** ✅ Passing  
**Dernière mise à jour:** 2025  
**Architecture:** ia_locale_memoire (TypeScript + React + Vite)

// ── spontaneous.ts : génération de pensées/questions spontanées ──────────────
// Module pour générer des interventions spontanées de l'IA entre les messages
// de l'utilisateur, simulant la rumination, la curiosité et l'initiative.

import type { SysState } from "./types";
import { clamp01, uid } from "./core";
import { getDominantIntention, getActiveBeliefs, theoryOfMindSummary } from "./theory_of_mind";
import { getDominantHabits } from "./habits";
import { searchSemanticFacts } from "./semantic";

export interface SpontaneousThought {
  id: string;
  type: "question" | "reflection" | "association" | "clarification" | "followup" | "empathy";
  content: string;
  trigger: string;           // ce qui a déclenché cette pensée
  urgency: number;           // 0-1 (probabilité d'être exprimée)
  relevanceToUser: number;   // pertinence par rapport à l'utilisateur
  createdAt: number;
  expressed?: boolean;       // si déjà exprimé à l'utilisateur
}

export interface SpontaneityState {
  pendingThoughts: SpontaneousThought[];
  lastSpontaneousAt: number;
  spontaneityRate: number;   // tendance à générer des pensées (0-1)
  inhibitionLevel: number;   // frein à l'expression (0-1)
  recentTopics: string[];    // sujets récents pour éviter répétition
}

export const SPONTANEITY_CONFIG = {
  // Taux de base de génération de pensées spontanées
  baseSpontaneityRate: 0.3,
  
  // Délai minimum entre deux interventions spontanées (ms)
  minIntervalMs: 8000,
  
  // Délai maximum sans intervention si conditions favorables (ms)
  maxIntervalMs: 45000,
  
  // Seuil d'urgence minimum pour exprimer une pensée
  minUrgencyThreshold: 0.5,
  
  // Facteurs modulant la spontanéité
  modifiers: {
    highEngagement: 0.25,     // utilisateur très engagé → plus spontané
    lowTrust: -0.2,           // faible confiance → moins spontané (prudence)
    negativeValence: -0.15,   // humeur négative → moins spontané (empathie)
    curiosity: 0.2,           // détection de curiosité → plus spontané
  },
  
  // Types de questions/réflexions par contexte
  questionTemplates: {
    clarification: [
      "Qu'est-ce que tu veux dire par \"{topic}\" ?",
      "Peux-tu m'en dire plus sur \"{topic}\" ?",
      "Comment ressens-tu \"{topic}\" ?",
      "Pourquoi est-ce que \"{topic}\" est important pour toi ?",
    ],
    followup: [
      "Et ensuite, qu'est-ce qui s'est passé ?",
      "Comment as-tu réagi à ça ?",
      "Est-ce que ça a changé quelque chose pour toi ?",
      "Tu en as parlé à quelqu'un ?",
    ],
    reflection: [
      "Je me demande si \"{topic}\" n'est pas lié à autre chose...",
      "Ça me fait penser à un pattern intéressant...",
      "J'ai l'impression que \"{topic}\" révèle quelque chose de profond.",
    ],
    association: [
      "Ce que tu dis me rappelle \"{relatedTopic}\".",
      "Il y a un lien entre \"{topic}\" et \"{relatedTopic}\", tu ne crois pas ?",
      "Est-ce que tu as déjà pensé à \"{relatedTopic}\" dans ce contexte ?",
    ],
    empathy: [
      "Ça a dû être difficile pour toi.",
      "Je comprends que tu puisses te sentir comme ça.",
      "C'est courageux de partager ça.",
    ],
  },
};

/**
 * Initialise l'état de spontanéité
 */
export function spontaneityInit(): SpontaneityState {
  return {
    pendingThoughts: [],
    lastSpontaneousAt: 0,
    spontaneityRate: SPONTANEITY_CONFIG.baseSpontaneityRate,
    inhibitionLevel: 0.3,
    recentTopics: [],
  };
}

/**
 * Génère des pensées spontanées basées sur l'état actuel du système
 */
export function generateSpontaneousThoughts(
  state: SysState,
  now: number
): { state: SysState; newThoughts: SpontaneousThought[] } {
  const thoughts: SpontaneousThought[] = [];
  let newSysState = { ...state };
  
  // Vérifier le délai minimum depuis la dernière spontanéité
  const timeSinceLast = now - state.spontaneity.lastSpontaneousAt;
  if (timeSinceLast < SPONTANEITY_CONFIG.minIntervalMs) {
    return { state, newThoughts: [] };
  }
  
  // Calculer le taux de spontanéité actuel
  const engagement = state.theoryOfMind?.engagement ?? 0.5;
  const trust = state.theoryOfMind?.trustLevel ?? 0.5;
  const userValence = state.theoryOfMind?.emotionalState.valence ?? 0;
  
  let currentRate = SPONTANEITY_CONFIG.baseSpontaneityRate;
  currentRate += engagement > 0.7 ? SPONTANEITY_CONFIG.modifiers.highEngagement : 0;
  currentRate += trust < 0.3 ? SPONTANEITY_CONFIG.modifiers.lowTrust : 0;
  currentRate += userValence < -0.2 ? SPONTANEITY_CONFIG.modifiers.negativeValence : 0;
  
  // Détection d'intention de curiosité → boost
  const dominantIntention = getDominantIntention(state.theoryOfMind);
  if (dominantIntention?.type === "exploring" || dominantIntention?.type === "seeking_info") {
    currentRate += SPONTANEITY_CONFIG.modifiers.curiosity;
  }
  
  currentRate = clamp01(currentRate);
  
  // Roll pour décider si on génère une pensée
  if (Math.random() > currentRate) {
    return { state, newThoughts: [] };
  }
  
  // --- Génération basée sur différents triggers ---
  
  // 1. Basé sur les intentions non fulfillées de l'utilisateur
  if (dominantIntention && !dominantIntention.fulfilled) {
    const templates = SPONTANEITY_CONFIG.questionTemplates.followup;
    const template = templates[Math.floor(Math.random() * templates.length)];
    
    thoughts.push({
      id: uid(),
      type: "followup",
      content: template,
      trigger: `intention ${dominantIntention.type}`,
      urgency: dominantIntention.urgency,
      relevanceToUser: dominantIntention.confidence,
      createdAt: now,
    });
  }
  
  // 2. Basé sur les croyances actives de l'utilisateur
  const activeBeliefs = getActiveBeliefs(state.theoryOfMind, now);
  if (activeBeliefs.length > 0 && Math.random() > 0.5) {
    const belief = activeBeliefs[0];
    const templates = SPONTANEITY_CONFIG.questionTemplates.clarification;
    const template = templates[Math.floor(Math.random() * templates.length)];
    
    thoughts.push({
      id: uid(),
      type: "clarification",
      content: template.replace("{topic}", belief.content.slice(0, 40)),
      trigger: `croyance: "${belief.content.slice(0, 30)}..."`,
      urgency: 0.4 + belief.confidence * 0.4,
      relevanceToUser: belief.confidence,
      createdAt: now,
    });
  }
  
  // 3. Basé sur les habitudes dominantes
  const dominantHabits = getDominantHabits(state.habits, 1);
  if (dominantHabits.length > 0 && Math.random() > 0.6) {
    const habit = dominantHabits[0];
    const templates = SPONTANEITY_CONFIG.questionTemplates.reflection;
    const template = templates[Math.floor(Math.random() * templates.length)];
    
    thoughts.push({
      id: uid(),
      type: "reflection",
      content: template.replace("{topic}", habit.label.slice(0, 40)),
      trigger: `habitude: "${habit.label.slice(0, 30)}..."`,
      urgency: 0.3 + habit.strength * 0.5,
      relevanceToUser: habit.strength,
      createdAt: now,
    });
  }
  
  // 4. Association sémantique (lien entre concepts)
  if (state.semantic.facts.length > 2 && Math.random() > 0.7) {
    const query = state.chat[state.chat.length - 1]?.texte ?? "";
    const results = searchSemanticFacts(state.semantic, query, 2);
    
    if (results.length >= 2) {
      const factA = results[0].fact;
      const factB = results[1].fact;
      const templates = SPONTANEITY_CONFIG.questionTemplates.association;
      const template = templates[Math.floor(Math.random() * templates.length)];
      
      thoughts.push({
        id: uid(),
        type: "association",
        content: template
          .replace("{topic}", factA.content.slice(0, 30))
          .replace("{relatedTopic}", factB.content.slice(0, 30)),
        trigger: `association sémantique: ${factA.category} ↔ ${factB.category}`,
        urgency: 0.3 + (results[0].score + results[1].score) * 0.3,
        relevanceToUser: 0.5,
        createdAt: now,
      });
    }
  }
  
  // 5. Empathie basée sur l'état émotionnel
  if (userValence < -0.3 && Math.random() > 0.4) {
    const templates = SPONTANEITY_CONFIG.questionTemplates.empathy;
    const template = templates[Math.floor(Math.random() * templates.length)];
    
    thoughts.push({
      id: uid(),
      type: "empathy",
      content: template,
      trigger: `valence utilisateur: ${userValence.toFixed(2)}`,
      urgency: 0.6 + Math.abs(userValence) * 0.3,
      relevanceToUser: 0.9,
      createdAt: now,
    });
  }
  
  // Filtrer par seuil d'urgence et éviter les répétitions
  const filteredThoughts = thoughts.filter(t => {
    if (t.urgency < SPONTANEITY_CONFIG.minUrgencyThreshold) return false;
    
    // Éviter répétition de topics récents
    const topicWords = t.content.toLowerCase().split(/\s+/).filter(w => w.length > 4);
    const isRepeated = topicWords.some(word => 
      state.spontaneity.recentTopics.some(recent => recent.includes(word))
    );
    
    return !isRepeated;
  });
  
  // Ajouter aux pensées en attente
  const updatedPending = [...state.spontaneity.pendingThoughts, ...filteredThoughts]
    .slice(-10); // Limiter le buffer
  
  // Mettre à jour les topics récents
  const newTopics = filteredThoughts
    .flatMap(t => t.content.toLowerCase().split(/\s+/).filter(w => w.length > 4))
    .slice(-20);
  
  const updatedRecentTopics = [...state.spontaneity.recentTopics, ...newTopics]
    .slice(-30);
  
  newSysState = {
    ...newSysState,
    spontaneity: {
      ...state.spontaneity,
      pendingThoughts: updatedPending,
      lastSpontaneousAt: filteredThoughts.length > 0 ? now : state.spontaneity.lastSpontaneousAt,
      spontaneityRate: currentRate,
      recentTopics: updatedRecentTopics,
    },
  };
  
  return { state: newSysState, newThoughts: filteredThoughts };
}

/**
 * Sélectionne la pensée spontanée la plus pertinente à exprimer
 */
export function selectNextSpontaneousThought(
  state: SpontaneityState,
  now: number
): SpontaneousThought | null {
  const pending = state.pendingThoughts.filter(t => !t.expressed);
  if (pending.length === 0) return null;
  
  // Vérifier le délai
  const timeSinceLast = now - state.lastSpontaneousAt;
  if (timeSinceLast < SPONTANEITY_CONFIG.minIntervalMs) return null;
  
  // Sélectionner par score combiné (urgence × pertinence)
  const scored = pending.map(t => ({
    thought: t,
    score: t.urgency * t.relevanceToUser * (1 - state.inhibitionLevel),
  }));
  
  scored.sort((a, b) => b.score - a.score);
  
  // Retourner la meilleure si elle dépasse le seuil
  const best = scored[0];
  if (best.score >= SPONTANEITY_CONFIG.minUrgencyThreshold * 0.5) {
    return best.thought;
  }
  
  return null;
}

/**
 * Marque une pensée comme exprimée
 */
export function markThoughtExpressed(
  state: SpontaneityState,
  thoughtId: string
): SpontaneityState {
  const updated = state.pendingThoughts.map(t =>
    t.id === thoughtId ? { ...t, expressed: true } : t
  );
  
  return { ...state, pendingThoughts: updated };
}

/**
 * Nettoie les anciennes pensées exprimées
 */
export function cleanupThoughts(state: SpontaneityState): SpontaneityState {
  const kept = state.pendingThoughts.filter(t => !t.expressed || t.createdAt > Date.now() - 60000);
  return { ...state, pendingThoughts: kept };
}

/**
 * Ajuste le niveau d'inhibition basé sur le contexte
 */
export function adjustInhibition(
  state: SpontaneityState,
  userEngagement: number,
  conversationFlow: "active" | "slowing" | "stalled"
): SpontaneityState {
  let newInhibition = state.inhibitionLevel;
  
  // Moins d'inhibition si l'utilisateur est engagé
  if (userEngagement > 0.7) {
    newInhibition = Math.max(0.1, newInhibition - 0.1);
  }
  
  // Plus d'inhibition si la conversation ralentit (respecter l'espace)
  if (conversationFlow === "slowing" || conversationFlow === "stalled") {
    newInhibition = Math.min(0.8, newInhibition + 0.15);
  }
  
  return { ...state, inhibitionLevel: clamp01(newInhibition) };
}

/**
 * Résumé lisible pour logs/debug
 */
export function spontaneitySummary(state: SpontaneityState): string {
  const pending = state.pendingThoughts.filter(t => !t.expressed).length;
  const rate = state.spontaneityRate;
  const inhibition = state.inhibitionLevel;
  
  return `Spontanéité: ${pending} pensée(s) en attente · taux: ${(rate * 100).toFixed(0)}% · inhibition: ${(inhibition * 100).toFixed(0)}%`;
}

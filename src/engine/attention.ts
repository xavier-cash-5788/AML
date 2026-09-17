// ── attention.ts : mémoire de travail avec capacité limitée et focus ─────────
// Un vrai cerveau ne traite que 4-7 éléments actifs à la fois (Miller's Law).
// Ce module ajoute un tampon à capacité limitée avec un mécanisme de "focus"
// qui décide quoi ignorer ou prioriser.

import type { Souvenir } from "./types";
import { clamp01 } from "./core";

export interface WorkingMemoryItem {
  souvenir: Souvenir;
  relevance: number; // pertinence actuelle (0-1)
  addedAt: number;   // timestamp d'ajout
  lastAccessed: number; // dernier accès
  accessCount: number; // nombre d'accès
}

export interface AttentionState {
  // Capacité limitée de la mémoire de travail (4-7 items typiquement)
  items: WorkingMemoryItem[];
  capacity: number; // max items dans le focus
  focusMode: "broad" | "narrow" | "selective"; // mode d'attention
  filterThreshold: number; // seuil minimum pour entrer dans le focus
  inhibitionTags: string[]; // tags/thèmes à ignorer (mécanisme d'inhibition)
}

export const ATTENTION_CONFIG = {
  // Capacité par défaut (inspiré de Miller's Law: 7±2)
  defaultCapacity: 5,
  
  // Seuil de pertinence minimum pour entrer dans le focus
  minRelevanceThreshold: 0.15,
  
  // Facteur de decay de la pertinence dans le temps (par minute)
  relevanceDecayRate: 0.08,
  
  // Bonus de pertinence pour les items récemment accédés
  recencyBonus: 0.12,
  
  // Pénalité pour les items trop anciens dans le focus (interférence proactive)
  agePenaltyPerMinute: 0.03,
  
  // Modes de focus
  focusModes: {
    broad: { 
      description: "Attention large, capture plus d'éléments",
      capacityMultiplier: 1.4,
      thresholdReduction: 0.3,
    },
    narrow: { 
      description: "Attention focalisée, moins d'éléments mais plus profonds",
      capacityMultiplier: 0.6,
      thresholdReduction: -0.2, // seuil plus exigeant
    },
    selective: { 
      description: "Attention sélective, filtre activement les distractions",
      capacityMultiplier: 1.0,
      thresholdReduction: 0.0,
    },
  },
};

/**
 * Initialise l'état d'attention avec une capacité par défaut
 */
export function attentionInit(): AttentionState {
  return {
    items: [],
    capacity: ATTENTION_CONFIG.defaultCapacity,
    focusMode: "broad",
    filterThreshold: ATTENTION_CONFIG.minRelevanceThreshold,
    inhibitionTags: [],
  };
}

/**
 * Calcule la capacité effective selon le mode de focus actuel
 */
export function effectiveCapacity(state: AttentionState): number {
  const modeConfig = ATTENTION_CONFIG.focusModes[state.focusMode];
  return Math.round(ATTENTION_CONFIG.defaultCapacity * modeConfig.capacityMultiplier);
}

/**
 * Calcule le seuil de filtrage effectif selon le mode de focus
 */
export function effectiveFilterThreshold(state: AttentionState): number {
  const modeConfig = ATTENTION_CONFIG.focusModes[state.focusMode];
  return clamp01(ATTENTION_CONFIG.minRelevanceThreshold + modeConfig.thresholdReduction);
}

/**
 * Ajoute un souvenir à la mémoire de travail si pertinent et s'il y a de la place
 * Retourne true si ajouté, false si ignoré/rejeté
 */
export function addToFocus(
  state: AttentionState,
  souvenir: Souvenir,
  relevanceScore: number,
  now: number
): { added: boolean; state: AttentionState; reason?: string } {
  // Vérifier si le souvenir est inhibé par un tag
  const isTagInhibited = souvenir.traits.some(t => 
    state.inhibitionTags.some(inh => t.includes(inh) || inh.includes(t))
  );
  
  if (isTagInhibited) {
    return { 
      added: false, 
      state, 
      reason: `inhibé par tag [${state.inhibitionTags.join(", ")}]` 
    };
  }
  
  // Vérifier le seuil de pertinence
  const threshold = effectiveFilterThreshold(state);
  if (relevanceScore < threshold) {
    return { 
      added: false, 
      state, 
      reason: `pertinence ${relevanceScore.toFixed(2)} < seuil ${threshold.toFixed(2)}` 
    };
  }
  
  // Vérifier si déjà dans le focus
  const existingIndex = state.items.findIndex(i => i.souvenir.id === souvenir.id);
  if (existingIndex >= 0) {
    // Mettre à jour l'existant
    const updated = [...state.items];
    updated[existingIndex] = {
      ...updated[existingIndex],
      relevance: clamp01(updated[existingIndex].relevance + 0.15),
      lastAccessed: now,
      accessCount: updated[existingIndex].accessCount + 1,
    };
    return { added: true, state: { ...state, items: updated }, reason: "mis à jour" };
  }
  
  // Vérifier la capacité
  const cap = effectiveCapacity(state);
  let newItems = [...state.items];
  let evicted: WorkingMemoryItem | null = null;
  
  if (newItems.length >= cap) {
    // Trouver l'item le moins pertinent pour l'évincer
    const weakestIndex = newItems.reduce((minIdx, item, idx, arr) => 
      item.relevance < arr[minIdx].relevance ? idx : minIdx, 0);
    evicted = newItems[weakestIndex];
    newItems = newItems.filter((_, i) => i !== weakestIndex);
  }
  
  // Ajouter le nouvel item
  newItems.push({
    souvenir,
    relevance: clamp01(relevanceScore),
    addedAt: now,
    lastAccessed: now,
    accessCount: 1,
  });
  
  const newState: AttentionState = { ...state, items: newItems };
  
  return {
    added: true,
    state: newState,
    reason: evicted 
      ? `ajouté (a évincé "${evicted.souvenir.texte.slice(0, 30)}...")`
      : "ajouté"
  };
}

/**
 * Accède à un item dans le focus, augmentant sa pertinence
 */
export function accessInFocus(
  state: AttentionState,
  souvenirId: string,
  now: number
): { accessed: boolean; state: AttentionState; item?: WorkingMemoryItem } {
  const index = state.items.findIndex(i => i.souvenir.id === souvenirId);
  if (index < 0) {
    return { accessed: false, state };
  }
  
  const updated = [...state.items];
  const item = updated[index];
  updated[index] = {
    ...item,
    relevance: clamp01(item.relevance + 0.2),
    lastAccessed: now,
    accessCount: item.accessCount + 1,
  };
  
  return { accessed: true, state: { ...state, items: updated }, item: updated[index] };
}

/**
 * Applique le decay temporel à tous les items du focus
 * Doit être appelé périodiquement (chaque tick)
 */
export function attentionDecay(state: AttentionState, now: number): AttentionState {
  const minutesSinceStart = (now - (state.items[0]?.addedAt ?? now)) / 60000;
  
  const updated = state.items.map(item => {
    const ageMinutes = (now - item.addedAt) / 60000;
    const timeSinceAccess = (now - item.lastAccessed) / 60000;
    
    // Decay de base
    let newRelevance = item.relevance - (ATTENTION_CONFIG.relevanceDecayRate * (timeSinceAccess + 0.1));
    
    // Pénalité d'âge (interférence proactive)
    newRelevance -= ATTENTION_CONFIG.agePenaltyPerMinute * ageMinutes;
    
    // Bonus de récence si accès très récent
    if (timeSinceAccess < 0.5) { // moins de 30 secondes
      newRelevance += ATTENTION_CONFIG.recencyBonus;
    }
    
    return {
      ...item,
      relevance: clamp01(Math.max(0, newRelevance)),
    };
  }).filter(item => item.relevance > ATTENTION_CONFIG.minRelevanceThreshold * 0.5);
  
  return { ...state, items: updated };
}

/**
 * Définit des tags à inhiber (mécanisme de suppression active)
 */
export function setInhibitionTags(state: AttentionState, tags: string[]): AttentionState {
  return { ...state, inhibitionTags: tags };
}

/**
 * Change le mode de focus
 */
export function setFocusMode(
  state: AttentionState,
  mode: "broad" | "narrow" | "selective"
): AttentionState {
  return { ...state, focusMode: mode };
}

/**
 * Réinitialise complètement le focus (oubli de la mémoire de travail)
 */
export function clearFocus(state: AttentionState): AttentionState {
  return { ...state, items: [] };
}

/**
 * Retourne les souvenirs actuellement dans le focus, triés par pertinence
 */
export function getFocusedSouvenirs(state: AttentionState): Souvenir[] {
  return [...state.items]
    .sort((a, b) => b.relevance - a.relevance)
    .map(i => i.souvenir);
}

/**
 * Calcule un score de "charge cognitive" basé sur le remplissage du focus
 */
export function cognitiveLoad(state: AttentionState): number {
  const cap = effectiveCapacity(state);
  return clamp01(state.items.length / cap);
}

/**
 * Résumé lisible de l'état d'attention pour logs/debug
 */
export function attentionSummary(state: AttentionState): string {
  const cap = effectiveCapacity(state);
  const load = cognitiveLoad(state);
  const modeDesc = ATTENTION_CONFIG.focusModes[state.focusMode].description;
  
  const itemsSummary = state.items.length === 0
    ? "focus vide"
    : `${state.items.length}/${cap} items (charge: ${(load * 100).toFixed(0)}%)`;
  
  const inhibitionInfo = state.inhibitionTags.length > 0
    ? ` · inhibitions: [${state.inhibitionTags.join(", ")}]`
    : "";
  
  return `[${state.focusMode}] ${modeDesc} — ${itemsSummary}${inhibitionInfo}`;
}

/**
 * Détermine automatiquement le mode de focus optimal selon la situation
 * - Beaucoup d'items émotionnellement chargés → mode narrow (protection)
 * - Peu d'items, environnement calme → mode broad (exploration)
 */
export function autoAdjustFocusMode(
  state: AttentionState,
  averageValence: number,
  averageIntensity: number
): AttentionState {
  const isStressful = averageValence < -0.2 && averageIntensity > 0.5;
  const isCalm = averageValence > 0.1 && averageIntensity < 0.4;
  
  if (isStressful && state.focusMode !== "narrow") {
    // En situation de stress, on réduit le focus pour se protéger
    return setFocusMode(state, "narrow");
  }
  
  if (isCalm && state.focusMode !== "broad") {
    // En situation calme, on élargit le focus pour explorer
    return setFocusMode(state, "broad");
  }
  
  return state;
}

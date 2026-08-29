// ── habits.ts : mémoire procédurale / habitudes (striatum/ganglions de base) ─
// Contrairement à la mémoire déclarative (souvenirs narratifs + traits), les
// habitudes sont des compétences apprises par répétition, stockées dans un
// module distinct inspiré du striatum. Elles sont activées par des contextes
// et renforcées par la récompense/répétition.

import { clamp01, uid } from "./core";

export interface HabitPattern {
  id: string;
  label: string;           // description de l'habitude
  contextTriggers: string[]; // indices contextuels qui déclenchent l'habitude
  actionTendency: string;  // tendance comportementale associée
  strength: number;        // force de l'habitude (0-1)
  repetitions: number;     // nombre de répétitions/renforcements
  lastActivated: number;   // dernière activation
  rewardHistory: number[]; // historique des récompenses associées
  automaticity: number;    // degré d'automaticité (0=délibéré, 1=automatique)
}

export interface HabitsState {
  patterns: HabitPattern[];
  maxPatterns: number;     // capacité maximale du système d'habitudes
  learningRate: number;    // vitesse d'apprentissage des nouvelles habitudes
  decayRate: number;       // oubli lent des habitudes non utilisées
  currentContext: string[]; // contexte actuel (pour le déclenchement)
}

export const HABITS_CONFIG = {
  // Capacité maximale (nombre d'habitudes principales)
  maxPatterns: 12,
  
  // Taux d'apprentissage initial
  learningRate: 0.15,
  
  // Decay des habitudes non utilisées (par jour simulé)
  decayRate: 0.02,
  
  // Seuil minimum pour qu'une habitude soit considérée "acquise"
  acquisitionThreshold: 0.5,
  
  // Seuil pour qu'une habitude devienne "automatique"
  automaticityThreshold: 0.75,
  
  // Facteurs de renforcement
  reinforcementFactors: {
    repetition: 0.08,      // gain par répétition
    reward: 0.12,          // gain par récompense positive
    contextMatch: 0.05,    // gain si contexte correspondant
  },
  
  // Poids pour le calcul de la force
  weights: {
    repetitions: 0.4,
    rewardAvg: 0.35,
    recency: 0.25,
  },
};

/**
 * Initialise le système d'habitudes vide
 */
export function habitsInit(): HabitsState {
  return {
    patterns: [],
    maxPatterns: HABITS_CONFIG.maxPatterns,
    learningRate: HABITS_CONFIG.learningRate,
    decayRate: HABITS_CONFIG.decayRate,
    currentContext: [],
  };
}

/**
 * Crée ou renforce une habitude basée sur une interaction
 * C'est le mécanisme principal d'apprentissage procédural
 */
export function reinforceHabit(
  state: HabitsState,
  context: string[],
  actionDescription: string,
  rewardSignal: number, // -1 à 1 (signal de récompense/punition)
  now: number
): { state: HabitsState; habit?: HabitPattern; created: boolean } {
  // Chercher une habitude existante avec contexte similaire
  const existingIndex = state.patterns.findIndex(h => 
    h.contextTriggers.some(t => context.some(c => c.toLowerCase().includes(t.toLowerCase())))
  );
  
  if (existingIndex >= 0) {
    // Renforcer l'habitude existante
    const habit = state.patterns[existingIndex];
    const updated: HabitPattern = {
      ...habit,
      strength: clamp01(habit.strength + rewardSignal * HABITS_CONFIG.reinforcementFactors.reward),
      repetitions: habit.repetitions + 1,
      lastActivated: now,
      rewardHistory: [...habit.rewardHistory.slice(-9), rewardSignal],
      automaticity: clamp01(habit.automaticity + 0.05 * (rewardSignal > 0 ? 1 : -0.3)),
    };
    
    // Recalculer la force basée sur les nouveaux paramètres
    updated.strength = computeHabitStrength(updated, now);
    
    const newPatterns = [...state.patterns];
    newPatterns[existingIndex] = updated;
    
    return { 
      state: { ...state, patterns: newPatterns }, 
      habit: updated, 
      created: false 
    };
  }
  
  // Créer une nouvelle habitude si on a de la place
  if (state.patterns.length >= state.maxPatterns) {
    // Trouver l'habitude la plus faible pour la remplacer
    const weakestIdx = state.patterns.reduce((minIdx, h, idx, arr) => 
      h.strength < arr[minIdx].strength ? idx : minIdx, 0);
    
    // Seulement si la nouvelle habitude est plus prometteuse
    const weakest = state.patterns[weakestIdx];
    if (rewardSignal <= 0 && weakest.strength > 0.3) {
      return { state, created: false }; // Pas assez fort pour remplacer
    }
    
    // Remplacer
    const newPatterns = [...state.patterns];
    newPatterns.splice(weakestIdx, 1);
    
    const newHabit: HabitPattern = {
      id: uid(),
      label: actionDescription,
      contextTriggers: [...new Set(context.slice(0, 5))],
      actionTendency: actionDescription,
      strength: computeInitialStrength(rewardSignal, 1),
      repetitions: 1,
      lastActivated: now,
      rewardHistory: [rewardSignal],
      automaticity: 0.1,
    };
    
    newPatterns.push(newHabit);
    
    return {
      state: { ...state, patterns: newPatterns },
      habit: newHabit,
      created: true,
    };
  }
  
  // Ajouter simplement la nouvelle habitude
  const newHabit: HabitPattern = {
    id: uid(),
    label: actionDescription,
    contextTriggers: [...new Set(context.slice(0, 5))],
    actionTendency: actionDescription,
    strength: computeInitialStrength(rewardSignal, 1),
    repetitions: 1,
    lastActivated: now,
    rewardHistory: [rewardSignal],
    automaticity: 0.1,
  };
  
  return {
    state: { ...state, patterns: [...state.patterns, newHabit] },
    habit: newHabit,
    created: true,
  };
}

/**
 * Calcule la force initiale d'une nouvelle habitude
 */
function computeInitialStrength(reward: number, repetitions: number): number {
  const baseFromReward = clamp01(0.3 + reward * 0.3);
  const repBonus = Math.min(0.2, repetitions * 0.05);
  return clamp01(baseFromReward + repBonus);
}

/**
 * Calcule la force actuelle d'une habitude basée sur son historique
 */
export function computeHabitStrength(habit: HabitPattern, now: number): number {
  const { weights } = HABITS_CONFIG;
  
  // Composante répétitions (logarithmique : rendements décroissants)
  const repComponent = Math.log(habit.repetitions + 1) / Math.log(20) ; // normalisé ~0-1
  
  // Composante récompense moyenne
  const avgReward = habit.rewardHistory.length > 0
    ? habit.rewardHistory.reduce((s, r) => s + r, 0) / habit.rewardHistory.length
    : 0;
  const rewardComponent = clamp01(0.5 + avgReward * 0.5);
  
  // Composante récence (decay exponentiel)
  const daysSinceUse = (now - habit.lastActivated) / (1000 * 60 * 60 * 24);
  const recencyComponent = Math.exp(-daysSinceUse * HABITS_CONFIG.decayRate * 10);
  
  return clamp01(
    repComponent * weights.repetitions +
    rewardComponent * weights.rewardAvg +
    recencyComponent * weights.recency
  );
}

/**
 * Met à jour le contexte actuel et retourne les habitudes potentiellement activables
 */
export function updateContext(
  state: HabitsState,
  newContext: string[]
): { state: HabitsState; activatedHabits: HabitPattern[] } {
  const newState = { ...state, currentContext: newContext };
  
  // Trouver les habitudes dont les triggers correspondent au contexte
  const activated = state.patterns.filter(h => 
    h.contextTriggers.some(trigger => 
      newContext.some(ctx => 
        ctx.toLowerCase().includes(trigger.toLowerCase()) ||
        trigger.toLowerCase().includes(ctx.toLowerCase())
      )
    ) && h.strength >= HABITS_CONFIG.acquisitionThreshold
  ).sort((a, b) => {
    // Trier par force et automaticité
    const scoreA = a.strength * 0.7 + a.automaticity * 0.3;
    const scoreB = b.strength * 0.7 + b.automaticity * 0.3;
    return scoreB - scoreA;
  });
  
  return { state: newState, activatedHabits: activated.slice(0, 3) };
}

/**
 * Active une habitude spécifique (quand elle est exécutée)
 */
export function activateHabit(
  state: HabitsState,
  habitId: string,
  rewardSignal: number,
  now: number
): { state: HabitsState; habit?: HabitPattern } {
  const index = state.patterns.findIndex(h => h.id === habitId);
  if (index < 0) return { state };
  
  const habit = state.patterns[index];
  const updated: HabitPattern = {
    ...habit,
    repetitions: habit.repetitions + 1,
    lastActivated: now,
    rewardHistory: [...habit.rewardHistory.slice(-9), rewardSignal],
    strength: 0, // sera recalculé
    automaticity: clamp01(habit.automaticity + rewardSignal * 0.08),
  };
  
  updated.strength = computeHabitStrength(updated, now);
  
  const newPatterns = [...state.patterns];
  newPatterns[index] = updated;
  
  return { state: { ...state, patterns: newPatterns }, habit: updated };
}

/**
 * Applique le decay temporel à toutes les habitudes
 * Doit être appelé périodiquement (chaque tick ou moins souvent)
 */
export function habitsDecay(state: HabitsState, now: number): HabitsState {
  const updated = state.patterns.map(h => {
    const daysSinceUse = (now - h.lastActivated) / (1000 * 60 * 60 * 24);
    const decayFactor = Math.exp(-daysSinceUse * HABITS_CONFIG.decayRate);
    
    return {
      ...h,
      strength: clamp01(h.strength * decayFactor),
    };
  }).filter(h => h.strength > 0.05); // Supprimer les habitudes trop faibles
  
  return { ...state, patterns: updated };
}

/**
 * Retourne les habitudes dominantes (les plus fortes)
 */
export function getDominantHabits(state: HabitsState, n = 3): HabitPattern[] {
  return [...state.patterns]
    .sort((a, b) => b.strength - a.strength)
    .slice(0, n);
}

/**
 * Vérifie si une habitude donnée est "automatique" (peut s'exécuter sans effort conscient)
 */
export function isHabitAutomatic(habit: HabitPattern): boolean {
  return habit.automaticity >= HABITS_CONFIG.automaticityThreshold && 
         habit.strength >= HABITS_CONFIG.acquisitionThreshold;
}

/**
 * Résumé lisible de l'état des habitudes pour logs/debug
 */
export function habitsSummary(state: HabitsState): string {
  const total = state.patterns.length;
  const acquired = state.patterns.filter(h => h.strength >= HABITS_CONFIG.acquisitionThreshold).length;
  const automatic = state.patterns.filter(h => isHabitAutomatic(h)).length;
  
  const topHabits = getDominantHabits(state, 2)
    .map(h => `"${h.label}" (${h.strength.toFixed(2)}, auto: ${h.automaticity.toFixed(2)})`)
    .join(", ");
  
  return `Habitudes: ${total} (${acquired} acquises, ${automatic} automatiques) · Top: ${topHabits || "aucune"}`;
}

/**
 * Extrait le contexte d'un message ou d'une situation pour le système d'habitudes
 */
export function extractContext(text: string, traits: string[]): string[] {
  const lower = text.toLowerCase();
  
  // Mots-clés contextuels génériques
  const contextKeywords = [
    "matin", "soir", "nuit", "jour",
    "travail", "maison", "dehors", "intérieur",
    "seul", "ensemble", "groupe", "foule",
    "calme", "stress", "urgence", "détente",
    "discussion", "conversation", "question", "réponse",
  ];
  
  const extracted = contextKeywords.filter(k => lower.includes(k));
  
  // Ajouter les traits actifs comme contexte
  extracted.push(...traits.slice(0, 3));
  
  return [...new Set(extracted)];
}

/**
 * Prédit la réponse/behavior tendency probable basée sur les habitudes actives
 */
export function predictBehavior(
  state: HabitsState,
  context: string[]
): { tendency?: string; confidence: number; source?: HabitPattern } {
  const { activatedHabits } = updateContext({ ...state, currentContext: context }, context);
  
  if (activatedHabits.length === 0) {
    return { confidence: 0 };
  }
  
  const dominant = activatedHabits[0];
  const confidence = dominant.strength * dominant.automaticity;
  
  return {
    tendency: dominant.actionTendency,
    confidence,
    source: dominant,
  };
}

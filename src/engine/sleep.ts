// ── sleep.ts : cycle circadien veille/sommeil avec consolidation accélérée ───
// Le vrai cerveau consolide surtout pendant le sommeil (replay hippocampique,
// transfert vers le cortex). Ce module ajoute un état veille/sommeil où :
// - en "sommeil" : taux de promotion vecteur→graphe augmente fortement
// - decay ralentit pendant le sommeil
// - cycle circadien plutôt qu'un tic uniforme

export interface SleepState {
  phase: "veille" | "endormissement" | "sommeil_leger" | "sommeil_profond" | "rem" | "reveil";
  cycleStart: number; // timestamp ms du début du cycle actuel
  timeInPhase: number; // temps passé dans la phase actuelle (ms)
  consolidationMultiplier: number; // multiplicateur pour la promotion pendant le sommeil
  decaySlowdown: number; // facteur de ralentissement du decay (0-1)
}

// Configuration du cycle circadien (en secondes réelles pour la démo)
export const SLEEP_CONFIG = {
  // Durée d'un cycle complet veille→sommeil→réveil (en secondes)
  // Pour la démo : 120s = 2 minutes (cycle très accéléré)
  // En production : on pourrait utiliser 7200s = 2 heures
  cycleDurationSeconds: 120,
  
  // Phases du cycle (pourcentages du cycle total)
  phases: {
    veille: 0.50,        // 50% du cycle en veille
    endormissement: 0.08, // 8% transition
    sommeil_leger: 0.15,  // 15% sommeil léger
    sommeil_profond: 0.17,// 17% sommeil profond (consolidation maximale)
    rem: 0.10,           // 10% REM (replay hippocampique)
  },
  
  // Multiplicateurs de consolidation par phase
  // Plus haut = plus de promotions vecteur→graphe pendant cette phase
  consolidationMultipliers: {
    veille: 1.0,
    endormissement: 1.3,
    sommeil_leger: 1.8,
    sommeil_profond: 2.5, // Pic de consolidation
    rem: 2.2,             // Replay hippocampique
  },
  
  // Ralentissement du decay par phase (0 = decay arrêté, 1 = decay normal)
  decaySlowdowns: {
    veille: 1.0,
    endormissement: 0.8,
    sommeil_leger: 0.6,
    sommeil_profond: 0.4, // Decay très lent pendant le sommeil profond
    rem: 0.5,
  },
};

export function sleepInit(): SleepState {
  const now = Date.now();
  return {
    phase: "veille",
    cycleStart: now,
    timeInPhase: 0,
    consolidationMultiplier: 1.0,
    decaySlowdown: 1.0,
  };
}

/**
 * Calcule la phase actuelle du cycle circadien
 * Retourne la phase déterminée par le temps écoulé depuis le début du cycle
 */
export function computeSleepPhase(now: number, cycleStart: number): {
  phase: SleepState["phase"];
  consolidationMultiplier: number;
  decaySlowdown: number;
  progressInCycle: number;
} {
  const cycleMs = SLEEP_CONFIG.cycleDurationSeconds * 1000;
  const elapsed = now - cycleStart;
  const progressInCycle = (elapsed % cycleMs) / cycleMs; // 0 à 1
  
  let cumulative = 0;
  let phase: SleepState["phase"] = "veille";
  
  // Déterminer la phase actuelle
  for (const [phaseName, duration] of Object.entries(SLEEP_CONFIG.phases)) {
    cumulative += duration;
    if (progressInCycle < cumulative) {
      phase = phaseName as SleepState["phase"];
      break;
    }
  }
  
  // Si on a dépassé toutes les phases définies, on est en "reveil" jusqu'au prochain cycle
  if (progressInCycle >= 0.95) {
    phase = "reveil";
  }
  
  const mult = SLEEP_CONFIG.consolidationMultipliers[phase] ?? 1.0;
  const slowdown = SLEEP_CONFIG.decaySlowdowns[phase] ?? 1.0;
  
  return { phase, consolidationMultiplier: mult, decaySlowdown: slowdown, progressInCycle };
}

/**
 * Met à jour l'état du sommeil selon le temps actuel
 * Doit être appelé à chaque tick
 */
export function sleepUpdate(state: SleepState, now: number): SleepState {
  const { phase, consolidationMultiplier, decaySlowdown, progressInCycle } = computeSleepPhase(now, state.cycleStart);
  
  // Détecter un changement de phase
  const phaseChanged = phase !== state.phase;
  
  // Calculer le temps dans la phase actuelle
  const cycleMs = SLEEP_CONFIG.cycleDurationSeconds * 1000;
  const elapsed = now - state.cycleStart;
  const timeInPhase = elapsed % cycleMs;
  
  // Reset du cycle si on revient à "veille" après un cycle complet
  let newCycleStart = state.cycleStart;
  if (phase === "veille" && state.phase === "reveil") {
    newCycleStart = now; // Nouveau cycle commence
  }
  
  return {
    phase,
    cycleStart: newCycleStart,
    timeInPhase,
    consolidationMultiplier,
    decaySlowdown,
  };
}

/**
 * Vérifie si le système est actuellement en phase de sommeil (tout sauf veille/reveil)
 */
export function isSleeping(state: SleepState): boolean {
  return !["veille", "reveil"].includes(state.phase);
}

/**
 * Retourne un résumé lisible de l'état du sommeil pour les logs/debug
 */
export function sleepSummary(state: SleepState): string {
  const phaseLabels: Record<SleepState["phase"], string> = {
    veille: "🌞 Veille",
    endormissement: "🌙 Endormissement",
    sommeil_leger: "😴 Sommeil léger",
    sommeil_profond: "💤 Sommeil profond",
    rem: "🌀 REM (replay)",
    reveil: "☀️ Réveil",
  };
  
  const label = phaseLabels[state.phase] || state.phase;
  const progress = Math.round((state.timeInPhase / (SLEEP_CONFIG.cycleDurationSeconds * 1000)) * 100);
  
  return `${label} — consolidation ×${state.consolidationMultiplier.toFixed(1)}, decay ×${state.decaySlowdown.toFixed(1)}`;
}

/**
 * Calcule le seuil de promotion effectif pendant la phase actuelle
 * Un multiplicateur élevé abaisse le seuil effectif (plus facile de promouvoir)
 */
export function effectivePromotionThreshold(baseThreshold: number, multiplier: number): number {
  // Plus le multiplicateur est haut, plus le seuil baisse (promotion facilitée)
  // Formule : seuil_effectif = seuil_base / (1 + (mult - 1) * 0.5)
  // Ex: mult=2.5 → seuil ≈ base/1.75 ≈ 0.57*base
  return baseThreshold / (1 + (multiplier - 1) * 0.4);
}

/**
 * Calcule le lambda de decay effectif pendant la phase actuelle
 * Un slowdown faible réduit le decay
 */
export function effectiveDecayLambda(baseLambda: number, slowdown: number): number {
  return baseLambda * slowdown;
}

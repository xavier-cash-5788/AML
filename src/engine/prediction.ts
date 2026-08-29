// ── prediction.ts : erreur de prédiction de récompense (dopamine réelle) ─────
// Le vrai système dopaminergique code une ERREUR DE PRÉDICTION (surprise par
// rapport à une attente), pas la récompense brute. Ce module garde une trace
// des attentes précédentes et compare pour calculer l'erreur de prédiction.

import { clamp01, clamp } from "./core";

export interface PredictionRecord {
  context: string;      // contexte de la prédiction (haché ou résumé)
  expectedValence: number; // valence attendue (-1 à 1)
  expectedIntensity: number; // intensité attendue (0-1)
  timestamp: number;    // quand la prédiction a été faite
  confidence: number;   // confiance dans cette prédiction (0-1)
  fulfilled?: boolean;  // si la prédiction a été réalisée
  actualValence?: number; // valence réelle observée
  error?: number;       // erreur de prédiction calculée
}

export interface PredictionState {
  history: PredictionRecord[];
  maxHistory: number;   // nombre max de prédictions en mémoire
  learningRate: number; // vitesse d'apprentissage des patterns
  baselineExpectation: {
    valence: number;    // attente de valence par défaut
    intensity: number;  // attente d'intensité par défaut
  };
  recentErrors: number[]; // erreurs récentes pour ajustement
}

export const PREDICTION_CONFIG = {
  // Nombre max de prédictions en mémoire
  maxHistorySize: 20,
  
  // Taux d'apprentissage pour mettre à jour les attentes
  learningRate: 0.15,
  
  // Attentes par défaut (avant tout apprentissage)
  defaultBaseline: {
    valence: 0.0,     // neutre par défaut
    intensity: 0.3,   // intensité modérée attendue
  },
  
  // Seuil pour considérer une "surprise" significative
  surpriseThreshold: 0.25,
  
  // Facteurs pour le calcul de l'erreur
  weights: {
    valenceError: 0.6,   // poids de l'erreur de valence
    intensityError: 0.4, // poids de l'erreur d'intensité
  },
  
  // Decay des erreurs récentes (pour éviter biais trop ancien)
  errorDecayRate: 0.1,
};

/**
 * Initialise l'état de prédiction avec des attentes par défaut
 */
export function predictionInit(): PredictionState {
  return {
    history: [],
    maxHistory: PREDICTION_CONFIG.maxHistorySize,
    learningRate: PREDICTION_CONFIG.learningRate,
    baselineExpectation: { ...PREDICTION_CONFIG.defaultBaseline },
    recentErrors: [],
  };
}

/**
 * Crée une prédiction basée sur le contexte actuel
 * Le contexte peut être un résumé de la situation, des souvenirs rappelés, etc.
 */
export function makePrediction(
  state: PredictionState,
  context: string,
  now: number,
  confidenceOverride?: number
): PredictionState {
  // Calculer l'attente basée sur l'historique récent et la baseline
  const recentPredictions = state.history.slice(-5);
  
  let expectedValence = state.baselineExpectation.valence;
  let expectedIntensity = state.baselineExpectation.intensity;
  let confidence = confidenceOverride ?? 0.5;
  
  // Ajuster selon les patterns récents (apprentissage simple)
  if (recentPredictions.length > 0) {
    const avgValence = recentPredictions.reduce((s, p) => s + p.expectedValence, 0) / recentPredictions.length;
    const avgIntensity = recentPredictions.reduce((s, p) => s + p.expectedIntensity, 0) / recentPredictions.length;
    
    // Pondérer entre baseline et pattern récent
    const recencyWeight = Math.min(0.5, recentPredictions.length * 0.1);
    expectedValence = expectedValence * (1 - recencyWeight) + avgValence * recencyWeight;
    expectedIntensity = expectedIntensity * (1 - recencyWeight) + avgIntensity * recencyWeight;
    
    // La confiance augmente avec la cohérence des patterns
    const variance = recentPredictions.reduce((s, p) => s + Math.pow(p.expectedValence - avgValence, 2), 0) / recentPredictions.length;
    confidence = clamp01(0.5 + (1 - Math.sqrt(variance)) * 0.4);
  }
  
  const record: PredictionRecord = {
    context,
    expectedValence: clamp(expectedValence, -1, 1),
    expectedIntensity: clamp01(expectedIntensity),
    timestamp: now,
    confidence: clamp01(confidence),
  };
  
  const updatedHistory = [...state.history, record].slice(-state.maxHistory);
  
  return {
    ...state,
    history: updatedHistory,
  };
}

/**
 * Calcule l'erreur de prédiction dopamine-like
 * Retourne un score d'erreur positif (surprise positive) ou négatif (déception)
 */
export function computePredictionError(
  state: PredictionState,
  actualValence: number,
  actualIntensity: number,
  context?: string
): {
  error: number;         // erreur nette (-1 à 1)
  valenceError: number;  // composante valence
  intensityError: number; // composante intensité
  surprise: number;      // magnitude absolue de surprise (0-1)
  state: PredictionState;
  lastPrediction?: PredictionRecord;
} {
  // Trouver la prédiction la plus récente correspondant au contexte
  let lastPred: PredictionRecord | undefined;
  
  if (context) {
    lastPred = state.history.find(p => 
      p.context === context && !p.fulfilled
    );
  }
  
  // Sinon utiliser la dernière prédiction non fulfillée
  if (!lastPred) {
    lastPred = state.history.find(p => !p.fulfilled);
  }
  
  // Si aucune prédiction, utiliser la baseline comme attente implicite
  const expectedValence = lastPred?.expectedValence ?? state.baselineExpectation.valence;
  const expectedIntensity = lastPred?.expectedIntensity ?? state.baselineExpectation.intensity;
  const confidence = lastPred?.confidence ?? 0.5;
  
  // Calculer les erreurs
  const valenceError = actualValence - expectedValence; // -2 à 2
  const intensityError = actualIntensity - expectedIntensity; // -1 à 1
  
  // Erreur pondérée, modulée par la confiance
  // Plus on était confiant, plus l'erreur a d'impact
  const rawError = (
    valenceError * PREDICTION_CONFIG.weights.valenceError +
    intensityError * PREDICTION_CONFIG.weights.intensityError
  ) * confidence;
  
  const error = clamp(rawError, -1, 1);
  const surprise = Math.abs(error);
  
  // Mettre à jour la prédiction si elle existe
  let newHistory = [...state.history];
  if (lastPred) {
    const idx = newHistory.findIndex(p => p === lastPred);
    if (idx >= 0) {
      newHistory[idx] = {
        ...lastPred,
        fulfilled: true,
        actualValence,
        error,
      };
    }
  }
  
  // Ajouter l'erreur aux erreurs récentes (avec decay)
  const newRecentErrors = [
    ...state.recentErrors.map(e => e * (1 - PREDICTION_CONFIG.errorDecayRate)),
    error
  ].slice(-10);
  
  // Ajuster la baseline selon les erreurs récentes (apprentissage)
  const avgError = newRecentErrors.reduce((s, e) => s + e, 0) / newRecentErrors.length;
  const newBaselineValence = state.baselineExpectation.valence + avgError * state.learningRate * 0.3;
  
  const newState: PredictionState = {
    ...state,
    history: newHistory,
    recentErrors: newRecentErrors,
    baselineExpectation: {
      ...state.baselineExpectation,
      valence: clamp(newBaselineValence, -1, 1),
    },
  };
  
  return {
    error,
    valenceError,
    intensityError,
    surprise,
    state: newState,
    lastPrediction: lastPred,
  };
}

/**
 * Calcule le signal dopaminergique basé sur l'erreur de prédiction
 * Contrairement à la récompense brute, c'est la DIFFÉRENCE qui compte
 */
export function dopamineSignalFromError(
  predictionError: number,
  surprise: number,
  baseDopamineLevel: number
): number {
  // Le signal dopaminergique réel :
  // - Positif si meilleure que prévue (surprise positive)
  // - Négatif si pire que prévu (surprise négative / déception)
  // - Proportionnel à la magnitude de la surprise
  
  const signal = predictionError * (0.5 + 0.5 * surprise);
  
  // Moduler avec le niveau de base (homéostasie)
  const adjusted = baseDopamineLevel + signal * 0.4;
  
  return clamp01(adjusted);
}

/**
 * Détermine si une surprise est significative (digne d'un pic hormonal)
 */
export function isSignificantSurprise(surprise: number): boolean {
  return surprise > PREDICTION_CONFIG.surpriseThreshold;
}

/**
 * Résumé lisible de l'état de prédiction pour logs/debug
 */
export function predictionSummary(state: PredictionState): string {
  const totalPreds = state.history.length;
  const fulfilledPreds = state.history.filter(p => p.fulfilled).length;
  const accuracy = totalPreds > 0 ? fulfilledPreds / totalPreds : 0;
  
  const avgError = state.recentErrors.length > 0
    ? state.recentErrors.reduce((s, e) => s + e, 0) / state.recentErrors.length
    : 0;
  
  return `Prédictions: ${totalPreds} (${Math.round(accuracy * 100)}% précision) · ` +
    `Erreur moy: ${avgError.toFixed(2)} · ` +
    `Baseline attendue: valence ${state.baselineExpectation.valence.toFixed(2)}`;
}

/**
 * Nettoie les anciennes prédictions fulfillées (garde seulement les récentes)
 */
export function cleanupPredictions(state: PredictionState, keepRecent: number = 5): PredictionState {
  const fulfilled = state.history.filter(p => p.fulfilled);
  const pending = state.history.filter(p => !p.fulfilled);
  
  // Garder seulement les N dernières prédictions fulfillées
  const keptFulfilled = fulfilled.slice(-keepRecent);
  
  return {
    ...state,
    history: [...keptFulfilled, ...pending],
  };
}

/**
 * Estime la "valence attendue" pour un contexte donné
 * Utile pour anticiper avant de faire une vraie prédiction
 */
export function estimateExpectedValence(
  state: PredictionState,
  contextKeywords: string[]
): number {
  // Chercher des prédictions passées avec contexte similaire
  const similar = state.history.filter(p => 
    contextKeywords.some(k => p.context.toLowerCase().includes(k.toLowerCase()))
  );
  
  if (similar.length === 0) {
    return state.baselineExpectation.valence;
  }
  
  // Moyenne pondérée par la confiance et la récence
  const now = Date.now();
  const weightedSum = similar.reduce((sum, p) => {
    const ageWeight = Math.exp(-(now - p.timestamp) / 600000); // decay sur 10 min
    const confidenceWeight = p.confidence;
    return sum + p.expectedValence * ageWeight * confidenceWeight;
  }, 0);
  
  const totalWeight = similar.reduce((sum, p) => {
    const ageWeight = Math.exp(-(now - p.timestamp) / 600000);
    return sum + ageWeight * p.confidence;
  }, 0);
  
  return totalWeight > 0 ? weightedSum / totalWeight : state.baselineExpectation.valence;
}

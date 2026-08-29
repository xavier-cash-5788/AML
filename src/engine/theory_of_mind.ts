// ── theory_of_mind.ts : modélisation des états mentaux de l'utilisateur ──────
// Contrairement à la simple détection d'émotion sur le message, ce module
// maintient un modèle persistant des croyances, intentions et états émotionnels
// de l'utilisateur (Theory of Mind - ToM).

import { clamp01, uid } from "./core";

export interface UserMentalState {
  // Croyances attribuées à l'utilisateur (ce qu'il "sait" ou "croit")
  beliefs: Belief[];
  
  // Intentions détectées (buts, désirs)
  intentions: Intention[];
  
  // État émotionnel global (au-delà du message actuel)
  emotionalState: {
    valence: number;      // -1 à 1 (humeur de fond)
    arousal: number;      // 0 à 1 (niveau d'énergie/activation)
    stability: number;    // 0 à 1 (stabilité émotionnelle)
    lastUpdated: number;
  };
  
  // Niveau de confiance envers le système
  trustLevel: number;     // 0 à 1
  
  // Engagement dans l'interaction
  engagement: number;     // 0 à 1
  
  // Historique des états récents (pour détecter patterns)
  recentStates: { t: number; valence: number; engagement: number }[];
}

export interface Belief {
  id: string;
  content: string;           // proposition attribuée
  confidence: number;        // certitude qu'on attribue à l'utilisateur (0-1)
  valence: number;           // charge émotionnelle associée (-1 à 1)
  source: string;            // indice qui a mené à cette inférence
  createdAt: number;
  lastActivated: number;
  challenged?: boolean;      // si cette croyance a été remise en question
}

export interface Intention {
  id: string;
  type: "seeking_info" | "seeking_support" | "sharing_experience" | 
        "testing" | "exploring" | "venting" | "bonding" | "problem_solving";
  description: string;
  confidence: number;        // certitude sur l'intention (0-1)
  urgency: number;           // 0 à 1 (besoin de réponse rapide)
  createdAt: number;
  fulfilled?: boolean;
}

export const TOM_CONFIG = {
  // Seuil pour inférer une croyance stable
  beliefThreshold: 0.6,
  
  // Nombre max de croyances en mémoire
  maxBeliefs: 15,
  
  // Decay des croyances non réactivées (par minute)
  beliefDecayRate: 0.02,
  
  // Seuil pour détecter une intention
  intentionThreshold: 0.5,
  
  // Poids des différents indices pour l'inférence
  inferenceWeights: {
    lexical: 0.35,         // mots-clés
    emotional: 0.30,       // ton émotionnel
    contextual: 0.20,      // contexte de la conversation
    historical: 0.15,      // patterns historiques
  },
  
  // Mots-clés indicateurs d'intentions
  intentionKeywords: {
    seeking_info: ["comment", "pourquoi", "qu'est-ce", "quel", "quelle", "savoir", "comprendre", "explication"],
    seeking_support: ["aide", "soutien", "conseil", "guidance", "recommandation", "que faire"],
    sharing_experience: ["j'ai", "je me", "mon", "ma", "hier", "aujourd'hui", "récemment"],
    testing: ["tu es", "peux-tu", "es-tu capable", "test", "vérifier"],
    exploring: ["et si", "imagine", "supposons", "hypothèse", "curieux"],
    venting: ["énervé", "frustré", "marre", "ras-le-bol", "fatigué", "déçu"],
    bonding: ["ami", "ensemble", "partage", "confiance", "lien", "relation"],
    problem_solving: ["problème", "solution", "résoudre", "blocage", "difficulté", "obstacle"],
  },
  
  // Mots indicateurs de croyances (modalisateurs)
  beliefMarkers: [
    "je pense", "je crois", "je suis sûr", "il me semble", "à mon avis",
    "c'est clair", "évidemment", "bien sûr", "jamais", "toujours",
  ],
};

/**
 * Initialise l'état mental de l'utilisateur avec des valeurs par défaut
 */
export function theoryOfMindInit(): UserMentalState {
  return {
    beliefs: [],
    intentions: [],
    emotionalState: {
      valence: 0.0,
      arousal: 0.3,
      stability: 0.8,
      lastUpdated: Date.now(),
    },
    trustLevel: 0.5,
    engagement: 0.5,
    recentStates: [],
  };
}

/**
 * Infère les intentions de l'utilisateur basées sur son message
 */
export function inferIntentions(
  state: UserMentalState,
  text: string,
  emotionIntensity: number,
  emotionValence: number,
  now: number
): { state: UserMentalState; detectedIntentions: Intention[] } {
  const lower = text.toLowerCase();
  const detected: Intention[] = [];
  
  // Chercher des indicateurs lexicaux d'intentions
  for (const [type, keywords] of Object.entries(TOM_CONFIG.intentionKeywords)) {
    let matchCount = 0;
    let totalWeight = 0;
    
    for (const keyword of keywords) {
      if (lower.includes(keyword)) {
        matchCount++;
        totalWeight += 1.0;
      }
    }
    
    if (matchCount > 0) {
      // Calculer la confiance basée sur le nombre de correspondances
      const confidence = clamp01(0.4 + (matchCount * 0.15) + (emotionIntensity * 0.2));
      
      // L'urgence dépend de l'intensité émotionnelle et du type
      let urgency = emotionIntensity * 0.5;
      if (["seeking_support", "venting", "problem_solving"].includes(type)) {
        urgency += 0.2;
      }
      
      detected.push({
        id: uid(),
        type: type as Intention["type"],
        description: `Intention de ${type.replace("_", " ")}`,
        confidence,
        urgency: clamp01(urgency),
        createdAt: now,
      });
    }
  }
  
  // Filtrer par seuil de confiance
  const strongIntentions = detected.filter(i => i.confidence >= TOM_CONFIG.intentionThreshold);
  
  // Mettre à jour l'historique des intentions (garder les récentes)
  const updatedIntentions = [
    ...state.intentions.filter(i => !i.fulfilled && i.createdAt > now - 5 * 60000).slice(-5),
    ...strongIntentions
  ].slice(-TOM_CONFIG.maxBeliefs);
  
  return {
    state: { ...state, intentions: updatedIntentions },
    detectedIntentions: strongIntentions,
  };
}

/**
 * Infère les croyances de l'utilisateur basées sur son discours
 */
export function inferBeliefs(
  state: UserMentalState,
  text: string,
  emotionValence: number,
  now: number
): { state: UserMentalState; inferredBeliefs: Belief[] } {
  const lower = text.toLowerCase();
  const inferred: Belief[] = [];
  
  // Détecter les marqueurs de croyance
  for (const marker of TOM_CONFIG.beliefMarkers) {
    const idx = lower.indexOf(marker);
    if (idx >= 0) {
      // Extraire le contenu après le marqueur (simplifié)
      const contentStart = idx + marker.length;
      const contentEnd = Math.min(lower.length, contentStart + 80);
      let content = text.slice(contentStart, contentEnd).trim();
      
      // Nettoyer la ponctuation finale
      content = content.replace(/[.,!?;:]+$/, "");
      
      if (content.length > 5) {
        // La confiance dépend de la force du marqueur
        let baseConfidence = 0.5;
        if (["je suis sûr", "c'est clair", "évidemment", "bien sûr"].includes(marker)) {
          baseConfidence = 0.7;
        } else if (["jamais", "toujours"].includes(marker)) {
          baseConfidence = 0.6;
        }
        
        inferred.push({
          id: uid(),
          content,
          confidence: clamp01(baseConfidence + Math.abs(emotionValence) * 0.1),
          valence: emotionValence,
          source: `marqueur "${marker}"`,
          createdAt: now,
          lastActivated: now,
        });
      }
    }
  }
  
  // Fusionner avec les croyances existantes similaires
  const mergedBeliefs = [...state.beliefs];
  for (const newBelief of inferred) {
    const similarIdx = mergedBeliefs.findIndex(b => {
      const overlap = computeTextOverlap(b.content, newBelief.content);
      return overlap > 0.6;
    });
    
    if (similarIdx >= 0) {
      // Renforcer la croyance existante
      mergedBeliefs[similarIdx] = {
        ...mergedBeliefs[similarIdx],
        confidence: clamp01(mergedBeliefs[similarIdx].confidence + 0.1),
        lastActivated: now,
        valence: (mergedBeliefs[similarIdx].valence + newBelief.valence) / 2,
      };
    } else {
      // Ajouter la nouvelle croyance
      mergedBeliefs.push(newBelief);
    }
  }
  
  // Limiter le nombre de croyances
  const cappedBeliefs = mergedBeliefs
    .sort((a, b) => b.lastActivated - a.lastActivated)
    .slice(0, TOM_CONFIG.maxBeliefs);
  
  return {
    state: { ...state, beliefs: cappedBeliefs },
    inferredBeliefs: inferred,
  };
}

/**
 * Met à jour l'état émotionnel global de l'utilisateur
 */
export function updateEmotionalState(
  state: UserMentalState,
  currentValence: number,
  currentIntensity: number,
  now: number
): UserMentalState {
  const prev = state.emotionalState;
  
  // Nouvelle valence comme moyenne pondérée
  const newValence = prev.valence * 0.7 + currentValence * 0.3;
  
  // Arousal basé sur l'intensité
  const newArousal = clamp01(prev.arousal * 0.6 + currentIntensity * 0.4);
  
  // Stabilité : variance récente des états
  const recentValences = state.recentStates.slice(-5).map(s => s.valence);
  const variance = recentValences.length > 1
    ? recentValences.reduce((s, v) => s + Math.pow(v - newValence, 2), 0) / recentValences.length
    : 0;
  const newStability = clamp01(1 - Math.sqrt(variance));
  
  // Ajouter à l'historique
  const newRecentStates = [
    ...state.recentStates,
    { t: now, valence: currentValence, engagement: state.engagement }
  ].slice(-20);
  
  return {
    ...state,
    emotionalState: {
      valence: newValence,
      arousal: newArousal,
      stability: newStability,
      lastUpdated: now,
    },
    recentStates: newRecentStates,
  };
}

/**
 * Met à jour le niveau de confiance (trust) envers le système
 */
export function updateTrust(
  state: UserMentalState,
  interactionQuality: number, // -1 à 1 (négatif = déception, positif = satisfaction)
  now: number
): UserMentalState {
  const delta = interactionQuality * 0.15;
  const newTrust = clamp01(state.trustLevel + delta);
  
  return {
    ...state,
    trustLevel: newTrust,
  };
}

/**
 * Met à jour l'engagement de l'utilisateur
 */
export function updateEngagement(
  state: UserMentalState,
  messageLength: number,
  questionCount: number,
  responseDelay?: number
): UserMentalState {
  // L'engagement augmente avec la longueur, les questions, et la rapidité
  const lengthFactor = clamp01(messageLength / 200); // normalisé
  const questionFactor = clamp01(questionCount * 0.3);
  
  let newEngagement = state.engagement * 0.7 + (lengthFactor * 0.4 + questionFactor * 0.6) * 0.3;
  
  // Bonus si réponse rapide (l'utilisateur attendait)
  if (responseDelay !== undefined && responseDelay < 3000) {
    newEngagement += 0.05;
  }
  
  return {
    ...state,
    engagement: clamp01(newEngagement),
  };
}

/**
 * Calcule un chevauchement textuel simple (pour détecter similarité)
 */
function computeTextOverlap(a: string, b: string): number {
  const tokensA = new Set(a.toLowerCase().split(/\s+/).filter(w => w.length > 3));
  const tokensB = new Set(b.toLowerCase().split(/\s+/).filter(w => w.length > 3));
  
  if (tokensA.size === 0 || tokensB.size === 0) return 0;
  
  let overlap = 0;
  tokensA.forEach(t => {
    if (tokensB.has(t)) overlap++;
  });
  
  return overlap / Math.max(tokensA.size, tokensB.size);
}

/**
 * Retourne les croyances actives (récentes et fortes)
 */
export function getActiveBeliefs(state: UserMentalState, now: number): Belief[] {
  const threshold = TOM_CONFIG.beliefThreshold * 0.8;
  return state.beliefs.filter(b => 
    b.confidence >= threshold && 
    b.lastActivated > now - 10 * 60000
  );
}

/**
 * Retourne l'intention dominante actuelle
 */
export function getDominantIntention(state: UserMentalState): Intention | null {
  if (state.intentions.length === 0) return null;
  
  const active = state.intentions.filter(i => !i.fulfilled);
  if (active.length === 0) return null;
  
  return active.reduce((max, i) => 
    (i.confidence * i.urgency) > (max.confidence * max.urgency) ? i : max
  );
}

/**
 * Résumé lisible de l'état mental pour logs/debug
 */
export function theoryOfMindSummary(state: UserMentalState): string {
  const emo = state.emotionalState;
  const beliefCount = state.beliefs.length;
  const intentionCount = state.intentions.filter(i => !i.fulfilled).length;
  
  const moodLabel = emo.valence > 0.2 ? "positif" : emo.valence < -0.2 ? "négatif" : "neutre";
  const arousalLabel = emo.arousal > 0.6 ? "actif" : emo.arousal < 0.3 ? "calme" : "modéré";
  
  return `ToM: humeur ${moodLabel} (${emo.valence.toFixed(2)}), ${arousalLabel} (${emo.arousal.toFixed(2)}) · ` +
    `stabilité: ${(emo.stability * 100).toFixed(0)}% · ` +
    `confiance: ${(state.trustLevel * 100).toFixed(0)}% · ` +
    `engagement: ${(state.engagement * 100).toFixed(0)}% · ` +
    `${beliefCount} croyances, ${intentionCount} intentions actives`;
}

/**
 * Applique le decay temporel aux croyances
 */
export function theoryOfMindDecay(state: UserMentalState, now: number): UserMentalState {
  const minutesElapsed = 1; // appelé chaque tick (~1 min simulée)
  const decayFactor = TOM_CONFIG.beliefDecayRate * minutesElapsed;
  
  const updatedBeliefs = state.beliefs
    .map(b => ({
      ...b,
      confidence: Math.max(0, b.confidence - decayFactor),
    }))
    .filter(b => b.confidence > 0.3); // Supprimer les croyances trop faibles
  
  // Retour progressif vers la baseline émotionnelle
  const baselineDrift = 0.02;
  const newEmotionalState = {
    ...state.emotionalState,
    valence: state.emotionalState.valence * (1 - baselineDrift),
    arousal: state.emotionalState.arousal * (1 - baselineDrift) + 0.3 * baselineDrift,
  };
  
  return {
    ...state,
    beliefs: updatedBeliefs,
    emotionalState: newEmotionalState,
  };
}

/**
 * Marque une intention comme fulfillée
 */
export function fulfillIntention(state: UserMentalState, intentionId: string): UserMentalState {
  const updated = state.intentions.map(i =>
    i.id === intentionId ? { ...i, fulfilled: true } : i
  );
  
  return { ...state, intentions: updated };
}

/**
 * Évalue la qualité d'une interaction du point de vue de l'utilisateur
 * (pour mettre à jour trust et engagement)
 */
export function estimateInteractionQuality(
  userValence: number,
  userEngagement: number,
  responseRelevance: number
): number {
  // Qualité perçue = combinaison de valence, engagement et pertinence
  return (userValence * 0.3 + userEngagement * 0.3 + responseRelevance * 0.4);
}

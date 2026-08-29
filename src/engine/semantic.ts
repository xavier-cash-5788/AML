// ── semantic.ts : mémoire sémantique distincte de l'épisodique ───────────────
// Un vrai cerveau sépare :
// - Mémoire épisodique : "je me souviens d'avoir appris ça" (contexte daté)
// - Mémoire sémantique : "je sais que" (connaissances désindexées du contexte)
// Actuellement tout se mélange dans Souvenir. Ce module ajoute une mémoire
// sémantique distincte pour les faits et connaissances générales.

import { clamp01, uid, embed, cosine } from "./core";

export interface SemanticFact {
  id: string;
  content: string;         // le fait/connaissance lui-même
  category: string;        // catégorie sémantique (ex: "définition", "règle", "fait")
  confidence: number;      // certitude dans ce fait (0-1)
  activations: number;     // nombre de fois activé/utilisé
  lastActivated: number;   // dernière activation
  sourceEpisodic?: string; // ID du souvenir épisodique source (optionnel)
  relatedConcepts: string[]; // concepts liés (pour la navigation sémantique)
  embedding: number[];     // vecteur pour recherche sémantique
}

export interface SemanticNetwork {
  facts: SemanticFact[];
  associations: SemanticAssociation[]; // liens entre faits
  maxFacts: number;        // capacité maximale
  abstractionThreshold: number; // seuil pour transformer épisodique → sémantique
}

export interface SemanticAssociation {
  factA: string;  // ID du fait A
  factB: string;  // ID du fait B
  strength: number; // force de l'association (0-1)
  type: "synonymie" | "antonymie" | "hyponymie" | "meronymie" | "cooccurrence";
}

export const SEMANTIC_CONFIG = {
  // Capacité maximale de faits sémantiques
  maxFacts: 100,
  
  // Seuil pour qu'un souvenir épisodique devienne sémantique
  // (après plusieurs rappels similaires, on extrait le fait général)
  abstractionThreshold: 3, // nombre de rappels similaires
  
  // Taux d'apprentissage des nouvelles associations
  associationLearningRate: 0.15,
  
  // Decay des associations non utilisées
  associationDecayRate: 0.02,
  
  // Catégories sémantiques par défaut
  defaultCategories: ["definition", "regle", "fait_general", "preference_personnelle", "connaissance_partagee"],
};

/**
 * Initialise la mémoire sémantique vide
 */
export function semanticInit(): SemanticNetwork {
  return {
    facts: [],
    associations: [],
    maxFacts: SEMANTIC_CONFIG.maxFacts,
    abstractionThreshold: SEMANTIC_CONFIG.abstractionThreshold,
  };
}

/**
 * Ajoute un fait sémantique directement
 */
export function addSemanticFact(
  network: SemanticNetwork,
  content: string,
  category: string,
  confidence: number = 0.8,
  relatedConcepts: string[] = []
): { network: SemanticNetwork; fact: SemanticFact } {
  const fact: SemanticFact = {
    id: uid(),
    content,
    category,
    confidence: clamp01(confidence),
    activations: 0,
    lastActivated: Date.now(),
    relatedConcepts,
    embedding: embed(content),
  };
  
  const newFacts = network.facts.length >= network.maxFacts
    ? [...network.facts.slice(1), fact] // FIFO si capacité atteinte
    : [...network.facts, fact];
  
  return { network: { ...network, facts: newFacts }, fact };
}

/**
 * Extrait un fait sémantique d'un souvenir épisodique répété
 * C'est le mécanisme de "dégénérescence" épisodique → sémantique
 */
export function extractSemanticFromEpisodic(
  network: SemanticNetwork,
  episodicMemories: Array<{ texte: string; id: string; foisRappele: number }>,
  similarTexts: string[]
): { network: SemanticNetwork; extracted?: SemanticFact; reason: string } {
  if (similarTexts.length < network.abstractionThreshold) {
    return { network, reason: `pas assez de répétitions (${similarTexts.length} < ${network.abstractionThreshold})` };
  }
  
  // Extraire le contenu commun/abstrait des souvenirs similaires
  // Approche simple : prendre les mots communs et former un résumé
  const commonContent = extractCommonContent(similarTexts);
  
  if (commonContent.length < 10) {
    return { network, reason: "contenu commun trop court pour être significatif" };
  }
  
  // Déterminer la catégorie basée sur le contenu
  const category = inferCategory(commonContent);
  
  // La confiance dépend du nombre de répétitions et de la similarité
  const confidence = clamp01(0.5 + Math.min(0.4, similarTexts.length * 0.08));
  
  // Créer le fait sémantique
  const result = addSemanticFact(network, commonContent, category, confidence);
  
  // Lier au dernier souvenir épisodique source
  if (episodicMemories.length > 0) {
    const lastEpisodic = episodicMemories[episodicMemories.length - 1];
    result.fact.sourceEpisodic = lastEpisodic.id;
  }
  
  return { 
    network: result.network, 
    fact: result.fact, 
    reason: `abstraction créée à partir de ${similarTexts.length} souvenirs similaires` 
  };
}

/**
 * Extrait le contenu commun de plusieurs textes similaires
 * (version simplifiée - en production, utiliser un modèle d'abstraction)
 */
function extractCommonContent(texts: string[]): string {
  if (texts.length === 0) return "";
  if (texts.length === 1) return texts[0];
  
  // Approche naive : prendre les mots qui apparaissent dans tous les textes
  const tokenSets = texts.map(t => 
    new Set(t.toLowerCase().split(/\s+/).filter(w => w.length > 3))
  );
  
  // Trouver l'intersection
  const common = [...tokenSets[0]].filter(token =>
    tokenSets.slice(1).every(set => set.has(token))
  );
  
  // Si pas assez de mots communs, prendre le premier texte comme base
  if (common.length < 3) {
    return texts[0].slice(0, 100);
  }
  
  // Reconstruire une phrase cohérente (très simplifié)
  return common.join(" ").slice(0, 120);
}

/**
 * Infère une catégorie sémantique basée sur le contenu
 */
function inferCategory(content: string): string {
  const lower = content.toLowerCase();
  
  if (lower.includes("est un") || lower.includes("est une") || lower.includes("c'est")) {
    return "definition";
  }
  if (lower.includes("toujours") || lower.includes("jamais") || lower.includes("il faut")) {
    return "regle";
  }
  if (lower.includes("j'aime") || lower.includes("je préfère") || lower.includes("je déteste")) {
    return "preference_personnelle";
  }
  if (lower.includes("on sait") || lower.includes("on dit") || lower.includes("en général")) {
    return "connaissance_partagee";
  }
  
  return "fait_general";
}

/**
 * Recherche un fait sémantique par similarité
 */
export function searchSemanticFacts(
  network: SemanticNetwork,
  query: string,
  topK: number = 3
): Array<{ fact: SemanticFact; score: number }> {
  const queryVec = embed(query);
  
  const results = network.facts
    .map(fact => ({
      fact,
      score: cosine(queryVec, fact.embedding),
    }))
    .filter(r => r.score > 0.1)
    .sort((a, b) => b.score - a.score)
    .slice(0, topK);
  
  return results;
}

/**
 * Active un fait sémantique (quand il est utilisé/rappelé)
 */
export function activateSemanticFact(
  network: SemanticNetwork,
  factId: string,
  now: number
): { network: SemanticNetwork; fact?: SemanticFact } {
  const index = network.facts.findIndex(f => f.id === factId);
  if (index < 0) return { network };
  
  const fact = network.facts[index];
  const updated: SemanticFact = {
    ...fact,
    activations: fact.activations + 1,
    lastActivated: now,
    confidence: clamp01(fact.confidence + 0.02), // légère augmentation de confiance
  };
  
  const newFacts = [...network.facts];
  newFacts[index] = updated;
  
  return { network: { ...network, facts: newFacts }, fact: updated };
}

/**
 * Crée ou renforce une association entre deux faits
 */
export function associateFacts(
  network: SemanticNetwork,
  factIdA: string,
  factIdB: string,
  type: SemanticAssociation["type"] = "cooccurrence"
): { network: SemanticNetwork; association?: SemanticAssociation } {
  // Vérifier que les faits existent
  const existsA = network.facts.some(f => f.id === factIdA);
  const existsB = network.facts.some(f => f.id === factIdB);
  
  if (!existsA || !existsB) {
    return { network };
  }
  
  // Chercher une association existante
  const existingIdx = network.associations.findIndex(a =>
    (a.factA === factIdA && a.factB === factIdB) ||
    (a.factA === factIdB && a.factB === factIdA)
  );
  
  if (existingIdx >= 0) {
    // Renforcer l'association existante
    const assoc = network.associations[existingIdx];
    const updated = {
      ...assoc,
      strength: clamp01(assoc.strength + SEMANTIC_CONFIG.associationLearningRate),
    };
    
    const newAssocs = [...network.associations];
    newAssocs[existingIdx] = updated;
    
    return { network: { ...network, associations: newAssocs }, association: updated };
  }
  
  // Créer une nouvelle association
  const newAssoc: SemanticAssociation = {
    factA: factIdA,
    factB: factIdB,
    strength: SEMANTIC_CONFIG.associationLearningRate,
    type,
  };
  
  return {
    network: { ...network, associations: [...network.associations, newAssoc] },
    association: newAssoc,
  };
}

/**
 * Applique le decay aux associations non utilisées
 */
export function semanticDecay(network: SemanticNetwork): SemanticNetwork {
  const updated = network.associations
    .map(a => ({
      ...a,
      strength: Math.max(0, a.strength - SEMANTIC_CONFIG.associationDecayRate),
    }))
    .filter(a => a.strength > 0.05);
  
  return { ...network, associations: updated };
}

/**
 * Trouve les faits liés à un fait donné via les associations
 */
export function getRelatedFacts(
  network: SemanticNetwork,
  factId: string,
  minStrength: number = 0.2
): SemanticFact[] {
  const relatedIds = network.associations
    .filter(a => (a.factA === factId || a.factB === factId) && a.strength >= minStrength)
    .map(a => a.factA === factId ? a.factB : a.factA);
  
  return network.facts.filter(f => relatedIds.includes(f.id));
}

/**
 * Résumé lisible de la mémoire sémantique pour logs/debug
 */
export function semanticSummary(network: SemanticNetwork): string {
  const totalFacts = network.facts.length;
  const byCategory: Record<string, number> = {};
  network.facts.forEach(f => {
    byCategory[f.category] = (byCategory[f.category] ?? 0) + 1;
  });
  
  const categoryBreakdown = Object.entries(byCategory)
    .map(([cat, count]) => `${cat}: ${count}`)
    .join(", ");
  
  const totalAssocs = network.associations.length;
  const strongAssocs = network.associations.filter(a => a.strength > 0.5).length;
  
  return `Sémantique: ${totalFacts} faits (${categoryBreakdown || "vide"}) · ${totalAssocs} associations (${strongAssocs} fortes)`;
}

/**
 * Vérifie si un contenu est déjà stocké comme fait sémantique
 * Utile pour éviter les doublons avant d'ajouter
 */
export function isAlreadySemantic(network: SemanticNetwork, content: string, threshold: number = 0.85): boolean {
  const results = searchSemanticFacts(network, content, 1);
  return results.length > 0 && results[0].score >= threshold;
}

/**
 * Met à jour la confiance d'un fait (par exemple, après une correction)
 */
export function updateFactConfidence(
  network: SemanticNetwork,
  factId: string,
  delta: number
): { network: SemanticNetwork; fact?: SemanticFact } {
  const index = network.facts.findIndex(f => f.id === factId);
  if (index < 0) return { network };
  
  const fact = network.facts[index];
  const updated: SemanticFact = {
    ...fact,
    confidence: clamp01(fact.confidence + delta),
  };
  
  const newFacts = [...network.facts];
  newFacts[index] = updated;
  
  return { network: { ...network, facts: newFacts }, fact: updated };
}

/**
 * Supprime un fait sémantique (et ses associations)
 */
export function removeSemanticFact(network: SemanticNetwork, factId: string): SemanticNetwork {
  return {
    ...network,
    facts: network.facts.filter(f => f.id !== factId),
    associations: network.associations.filter(a => a.factA !== factId && a.factB !== factId),
  };
}

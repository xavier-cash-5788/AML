// ── Types partagés de l'architecture ia_locale_memoire (port TypeScript) ─────

export type Valence = "positif" | "neutre" | "negatif";
export type LlmProvider = "simule" | "ollama";

export interface Config {
  llm: {
    provider: LlmProvider;
    model: string;
    endpoint: string;
  };
  memory: {
    max_size_mb: number;
    tic_interval_seconds: number;
    decay_lambda_neutre: number;
    decay_lambda_negatif: number;
    decay_lambda_positif: number;
    seuil_promotion_graphe: number;
    seuil_oubli: number;
    max_variation_par_interaction: number;
  };
}

/** Un souvenir du stockage vectoriel (équivalent ChromaDB) */
export interface Souvenir {
  id: string;
  texte: string;
  creeLe: number; // timestamp ms
  intensiteInitiale: number; // I₀ ∈ [0,1]
  valence: Valence;
  valenceScore: number; // ∈ [-1,1]
  traits: string[]; // ids de traits activés à l'encodage
  foisRappele: number;
  promu: boolean; // consolidé dans le graphe
  embedding: number[];
  /** regulation/hippocampus : "contextualise" = daté, decay normal · "non_resolu" = à vif, rejouable intact */
  statut: "contextualise" | "non_resolu";
}

/** Nœud du graphe de traits (équivalent NetworkX) */
export interface TraitNode {
  id: string;
  label: string;
  valence: number; // ∈ [-1,1]
  force: number; // ∈ [0,1]
  origine: "primitif" | "acquis";
  activations: number;
  dernierRenfort: number;
  emerge: boolean; // thème émergent détecté par cluster_by_theme
}

export interface TraitEdge {
  a: string;
  b: string;
  poids: number;
}

export type EventType =
  | "TIC"
  | "DECAY"
  | "PROMOTION"
  | "CONSOLIDATION"
  | "OUBLI"
  | "STOCKAGE"
  | "RENFORCEMENT"
  | "EVAL"
  | "PROMPT"
  | "LLM"
  | "SEED"
  | "RESET"
  | "TAILLE"
  | "EMERGENCE"
  | "CONFIG"
  | "CHAT"
  | "HORM"
  | "FLASH"
  | "RECONSO"
  | "REGIME";

export interface MemEvent {
  id: number;
  t: number;
  type: EventType;
  module: string;
  message: string;
}

export interface EmotionEval {
  intensite: number; // 0..1
  valence: number; // -1..1
  valenceCat: Valence;
  traits_actives: string[]; // ids de traits
  impact: number; // valence × intensité
  source: "lexique" | "llm";
}

export interface ChatMessage {
  id: string;
  role: "user" | "assistant";
  texte: string;
  t: number;
  emotion?: EmotionEval;
  rappels?: number;
  ton?: string; // ton hormonal observé dans la réponse
  flashback?: boolean; // une trace non résolue a resurgi intacte
}

export interface TickSummary {
  t: number;
  decayes: number;
  promus: string[];
  oublies: string[];
  tailleOctets: number;
}

// ── state/ : couche hormonale (court terme) ──────────────────────────────────
export type HormoneId = "adrenaline" | "cortisol" | "dopamine" | "serotonine" | "ocytocine";
export interface HormoneLevel {
  level: number;
  prev: number;
}
export type HormonesState = Record<HormoneId, HormoneLevel>;
export interface HormonesHistoryPoint {
  t: number;
  v: Record<HormoneId, number>;
}

// ── regulation/ : boucle amygdale → hippocampe → cortex préfrontal ───────────
export type Regime = "sain" | "tendu" | "traumatique";
export interface RegulationState {
  amygdalaSeuil: number; // seuil de déclenchement (baisse = hypersensibilité)
  amygdalaActivation: number; // niveau d'activation courant 0..1
  activRecentes: number; // activations rapprochées non régulées
  prefrontalForce: number; // force du signal de régulation 0..1
  hippocampeInhibe: boolean;
  regime: Regime;
}

export interface SysState {
  now: number;
  config: Config;
  memories: Souvenir[];
  nodes: TraitNode[];
  edges: TraitEdge[];
  events: MemEvent[];
  chat: ChatMessage[];
  typing: boolean;
  nextTickAt: number;
  tickCount: number;
  totalForgotten: number;
  lastTick: TickSummary | null;
  llmMode: "simule" | "ollama";
  promptDebug: string | null;
  sizeBytes: number;
  flash: Record<string, number>;
  hormones: HormonesState;
  hormonesHistory: HormonesHistoryPoint[];
  regulation: RegulationState;
  recentValences: { v: number; t: number }[];
}

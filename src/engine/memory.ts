// ── memory/ : vector_memory, graph_memory, decay_engine, memory_size_manager ─
import type { Config, Souvenir, TraitEdge, TraitNode, Valence } from "./types";
import { PRIMITIVE_SEED, clamp01, clamp, cosine, embed, uid } from "./core";

// ═══ memory/vector_memory.py ════════════════════════════════════════════════
export function vectorAdd(memories: Souvenir[], texte: string, valence: Valence, valenceScore: number, traits: string[], intensite: number): Souvenir[] {
  const s: Souvenir = {
    id: uid(),
    texte,
    creeLe: Date.now(),
    intensiteInitiale: clamp01(Math.max(0.2, intensite)),
    valence,
    valenceScore,
    traits,
    foisRappele: 0,
    promu: false,
    embedding: embed(texte),
  };
  return [...memories, s];
}

export interface SearchHit {
  s: Souvenir;
  score: number;
}

export function vectorSearch(memories: Souvenir[], query: string, topK = 3): SearchHit[] {
  const qv = embed(query);
  return memories
    .map((s) => ({ s, score: cosine(qv, s.embedding) }))
    .filter((h) => h.score > 0.08)
    .sort((a, b) => b.score - a.score)
    .slice(0, topK);
}

export function vectorUpdateForce(memories: Souvenir[], id: string, delta: number): Souvenir[] {
  return memories.map((s) =>
    s.id === id ? { ...s, intensiteInitiale: clamp01(s.intensiteInitiale + delta) } : s
  );
}

export function vectorDelete(memories: Souvenir[], id: string): Souvenir[] {
  return memories.filter((s) => s.id !== id);
}

// ═══ memory/graph_memory.py ═════════════════════════════════════════════════
export function seedGraph(): { nodes: TraitNode[]; edges: TraitEdge[] } {
  const now = Date.now();
  const nodes: TraitNode[] = PRIMITIVE_SEED.traits.map((t) => ({
    id: t.id,
    label: t.label,
    valence: t.valence,
    force: t.force,
    origine: "primitif",
    activations: 0,
    dernierRenfort: now,
    emerge: false,
  }));
  const edges: TraitEdge[] = PRIMITIVE_SEED.liens.map(([a, b, poids]) => ({ a, b, poids }));
  return { nodes, edges };
}

export function keywordToTrait(): { id: string; keywords: string[] }[] {
  return PRIMITIVE_SEED.traits.map((t) => ({ id: t.id, keywords: t.keywords }));
}

/** reinforce(trait, delta) — borné par max_variation_par_interaction */
export function graphReinforce(nodes: TraitNode[], id: string, delta: number, maxVar: number, now: number): TraitNode[] {
  const d = clamp(delta, -maxVar, maxVar);
  return nodes.map((n) =>
    n.id === id
      ? { ...n, force: clamp01(n.force + d), activations: n.activations + 1, dernierRenfort: now }
      : n
  );
}

export function graphAddNode(nodes: TraitNode[], id: string, label: string, valence: number, force: number, now: number): TraitNode[] {
  if (nodes.some((n) => n.id === id)) return nodes;
  return [
    ...nodes,
    { id, label, valence, force: clamp01(force), origine: "acquis", activations: 1, dernierRenfort: now, emerge: false },
  ];
}

export function graphCoActivate(edges: TraitEdge[], traitIds: string[]): TraitEdge[] {
  const uniq = [...new Set(traitIds)];
  if (uniq.length < 2) return edges;
  let out = [...edges];
  for (let i = 0; i < uniq.length; i++) {
    for (let j = i + 1; j < uniq.length; j++) {
      const a = uniq[i], b = uniq[j];
      const ex = out.find((e) => (e.a === a && e.b === b) || (e.a === b && e.b === a));
      if (ex) out = out.map((e) => (e === ex ? { ...e, poids: clamp01(e.poids + 0.15) } : e));
      else out.push({ a, b, poids: 0.2 });
    }
  }
  return out;
}

export function getActiveTraits(nodes: TraitNode[], n = 6): TraitNode[] {
  return [...nodes].filter((x) => x.force >= 0.12).sort((a, b) => b.force - a.force).slice(0, n);
}

/** cluster_by_theme() : peurs / attirances / thèmes émergents */
export function clusterByTheme(nodes: TraitNode[]) {
  const peurs = nodes.filter((n) => n.valence < -0.15).sort((a, b) => b.force - a.force);
  const attirances = nodes.filter((n) => n.valence > 0.15).sort((a, b) => b.force - a.force);
  const neutres = nodes.filter((n) => Math.abs(n.valence) <= 0.15);
  const emergents = nodes.filter((n) => n.origine === "acquis" && n.force >= 0.6);
  return { peurs, attirances, neutres, emergents };
}

/** Homéostasie synaptique : léger déclin du graphe à chaque tic */
export function graphTick(nodes: TraitNode[]): TraitNode[] {
  return nodes.map((n) => {
    const floor = n.origine === "primitif" ? 0.25 : 0.05;
    return { ...n, force: Math.max(floor, n.force * 0.995) };
  });
}

// ═══ memory/decay_engine.py ═════════════════════════════════════════════════
/** force(t) = I₀ × e^(−λ·Δt), λ dépend de la valence — Δt en minutes */
export function forceOf(s: Souvenir, now: number, cfg: Config): number {
  const lam =
    s.valence === "negatif"
      ? cfg.memory.decay_lambda_negatif
      : s.valence === "positif"
        ? cfg.memory.decay_lambda_positif
        : cfg.memory.decay_lambda_neutre;
  const dtMin = Math.max(0, (now - s.creeLe) / 60000);
  return clamp01(s.intensiteInitiale * Math.exp(-lam * dtMin));
}

/** Score de promotion : force + récurrence (rappels) */
export function promotionScore(s: Souvenir, now: number, cfg: Config): number {
  return forceOf(s, now, cfg) * 0.7 + Math.min(0.3, s.foisRappele * 0.1);
}

// ═══ memory/memory_size_manager.py ══════════════════════════════════════════
export function totalSizeBytes(memories: Souvenir[], nodes: TraitNode[], edges: TraitEdge[], eventsCount: number): number {
  const json = JSON.stringify(memories) + JSON.stringify(nodes) + JSON.stringify(edges);
  // estimation UTF-8 + index ChromaDB + overhead journal
  return Math.round(json.length * 1.35 + eventsCount * 180);
}

/** Force l'oubli des souvenirs les plus faibles pour repasser sous le plafond */
export function enforceCap(
  memories: Souvenir[],
  nodes: TraitNode[],
  edges: TraitEdge[],
  eventsCount: number,
  cfg: Config
): { kept: Souvenir[]; dropped: Souvenir[] } {
  const cap = cfg.memory.max_size_mb * 1024 * 1024;
  const warn = cap * 0.9;
  let kept = [...memories];
  const dropped: Souvenir[] = [];
  let size = totalSizeBytes(kept, nodes, edges, eventsCount);
  while (size > warn && kept.length > 0) {
    let weakest = 0;
    let weakestF = Infinity;
    kept.forEach((s, i) => {
      const f = s.intensiteInitiale;
      if (f < weakestF) {
        weakestF = f;
        weakest = i;
      }
    });
    dropped.push(kept[weakest]);
    kept = kept.filter((_, i) => i !== weakest);
    size = totalSizeBytes(kept, nodes, edges, eventsCount);
  }
  return { kept, dropped };
}

// ── tests/ : suite de tests unitaires exécutable en direct ───────────────────
import type { Config, Souvenir } from "./types";
import { DEFAULT_CONFIG, cosine, embed, uid } from "./core";
import {
  forceOf, getActiveTraits, graphAddNode, graphReinforce, promotionScore,
  seedGraph, totalSizeBytes, vectorAdd, vectorDelete, vectorSearch, vectorUpdateForce,
} from "./memory";
import { evaluateEmotion } from "./brain";

export interface TestResult {
  file: string;
  name: string;
  ok: boolean;
  detail: string;
}

const mkSouvenir = (texte: string, minsAgo: number, I0: number, valence: Souvenir["valence"]): Souvenir => ({
  id: uid(),
  texte,
  creeLe: Date.now() - minsAgo * 60000,
  intensiteInitiale: I0,
  valence,
  valenceScore: valence === "positif" ? 0.5 : valence === "negatif" ? -0.5 : 0,
  traits: [],
  foisRappele: 0,
  promu: false,
  embedding: embed(texte),
});

export function runAllTests(): TestResult[] {
  const R: TestResult[] = [];
  const add = (file: string, name: string, ok: boolean, detail: string) => R.push({ file, name, ok, detail });
  const cfg: Config = JSON.parse(JSON.stringify(DEFAULT_CONFIG));

  // ── tests/test_vector_memory.py ──
  {
    const f = "tests/test_vector_memory.py";
    let mem: Souvenir[] = [];
    mem = vectorAdd(mem, "j'ai très peur du noir quand la nuit tombe", "negatif", -0.7, ["noir"], 0.8);
    mem = vectorAdd(mem, "le soleil chaud sur la terrasse, j'adore", "positif", 0.7, ["chaleur"], 0.6);
    mem = vectorAdd(mem, "la liste des courses pour mardi", "neutre", 0, [], 0.25);
    const hits = vectorSearch(mem, "peur de la nuit noire", 2);
    add(f, "add() + search() retrouvent le souvenir similaire", hits.length > 0 && hits[0].s.texte.includes("peur du noir"), hits.length ? `meilleur score cos ${hits[0].score.toFixed(2)}` : "aucun résultat");
    add(f, "search() classe par similarité décroissante", hits.length >= 2 ? hits[0].score >= hits[1].score : hits.length === 1, hits.map((h) => h.score.toFixed(2)).join(" ≥ "));
    mem = vectorUpdateForce(mem, mem[0].id, -0.5);
    add(f, "updateForce() modifie I₀", Math.abs(mem[0].intensiteInitiale - 0.3) < 1e-9, `I₀ = ${mem[0].intensiteInitiale.toFixed(2)}`);
    const before = mem.length;
    mem = vectorDelete(mem, mem[0].id);
    add(f, "delete() retire le souvenir", mem.length === before - 1, `${before} → ${mem.length}`);
  }

  // ── tests/test_graph_memory.py ──
  {
    const f = "tests/test_graph_memory.py";
    const g = seedGraph();
    add(f, "seed : primitive_seed.json charge 10 traits", g.nodes.length === 10, `${g.nodes.length} nœuds, ${g.edges.length} liens`);
    const node = g.nodes.find((n) => n.id === "abandon")!;
    const boosted = graphReinforce(g.nodes, "abandon", 5, cfg.memory.max_variation_par_interaction, Date.now());
    const after = boosted.find((n) => n.id === "abandon")!;
    add(f, "reinforce() est borné par max_variation", Math.abs(after.force - (node.force + cfg.memory.max_variation_par_interaction)) < 1e-9, `Δ plafonné à +${cfg.memory.max_variation_par_interaction} → ${after.force.toFixed(2)}`);
    const withNew = graphAddNode(g.nodes, "marqueur:araignee", "marqueur : araignee", -0.6, 0.5, Date.now());
    add(f, "add_node() crée un nœud acquis", withNew.length === g.nodes.length + 1 && withNew.find((n) => n.id === "marqueur:araignee")?.origine === "acquis", `${withNew.length} nœuds après insertion`);
    const actifs = getActiveTraits(withNew, 20);
    add(f, "get_active_traits() trie par force décroissante", actifs.every((n, i) => i === 0 || actifs[i - 1].force >= n.force), `tête : ${actifs[0]?.label} (${actifs[0]?.force.toFixed(2)})`);
  }

  // ── tests/test_decay_engine.py ──
  {
    const f = "tests/test_decay_engine.py";
    const s = mkSouvenir("un souvenir neutre quelconque", 0, 0.8, "neutre");
    const f0 = forceOf(s, Date.now(), cfg);
    const f10 = forceOf(s, Date.now() + 10 * 60000, cfg);
    add(f, "force(t) décroît avec le temps", f10 < f0, `f(0)=${f0.toFixed(3)} → f(10 min)=${f10.toFixed(3)}`);
    const neg = mkSouvenir("une peur", 60, 0.8, "negatif");
    const neu = mkSouvenir("un fait", 60, 0.8, "neutre");
    add(f, "le négatif décroît plus lentement (λ plus bas)", forceOf(neg, Date.now(), cfg) > forceOf(neu, Date.now(), cfg), `nég ${forceOf(neg, Date.now(), cfg).toFixed(3)} > neu ${forceOf(neu, Date.now(), cfg).toFixed(3)}`);
    const exact = 0.8 * Math.exp(-cfg.memory.decay_lambda_neutre * 60);
    add(f, "force(t) = I₀·e^(−λΔt) vérifiée à 60 min", Math.abs(f0 - 0.8) < 1e-9 && Math.abs(forceOf(neu, Date.now(), cfg) - exact) < 1e-6, `attendu ${exact.toFixed(4)}`);
    const strong = mkSouvenir("événement intense", 0, 0.95, "positif");
    add(f, "promotion si score ≥ seuil", promotionScore(strong, Date.now(), cfg) >= cfg.memory.seuil_promotion_graphe, `score ${promotionScore(strong, Date.now(), cfg).toFixed(2)} ≥ ${cfg.memory.seuil_promotion_graphe}`);
    const weak = mkSouvenir("vieux souvenir faible", 500, 0.1, "neutre");
    add(f, "oubli si force < seuil_oubli", forceOf(weak, Date.now(), cfg) < cfg.memory.seuil_oubli, `force ${forceOf(weak, Date.now(), cfg).toFixed(4)} < ${cfg.memory.seuil_oubli}`);
    add(f, "size_manager calcule une taille positive", totalSizeBytes([strong], seedGraph().nodes, seedGraph().edges, 10) > 0, `${totalSizeBytes([strong], seedGraph().nodes, seedGraph().edges, 10)} octets estimés`);
  }

  // ── tests/test_emotion_evaluator.py ──
  {
    const f = "tests/test_emotion_evaluator.py";
    const nodes = seedGraph().nodes;
    const pos = evaluateEmotion("Je suis tellement heureux de te retrouver, c'est un vrai bonheur !", nodes);
    add(f, "phrase positive → valence > 0", pos.valence > 0.3, `valence ${pos.valence.toFixed(2)}, intensité ${pos.intensite.toFixed(2)}`);
    const neg = evaluateEmotion("J'ai très peur, je me sens seul ce soir", nodes);
    add(f, "phrase négative → valence < 0 + traits activés", neg.valence < -0.2 && neg.traits_actives.length > 0, `valence ${neg.valence.toFixed(2)}, traits [${neg.traits_actives.join(", ")}]`);
    const noNeg = evaluateEmotion("je n'ai pas peur du tout", nodes);
    add(f, "négation inversée (« pas peur »)", noNeg.valence >= 0, `valence ${noNeg.valence.toFixed(2)}`);
    const intense = evaluateEmotion("TERRIBLE, c'est horrible !!", nodes);
    const soft = evaluateEmotion("c'est un peu ennuyeux", nodes);
    add(f, "intensité sensible aux marqueurs (!, CAPITALES)", intense.intensite > soft.intensite, `${intense.intensite.toFixed(2)} > ${soft.intensite.toFixed(2)}`);
    add(f, "embedding : phrases proches plus similaires que lointaines", cosine(embed("la peur du noir la nuit"), embed("j'ai peur quand il fait sombre")) > cosine(embed("la peur du noir la nuit"), embed("recette de tarte aux pommes")), "cos(proche) > cos(lointain)");
  }

  return R;
}

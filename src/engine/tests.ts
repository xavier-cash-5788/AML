// ── tests/ : suite de tests unitaires exécutable en direct ───────────────────
import type { Config, Souvenir } from "./types";
import { DEFAULT_CONFIG, cosine, embed, uid } from "./core";
import {
  forceOf, getActiveTraits, graphAddNode, graphReinforce, promotionScore,
  seedGraph, totalSizeBytes, vectorAdd, vectorDelete, vectorSearch, vectorUpdateForce,
} from "./memory";
import { evaluateEmotion } from "./brain";
import { HORMONES_CONFIG, hormonesDecay, hormonesInit, hormonesUpdate } from "./hormones";
import {
  amygdalaDetect, hippocampusContextualiser, prefrontalForce, regulationInit, regulationTick,
} from "./regulation";

export interface TestResult {
  file: string;
  name: string;
  ok: boolean;
  detail: string;
}

const mkSouvenir = (texte: string, minsAgo: number, I0: number, valence: Souvenir["valence"], statut: Souvenir["statut"] = "contextualise"): Souvenir => ({
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
  statut,
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
    const aVif = mkSouvenir("traumatisme non résolu", 500, 0.9, "negatif", "non_resolu");
    add(f, "un souvenir non résolu échappe au decay", Math.abs(forceOf(aVif, Date.now() + 60 * 60000, cfg) - 0.9) < 1e-9, `force constante ${forceOf(aVif, Date.now() + 60 * 60000, cfg).toFixed(2)} après 60 min`);
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

  // ── tests/test_hormonal_state.py ──
  {
    const f = "tests/test_hormonal_state.py";
    const h0 = hormonesInit();
    add(f, "init : toutes les hormones à leur baseline", Math.abs(h0.adrenaline.level - HORMONES_CONFIG.adrenaline.baseline) < 1e-9 && Math.abs(h0.serotonine.level - HORMONES_CONFIG.serotonine.baseline) < 1e-9, `adrénaline ${h0.adrenaline.level.toFixed(2)} = baseline ${HORMONES_CONFIG.adrenaline.baseline}`);
    const h1 = hormonesUpdate(h0, { intensite: 0.9, valence: -0.8, surprise: 0.9, social: 0 });
    add(f, "menace forte → pic d'adrénaline", h1.adrenaline.level - h0.adrenaline.level > 0.3, `Δ +${(h1.adrenaline.level - h0.adrenaline.level).toFixed(2)} (vitesse montée ${HORMONES_CONFIG.adrenaline.vitesse_montee})`);
    const dAdr = hormonesDecay({ ...h1, adrenaline: { level: 0.8, prev: 0.8 } }).adrenaline.level;
    const dCort = hormonesDecay({ ...h1, cortisol: { level: 0.8, prev: 0.8 } }).cortisol.level;
    add(f, "l'adrénaline redescend plus vite que le cortisol", 0.8 - dAdr > 0.8 - dCort, `Δ adrénaline ${(0.8 - dAdr).toFixed(3)} vs Δ cortisol ${(0.8 - dCort).toFixed(3)} par tic`);
    let h2 = hormonesInit();
    for (let i = 0; i < 30; i++) h2 = hormonesDecay(h2);
    add(f, "30 tics sans stimulus → retour quasi-baseline", Math.abs(h2.cortisol.level - HORMONES_CONFIG.cortisol.baseline) < 0.05, `cortisol ${h2.cortisol.level.toFixed(3)} (baseline ${HORMONES_CONFIG.cortisol.baseline})`);
    const h3 = hormonesUpdate(h0, { intensite: 0.6, valence: 0.5, surprise: 0.8, social: 0.9 });
    add(f, "lien social + positif → ocytocine et dopamine montent", h3.ocytocine.level > h0.ocytocine.level && h3.dopamine.level > h0.dopamine.level, `ocy ${h0.ocytocine.level.toFixed(2)}→${h3.ocytocine.level.toFixed(2)} · dop ${h0.dopamine.level.toFixed(2)}→${h3.dopamine.level.toFixed(2)}`);
  }

  // ── tests/test_regulation.py ──
  {
    const f = "tests/test_regulation.py";
    const r0 = regulationInit();
    add(f, "init : seuil amygdale 0,60 · préfrontal 0,75", Math.abs(r0.amygdalaSeuil - 0.6) < 1e-9 && Math.abs(r0.prefrontalForce - 0.75) < 1e-9, `seuil ${r0.amygdalaSeuil}, force ${r0.prefrontalForce}`);
    const a1 = amygdalaDetect(r0, 0.95, -0.85).r;
    add(f, "menace forte active l'amygdale et abaisse le seuil", a1.activRecentes === 1 && a1.amygdalaSeuil < r0.amygdalaSeuil, `seuil ${r0.amygdalaSeuil} → ${a1.amygdalaSeuil.toFixed(2)} (hypersensibilisation)`);
    const a2 = amygdalaDetect(a1, 0.95, -0.85).r;
    add(f, "activations répétées → seuil encore plus bas", a2.amygdalaSeuil < a1.amygdalaSeuil && a2.activRecentes === 2, `seuil ${a2.amygdalaSeuil.toFixed(2)} après 2 activations`);
    const hCalm = hormonesInit();
    const pfFort = prefrontalForce(hCalm, r0);
    add(f, "préfrontal fort à l'état calme", pfFort > 0.7, `force ${pfFort.toFixed(2)}`);
    const hStress = { ...hCalm, cortisol: { level: 0.9, prev: 0.9 }, adrenaline: { level: 0.9, prev: 0.9 } };
    const pfFaible = prefrontalForce(hStress, { ...r0, amygdalaActivation: 0.9 });
    add(f, "cortisol + adrénaline hauts → préfrontal écrasé", pfFaible < 0.3, `force ${pfFaible.toFixed(2)} (×0,3 au-dessus du seuil critique)`);
    add(f, "hippocampe inhibé si amygdale haute + préfrontal faible", hippocampusContextualiser(0.8, 0.3) === "non_resolu" && hippocampusContextualiser(0.8, 0.7) === "contextualise", "inhibé (0,8 · 0,3) vs contextualisé (0,8 · 0,7)");
    const rTick = regulationTick({ ...r0, amygdalaActivation: 0.8, prefrontalForce: 0.5, activRecentes: 2 }, 0.6, 0);
    add(f, "tic + interactions positives → préfrontal récupère, seuil remonte", rTick.prefrontalForce > 0.5 && rTick.amygdalaSeuil >= r0.amygdalaSeuil - 1e-9, `force 0,50 → ${rTick.prefrontalForce.toFixed(2)} · seuil ${rTick.amygdalaSeuil.toFixed(2)}`);
  }

  return R;
}

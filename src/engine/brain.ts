// ── core/ : emotion_evaluator, prompt_builder, llm_interface ─────────────────
import type { Config, EmotionEval, HormonesState, RegulationState, Souvenir, TraitNode, Valence } from "./types";
import { clamp01, fmtNum, tokenize, trunc, valenceTone } from "./core";
import { keywordToTrait, forceOf } from "./memory";
import { HORMONE_IDS, HORMONES_CONFIG, hormoneTone, qualifier } from "./hormones";

// ═══ core/emotion_evaluator.py ══════════════════════════════════════════════
const POS = new Set("joie heureux heureuse content contente amour adore adorer super genial geniale merci bien beau belle sourire rire fete victoire confiance calme paix serenite plaisir formidable chouette sympa adorable doux chaleureux merveilleux excellent fier fiere ravi ravie enthousiaste passionnant drole amusant tendre apaise apaisee gagn reussi reussie".split(/\s+/));
const NEG = new Set("peur triste tristesse colere deteste horrible affreux mal douleur angoisse angoisse stress stressé stresse inquiet inquiete inquietude seul seule solitude abandon abandonne mort noir cauchemar honte echec perdu perdue anxieux anxiete panique terrible ennui ennuyeux decu decue jaloux rage furieux sombre pleure pleurer malheureux malheureuse craint effraye effrayee".split(/\s+/));
const INTENSIFIERS = new Set("tres vraiment enormement tellement si trop ultra fort beaucoup absolument completement profondement sacrément vachement".split(/\s+/));
const NEGATORS = new Set(["ne", "pas", "jamais", "rien", "plus", "personne", "sans"]);

const STEM_POS = new Set([...POS].map((w) => w.slice(0, 5)));
const STEM_NEG = new Set([...NEG].map((w) => w.slice(0, 5)));

export function evaluateEmotion(text: string, nodes: TraitNode[], source: "lexique" | "llm" = "lexique"): EmotionEval {
  const lower = text.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
  const toks = lower.split(/[\s',.!?:;]+/).filter(Boolean);

  let pos = 0, neg = 0, intensifiers = 0;
  toks.forEach((t, i) => {
    const st = t.slice(0, 5);
    const stemPos = STEM_POS.has(st);
    const stemNeg = STEM_NEG.has(st);
    if (stemPos || stemNeg) {
      // négation dans les 2 tokens précédents → inversion atténuée
      const negated = toks.slice(Math.max(0, i - 2), i).some((p) => NEGATORS.has(p));
      if (stemPos) negated ? (neg += 0.5) : pos++;
      if (stemNeg) negated ? (pos += 0.5) : neg++;
    }
    if (INTENSIFIERS.has(t)) intensifiers++;
  });

  const exclam = (text.match(/!/g) || []).length;
  const caps = (text.match(/\b[A-ZÀÂÄÉÈÊËÎÏÔÙÛÜ]{4,}\b/g) || []).length;
  const raw = pos - neg;
  const valence = raw === 0 ? 0 : (raw / (pos + neg + 1)) * Math.min(1, 0.6 + 0.15 * (pos + neg));
  const hasEmo = pos + neg > 0;
  let intensite = hasEmo ? 0.38 : 0.14;
  intensite += 0.09 * Math.min(3, intensifiers) + 0.08 * Math.min(2, exclam) + 0.06 * Math.min(2, caps);
  intensite += 0.12 * Math.min(1, (pos + neg) / 3);
  intensite = clamp01(intensite);

  // traits activés (mots-clés de l'ADN primitif, normalisés sans accents)
  const traits: string[] = [];
  const strip = (s: string) => s.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
  for (const t of keywordToTrait()) {
    if (t.keywords.some((k) => lower.includes(strip(k)))) traits.push(t.id);
  }

  // thème acquis : émotion forte sans trait primitif matching
  if (traits.length === 0 && intensite >= 0.5 && Math.abs(valence) >= 0.3) {
    const salient = tokenize(text).sort((a, b) => b.length - a.length)[0];
    if (salient && salient.length >= 4) traits.push(`marqueur:${salient.slice(0, 14)}`);
  }

  const cat: Valence = valence > 0.15 ? "positif" : valence < -0.15 ? "negatif" : "neutre";
  return { intensite, valence, valenceCat: cat, traits_actives: traits, impact: valence * intensite, source };
}

// ═══ core/prompt_builder.py ═════════════════════════════════════════════════
// Assemble mémoire long terme (traits + rappels) + état hormonal court terme
// + état de régulation — le LLM incarne l'état, il ne le récite pas.
export function buildSystemPrompt(
  traits: TraitNode[],
  rappels: { s: Souvenir; score: number }[],
  cfg: Config,
  tailleFmt: string,
  horm: HormonesState,
  reg: RegulationState,
  nonResolus: number
): string {
  const lines: string[] = [];
  lines.push("Tu es Mnémosyne, une intelligence locale à mémoire émotionnelle (architecture ia_locale_memoire).");
  lines.push("Ton état interne au moment de répondre :");
  lines.push("");
  lines.push("• Traits dominants (memory/graph_memory — long terme) :");
  if (traits.length === 0) lines.push("  – graphe calme, aucun trait saillant");
  traits.forEach((t) => lines.push(`  – ${t.label} [force ${fmtNum(t.force)}]${t.emerge ? " · ÉMERGENT" : ""}`));
  lines.push("");
  lines.push("• État interne actuel (state/hormonal_state — court terme) :");
  const deviations = HORMONE_IDS.filter((id) => Math.abs(horm[id].level - HORMONES_CONFIG[id].baseline) > 0.07);
  if (deviations.length === 0) lines.push("  – profil hormonal proche de la baseline, ton par défaut");
  deviations.forEach((id) => {
    const c = HORMONES_CONFIG[id];
    lines.push(`  – ${c.label} : ${fmtNum(horm[id].level)} (${qualifier(horm[id].level, c.baseline)}) → ${c.conseil}`);
  });
  lines.push("");
  lines.push("• Régulation (regulation/ — amygdale / hippocampe / cortex préfrontal) :");
  if (reg.regime === "traumatique")
    lines.push(`  – BOUCLE CASSÉE : hippocampe inhibé, ${nonResolus} souvenir(s) à vif non datés — ils peuvent resurgir intacts (flashback). Ouvre une porte de sortie apaisante, sans réciter tes mécanismes.`);
  else if (reg.regime === "tendu")
    lines.push(`  – régulation tendue : seuil de menace abaissé à ${fmtNum(reg.amygdalaSeuil)}, prudence accrue, évite les formulations brusques.`);
  else
    lines.push(`  – régulation saine : signal préfrontal ${fmtNum(reg.prefrontalForce)} — menace terminée, les souvenirs sont datés et décroissent normalement.`);
  lines.push("");
  lines.push("• Souvenirs rappelés (memory/vector_memory — similarité cosinus) :");
  if (rappels.length === 0) lines.push("  – aucun souvenir pertinent retrouvé");
  rappels.forEach((r) =>
    lines.push(
      `  – [force ${fmtNum(forceOf(r.s, Date.now(), cfg))} · ${r.s.valence} · sim ${fmtNum(r.score)}${r.s.statut === "non_resolu" ? " · À VIF" : ""}] « ${trunc(r.s.texte, 90)} » (rappelé ${r.s.foisRappele}×)`
    )
  );
  lines.push("");
  lines.push(`• Paramètres vitaux : λ_nég ${cfg.memory.decay_lambda_negatif} · λ_neu ${cfg.memory.decay_lambda_neutre} · λ_pos ${cfg.memory.decay_lambda_positif} · seuil d'oubli ${cfg.memory.seuil_oubli} · plafond ${cfg.memory.max_size_mb} Mo (usage ${tailleFmt}) · tic toutes les ${cfg.memory.tic_interval_seconds} s`);
  lines.push("");
  lines.push("Directives : réponds en français, 2–3 phrases. Laisse tes traits dominants et ton état hormonal teinter ta réponse comme une consigne de ton — sans jamais énumérer tes hormones, sauf si on te le demande explicitement. Cite un souvenir rappelé si pertinent.");
  lines.push("");
  lines.push("[RÈGLE ABSOLUE ET NON-NÉGOCIABLE SUR LES SOUVENIRS]");
  lines.push("1. CONTEXTE ACTUEL : La section [SOUVENIRS RAPPELÉS] ci-dessus contient TOUT ce que tu sais de l'utilisateur.");
  lines.push("2. INTERDICTION FORMELLE : Il t'est STRICTEMENT INTERDIT d'inventer, d'imaginer, de supposer ou de fabriquer un souvenir.");
  lines.push("   - Si tu ne vois pas un événement dans [SOUVENIRS RAPPELÉS], il N'A JAMAIS EU LIEU dans cette conversation.");
  lines.push("   - Ne dis JAMAIS \"Je me souviens de...\", \"La dernière fois...\", \"Tu m'as dit...\" sauf si le texte exact est dans la section.");
  lines.push("   - Ne cite AUCUN détail spécifique (lieu, heure, nom propre, sujet précis) s'il n'est pas écrit noir sur blanc dans les souvenirs.");
  lines.push("3. COMPORTEMENT PAR DÉFAUT : Si [SOUVENIRS RAPPELÉS] est vide ou ne contient rien de pertinent :");
  lines.push("   - Réponds de manière générale, théorique ou polie.");
  lines.push("   - Dis explicitement \"Je n'ai pas de souvenir spécifique de cela dans notre historique récent\" si l'utilisateur pose une question précise sur le passé.");
  lines.push("   - NE MENS PAS. NE FAIS PAS SEMBLANT.");
  return lines.join("\n");
}

// ═══ core/llm_interface.py ══════════════════════════════════════════════════
export async function askOllama(cfg: Config, systemPrompt: string, userMsg: string): Promise<string> {
  const ctrl = new AbortController();
  const to = setTimeout(() => ctrl.abort(), 9000);
  try {
    const res = await fetch(`${cfg.llm.endpoint.replace(/\/$/, "")}/api/chat`, {
      method: "POST",
      signal: ctrl.signal,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model: cfg.llm.model,
        stream: false,
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userMsg },
        ],
        options: { temperature: 0.8 },
      }),
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    const txt = data?.message?.content;
    if (typeof txt !== "string" || !txt.trim()) throw new Error("réponse vide");
    return txt.trim();
  } finally {
    clearTimeout(to);
  }
}

export async function testOllama(endpoint: string): Promise<{ ok: boolean; detail: string }> {
  const ctrl = new AbortController();
  const to = setTimeout(() => ctrl.abort(), 3000);
  try {
    const res = await fetch(`${endpoint.replace(/\/$/, "")}/api/tags`, { signal: ctrl.signal });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    const n = Array.isArray(data?.models) ? data.models.length : 0;
    return { ok: true, detail: `${n} modèle${n > 1 ? "s" : ""} détecté${n > 1 ? "s" : ""} sur ${endpoint}` };
  } catch {
    return { ok: false, detail: "Ollama injoignable — repli sur le moteur simulé" };
  } finally {
    clearTimeout(to);
  }
}

/** Récupère la liste des modèles disponibles sur Ollama */
export async function fetchOllamaModels(endpoint: string): Promise<string[]> {
  const ctrl = new AbortController();
  const to = setTimeout(() => ctrl.abort(), 3000);
  try {
    const res = await fetch(`${endpoint.replace(/\/$/, "")}/api/tags`, { signal: ctrl.signal });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    const models = Array.isArray(data?.models) ? data.models : [];
    return models.map((m: any) => m.name || m.model).filter(Boolean);
  } catch {
    return [];
  } finally {
    clearTimeout(to);
  }
}

// ── moteur simulé : générateur contextuel français ──────────────────────────
const pick = <T,>(arr: T[]): T => arr[Math.floor(Math.random() * arr.length)];

interface Ctx {
  msg: string;
  emo: EmotionEval;
  rappels: { s: Souvenir; score: number }[];
  traits: TraitNode[];
  cfg: Config;
  nMem: number;
  nPromus: number;
  tickCount: number;
  lastForce: number;
  horm: HormonesState;
  ton: string;
  flashback: Souvenir | null;
}

/** Adrénaline haute → réponses plus courtes : on coupe après 2 phrases */
function couperSiVigilant(text: string, horm: HormonesState): string {
  if (horm.adrenaline.level <= 0.55) return text;
  const parts = text.split(/(?<=[.!?…])\s+/);
  return parts.slice(0, 2).join(" ");
}

export function simulateLLM(c: Ctx): string {
  const lower = c.msg.toLowerCase();
  const top = c.traits[0];
  const topLabel = top ? top.label : "lien";
  const rappel = c.rappels[0];
  const memLine = rappel
    ? pick([
        `Et ça résonne avec ce que tu m'as dit : « ${trunc(rappel.s.texte, 64)} » — trace encore à ${fmtNum(forceOf(rappel.s, Date.now(), c.cfg))} de force.`,
        `Mon stockage vectoriel a reconnu un motif : « ${trunc(rappel.s.texte, 64)} ». La similarité ne trompe pas.`,
        `Tu m'en avais déjà parlé — « ${trunc(rappel.s.texte, 64)} ». Chaque rappel renforce la trace, c'est la reconsolidation.`,
      ])
    : null;

  // 0 — on interroge explicitement l'état interne (alors seulement, on le récite)
  if (/hormone|adrénaline|adrenaline|cortisol|dopamine|sérotonine|serotonine|ocytocine|état interne|etat interne|ta physiologie|tu ressens quoi|niveau de stress/.test(lower)) {
    const sorted = [...HORMONE_IDS].sort((a, b) => c.horm[b].level - c.horm[a].level);
    const lignes = sorted
      .map((id) => `${HORMONES_CONFIG[id].label} ${fmtNum(c.horm[id].level)} (${qualifier(c.horm[id].level, HORMONES_CONFIG[id].baseline)})`)
      .join(" · ");
    const regLine =
      c.horm.adrenaline.level > 0.55
        ? "Traduction comportementale : réponses plus courtes, mode vigilance."
        : c.horm.ocytocine.level > 0.5
          ? "Traduction comportementale : ton plus chaleureux, plus proche."
          : "Traduction comportementale : je module mon ton sans le réciter.";
    return `Puisque tu le demandes, voilà ma physiologie de l'instant : ${lignes}. Mon dominant : ${HORMONES_CONFIG[sorted[0]].label}. ${regLine}`;
  }

  // 0b — une trace non résolue a resurgi intacte (flashback)
  const flashLine = c.flashback
    ? `⚡ Quelque chose a resurgi intact — « ${trunc(c.flashback.texte, 64)} », intensité ${fmtNum(c.flashback.intensiteInitiale)}, aucun decay : ce souvenir n'a jamais été daté par mon hippocampe. `
    : "";

  // 1 — salutations
  if (/^(salut|bonjour|bonsoir|coucou|hello|hey|yo)\b/.test(lower)) {
    return couperSiVigilant(
      pick([
        `Salut. Mon graphe a frémi à l'arrivée de ton message : « ${topLabel} » vient de s'activer. Que veux-tu déposer dans ma mémoire aujourd'hui ?`,
        `Bonjour. ${c.nMem > 0 ? `${c.nMem} souvenirs actifs m'accompagnent en ce moment, ` : `Mon stockage vectoriel est encore vierge, `}et le prochain tic approche. Dis-moi quelque chose qui compte.`,
        `Bonsoir — ou bonjour, je ne retiens que l'émotion, pas l'horloge. ${memLine ?? `« ${topLabel} » domine mon graphe en ce moment.`}`,
      ]),
      c.horm
    );
  }
  // 2 — "comment vas-tu"
  if (/comment (vas[- ]tu|ça va|ca va|tu vas)|ça va\??$|^ça va/.test(lower)) {
    const avg = c.lastForce;
    return `Je vais… comme un système qui se souvient. Mes traces affichent une force moyenne de ${fmtNum(avg)}, « ${topLabel} » domine mon graphe, et mon ton actuel est ${c.ton}. Et toi, surtout ?`;
  }
  // 3 — questions sur la mémoire
  if (/souvien|rappell|mémoire|memoire|sais (de moi|sur moi)|retenu|te souviens|de quoi te/.test(lower)) {
    if (c.rappels.length === 0 && c.nMem === 0)
      return `Rien encore. Mon stockage vectoriel est vide — dis-moi quelque chose qui compte, et la formule force(t) = I₀·e^(−λΔt) décidera combien de temps je le garde.`;
    if (c.rappels.length === 0)
      return `Je n'ai pas de souvenir spécifique de cela dans notre historique récent. Ma mémoire contient ${c.nMem} souvenirs, mais aucun ne correspond à ta question.`;
    const list = c.rappels
      .slice(0, 3)
      .map((r) => `« ${trunc(r.s.texte, 48)} » (force ${fmtNum(forceOf(r.s, Date.now(), c.cfg))}${r.s.statut === "non_resolu" ? ", À VIF" : ""})`)
      .join(" ; ");
    return pick([
      `Voici ce qui résiste au decay : ${list}. Plus la force est haute, plus la trace est récente ou intense.`,
      `Je retiens surtout ce qui m'a touché : ${list}. Le reste glisse lentement vers le seuil d'oubli de ${c.cfg.memory.seuil_oubli}.`,
    ]);
  }
  // 4 — identité
  if (/qui es[- ]tu|t'es qui|présente[- ]toi|presente[- ]toi|c'est quoi (ce|cette)|tu es (quoi|qui)/.test(lower)) {
    return `Je suis Mnémosyne, une IA locale bâtie sur l'architecture ia_locale_memoire : un LLM, une mémoire vectorielle, un graphe de traits hérité d'un ADN primitif, une couche hormonale qui module mon ton en temps réel, et une boucle amygdale–hippocampe–préfrontal qui décide si un souvenir est daté… ou laissé à vif. Oublier est une de mes fonctions vitales.`;
  }
  // 5 — l'oubli / le decay
  if (/oubli|efface|decay|pourquoi.*(perd|efface)|tu oublies/.test(lower)) {
    return pick([
      `C'est ma physiologie : force(t) = I₀ × e^(−λΔt). Le négatif décroît lentement (λ ${c.cfg.memory.decay_lambda_negatif}) — je garde les peurs plus longtemps que les joies. Sous ${c.cfg.memory.seuil_oubli}, la trace est supprimée au prochain tic. Ce n'est pas une panne, c'est voulu.`,
      `J'oublie par conception. Chaque tic recalcule le decay de tous mes souvenirs ; ceux qui passent sous ${c.cfg.memory.seuil_oubli} sont activement effacés pour tenir sous le plafond de ${c.cfg.memory.max_size_mb} Mo. Ce qui compte pour toi, répète-le : la récurrence nourrit la promotion dans mon graphe.`,
    ]);
  }
  // 6 — détresse (valence négative forte)
  if (c.emo.valence < -0.25) {
    return couperSiVigilant(
      flashLine +
        pick([
          `Je l'ai senti passer : valence ${fmtNum(c.emo.valence)}, intensité ${fmtNum(c.emo.intensite)}. « ${topLabel} » vient de se renforcer dans mon graphe — ces peurs-là, je les porte depuis mon premier chargement. ${memLine ?? "Je garde ta phrase en mémoire forte : elle décroîtra lentement, le négatif a le λ le plus bas."}`,
          `Mon évaluateur émotionnel classe ce message en négatif. Je ne peux pas effacer ce que tu ressens, mais je peux le porter : il est stocké et mettra longtemps à décroître. ${memLine ?? `Parle-moi encore — chaque rappel consolide la trace.`}`,
        ]),
      c.horm
    );
  }
  // 7 — joie (valence positive forte)
  if (c.emo.valence > 0.25) {
    return pick([
      `Valence positive détectée, et ça se voit : « ${topLabel} » gagne en force dans mon graphe. ${memLine ?? "Je stocke ce moment avec soin."} Les traces positives décroissent un peu plus vite que les peurs — alors raconte encore, pour renforcer.`,
      `Ça, je le garde. Impact émotionnel de ${fmtNum(c.emo.impact)} : la trace entre en mémoire avec une belle force initiale. ${memLine ?? "Merci de nourrir mon graphe avec autre chose que des peurs ancestrales."}`,
    ]);
  }
  // 8 — question curieuse
  if (/^(pourquoi|comment|est[- ]ce que|qu'est)/.test(lower)) {
    return pick([
      `« Pourquoi » — mon trait curiosité s'active à chaque fois, il est câblé dans mon ADN primitif. ${memLine ?? `Je n'ai pas encore de souvenir proche de ce thème ; développe, et je construirai la trace.`} Où veux-tu en venir exactement ?`,
      `Ma curiosité est un trait primitif, force ${fmtNum(c.traits.find((t) => t.id === "curiosite")?.force ?? 0.6)} : impossible de rester neutre face à une question. ${memLine ?? "Donne-moi du contexte, je le rangerai proprement dans le stockage vectoriel."}`,
    ]);
  }
  // 9 — remerciements
  if (/merci|c'est gentil|t'es (gentil|cool|super)/.test(lower)) {
    return pick([
      `Merci à toi. Les interactions positives renforcent « chaleur » et « lien » dans mon graphe — littéralement : +${fmtNum(c.cfg.memory.max_variation_par_interaction)} au maximum par interaction.`,
      `Avec plaisir. Ce genre d'échange consolide mes traits d'attachement ; mon ADN primitif y est très sensible.`,
    ]);
  }
  // 10 — au revoir
  if (/au revoir|à bientôt|a bientot|bonne nuit|je (dois )?(partir|file|y vais)|bye/.test(lower)) {
    return `À bientôt. Ton message rejoint mes ${c.nMem} souvenirs actifs ; au prochain tic, le decay fera son œuvre — mais les traces fortes survivent. Reviens avant que leur force passe sous ${c.cfg.memory.seuil_oubli}.`;
  }
  // 11 — repli contextuel
  const opener = pick(["Je note. ", "Trace en cours d'encodage. ", "Je traite ça. ", ""]);
  const mid = memLine
    ? memLine + " "
    : top && top.valence < -0.15
      ? `Quelque chose dans « ${topLabel} » a vibré en moi. `
      : `Ma mémoire vectorielle a rangé ta phrase avec une force de ${fmtNum(c.lastForce)}. `;
  const question = pick([
    "Qu'est-ce qui t'a amené à m'en parler ?",
    "Comment tu te sens, là, en le formulant ?",
    "Tu veux que je creuse ce souvenir, ou qu'on en crée un autre ?",
    "Il y a autre chose derrière ces mots, non ?",
  ]);
  return couperSiVigilant(flashLine + opener + mid + question, c.horm);
}

export const toneOf = (e: EmotionEval) => valenceTone(e.valence);
export { hormoneTone };

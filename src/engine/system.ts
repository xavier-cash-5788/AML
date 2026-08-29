// ── main.py + memory/memory_scheduler.py : orchestration + store réactif ────
import { useSyncExternalStore } from "react";
import type { ChatMessage, Config, EventType, HormonesState, MemEvent, RegulationState, Souvenir, SysState } from "./types";
import { DEFAULT_CONFIG, clamp01, fmtBytes, trunc, uid, valenceTone } from "./core";
import {
  enforceCap, forceOf, getActiveTraits, graphAddNode, graphCoActivate, graphReinforce,
  graphTick, promotionScore, seedGraph, totalSizeBytes, vectorAdd, vectorDelete,
  vectorSearch, vectorUpdateForce,
} from "./memory";
import { askOllama, buildSystemPrompt, evaluateEmotion, simulateLLM } from "./brain";
import { hormoneTone, hormonesDecay, hormonesInit, hormonesUpdate, socialScore } from "./hormones";
import {
  amygdalaDetect, computeRegime, hippocampusContextualiser, oldestUnresolved,
  prefrontalForce, reconsolidable, regulationInit, regulationTick,
} from "./regulation";
import { sleepInit, sleepUpdate, isSleeping, sleepSummary, effectivePromotionThreshold, effectiveDecayLambda } from "./sleep";
import { attentionInit, attentionDecay, attentionSummary, addToFocus, autoAdjustFocusMode, cognitiveLoad } from "./attention";
import { predictionInit, makePrediction, computePredictionError, dopamineSignalFromError, isSignificantSurprise, predictionSummary } from "./prediction";
import { habitsInit, habitsDecay, habitsSummary, extractContext, reinforceHabit } from "./habits";
import { semanticInit, semanticDecay, semanticSummary, extractSemanticFromEpisodic } from "./semantic";
import { theoryOfMindInit, theoryOfMindDecay, theoryOfMindSummary, inferIntentions, inferBeliefs, updateEmotionalState, updateTrust, updateEngagement } from "./theory_of_mind";
import { spontaneityInit, generateSpontaneousThoughts, selectNextSpontaneousThought, markThoughtExpressed, cleanupThoughts, adjustInhibition, spontaneitySummary } from "./spontaneous";

const LS_KEY = "mnemosyne.state.v1";
const MAX_EVENTS = 260;

function loadPersisted(): Partial<SysState> | null {
  try {
    const raw = localStorage.getItem(LS_KEY);
    if (!raw) return null;
    return JSON.parse(raw) as Partial<SysState>;
  } catch {
    return null;
  }
}

function freshState(): SysState {
  const g = seedGraph();
  const now = Date.now();
  return {
    now,
    config: DEFAULT_CONFIG,
    memories: [],
    nodes: g.nodes,
    edges: g.edges,
    events: [],
    chat: [
      {
        id: uid(),
        role: "assistant",
        t: now,
        texte:
          "Bonjour. Je suis Mnémosyne — une IA locale à mémoire émotionnelle. Mon ADN primitif vient d'être chargé : 10 traits ancestraux, de la peur de l'abandon à l'attirance pour la chaleur. Sous ma mémoire, une couche hormonale module mon ton en temps réel, et une boucle amygdale–hippocampe–préfrontal décide si tes mots seront datés… ou laissés à vif. Parle-moi — je retiendrai selon la force de ce que tu dis.",
      },
    ],
    typing: false,
    nextTickAt: now + DEFAULT_CONFIG.memory.tic_interval_seconds * 1000,
    tickCount: 0,
    totalForgotten: 0,
    lastTick: null,
    llmMode: "simule",
    promptDebug: null,
    sizeBytes: 0,
    flash: {},
    hormones: hormonesInit(),
    hormonesHistory: [],
    regulation: regulationInit(),
    recentValences: [],
    sleep: sleepInit(),
    attention: attentionInit(),
    prediction: predictionInit(),
    habits: habitsInit(),
    semantic: semanticInit(),
    theoryOfMind: theoryOfMindInit(),
    spontaneity: spontaneityInit(),
  };
}

class MemorySystem {
  state: SysState;
  private listeners = new Set<() => void>();
  private saveTimer: ReturnType<typeof setTimeout> | null = null;
  private eventId = 1;
  private logQueue: Omit<MemEvent, "id">[] = [];
  private lastConfigLog = 0;

  constructor() {
    const persisted = loadPersisted();
    const base = freshState();
    if (persisted && Array.isArray(persisted.memories)) {
      this.state = {
        ...base,
        ...persisted,
        now: Date.now(),
        typing: false,
        nextTickAt: Date.now() + (persisted.config ?? base.config).memory.tic_interval_seconds * 1000,
        flash: {},
        // migration : anciennes sauvegardes sans les nouvelles couches
        memories: (persisted.memories as Souvenir[]).map((m) => ({ ...m, statut: m.statut ?? "contextualise" })),
        hormones: persisted.hormones ?? base.hormones,
        hormonesHistory: persisted.hormonesHistory ?? [],
        regulation: persisted.regulation ?? base.regulation,
        recentValences: persisted.recentValences ?? [],
        sleep: persisted.sleep ?? base.sleep,
        attention: persisted.attention ?? base.attention,
        prediction: persisted.prediction ?? base.prediction,
        habits: persisted.habits ?? base.habits,
        semantic: persisted.semantic ?? base.semantic,
        theoryOfMind: persisted.theoryOfMind ?? base.theoryOfMind,
        spontaneity: persisted.spontaneity ?? base.spontaneity,
      } as SysState;
      this.log("SEED", "memory/memory_scheduler", "Session restaurée depuis storage/ (localStorage)");
    } else {
      this.state = base;
      this.log("SEED", "memory/graph_memory", "primitive_seed.json chargé : 10 traits ancestraux, 7 liens");
      this.log("SEED", "state/state_config", "state_config.json chargé : 5 hormones, baseline + vitesses montée/descente");
      this.log("SEED", "regulation/regulation_config", "regulation_config.json chargé : amygdale (seuil 0,60), hippocampe, préfrontal (force 0,75)");
    }
    this.state.sizeBytes = totalSizeBytes(this.state.memories, this.state.nodes, this.state.edges, this.state.events.length);
    this.commit();
    setInterval(() => this.pulse(), 1000);
  }

  subscribe = (fn: () => void) => {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  };
  getState = (): SysState => this.state;

  private commit() {
    this.state = { ...this.state };
    if (this.logQueue.length) {
      const stamped = this.logQueue.map((e) => ({ ...e, id: this.eventId++ }));
      this.logQueue = [];
      this.state.events = [...stamped, ...this.state.events].slice(0, MAX_EVENTS);
    }
    this.listeners.forEach((fn) => fn());
    if (this.saveTimer) clearTimeout(this.saveTimer);
    this.saveTimer = setTimeout(() => this.persist(), 600);
  }

  private persist() {
    try {
      const { config, memories, nodes, edges, events, chat, tickCount, totalForgotten, lastTick, hormones, hormonesHistory, regulation, recentValences, sleep, attention, prediction, habits, semantic, theoryOfMind, spontaneity } = this.state;
      localStorage.setItem(
        LS_KEY,
        JSON.stringify({
          config, memories, nodes, edges,
          events: events.slice(0, 160),
          chat: chat.slice(-80),
          tickCount, totalForgotten, lastTick,
          hormones, hormonesHistory: hormonesHistory.slice(-120), regulation, recentValences,
          sleep, attention, prediction, habits, semantic, theoryOfMind, spontaneity,
        })
      );
    } catch {
      /* stockage plein : silencieux */
    }
  }

  log(type: EventType, module: string, message: string) {
    this.logQueue.push({ t: Date.now(), type, module, message });
    this.state.flash = { ...this.state.flash, [module]: Date.now() };
  }

  flash(module: string) {
    this.state.flash = { ...this.state.flash, [module]: Date.now() };
  }

  private pushHormonesHistory(now: number, h: HormonesState) {
    const v = {
      adrenaline: h.adrenaline.level,
      cortisol: h.cortisol.level,
      dopamine: h.dopamine.level,
      serotonine: h.serotonine.level,
      ocytocine: h.ocytocine.level,
    };
    this.state.hormonesHistory = [...this.state.hormonesHistory.slice(-119), { t: now, v }];
  }

  // ── horloge + memory_scheduler : le tic ────────────────────────────────────
  private pulse() {
    const now = Date.now();
    this.state.now = now;
    if (now >= this.state.nextTickAt) this.runTick(now);
    this.commit();
  }

  forceTick() {
    this.runTick(Date.now());
    this.state.nextTickAt = Date.now() + this.state.config.memory.tic_interval_seconds * 1000;
    this.commit();
  }

  private runTick(now: number) {
    const cfg = this.state.config;
    this.flash("memory/memory_scheduler");
    let memories = [...this.state.memories];
    const promus: string[] = [];
    const oublies: string[] = [];
    let nodes = [...this.state.nodes];

    // Decay Theory of Mind
    this.state.theoryOfMind = theoryOfMindDecay(this.state.theoryOfMind, now);
    
    // Cleanup des pensées spontanées anciennes
    this.state.spontaneity = cleanupThoughts(this.state.spontaneity);

    // 1) decay + promotion + oubli actif (les traces « à vif » échappent au decay)
    const kept: Souvenir[] = [];
    for (const s of memories) {
      const f = forceOf(s, now, cfg);
      // Utiliser les lambdas effectifs du sommeil pour le decay
      const effectiveLambda = s.valence === "negatif" ? effectiveDecayLambdas.negatif : s.valence === "positif" ? effectiveDecayLambdas.positif : effectiveDecayLambdas.neutre;
      const dtMin = Math.max(0, (now - s.creeLe) / 60000);
      const fAdjusted = s.statut === "non_resolu" ? s.intensiteInitiale : clamp01(s.intensiteInitiale * Math.exp(-effectiveLambda * dtMin));
      
      if (s.statut === "contextualise" && fAdjusted < cfg.memory.seuil_oubli && s.creeLe < now - 20000) {
        oublies.push(s.texte);
        this.log("OUBLI", "memory/decay_engine", `oubli actif : « ${trunc(s.texte, 52)} » (force ${fAdjusted.toFixed(3)} < ${cfg.memory.seuil_oubli})`);
        continue;
      }
      let cur = s;
      if (!s.promu && s.statut === "contextualise" && promotionScore(s, now, cfg) >= effectivePromotionThresholdValue) {
        cur = { ...cur, promu: true, intensiteInitiale: clamp01(Math.max(cur.intensiteInitiale, fAdjusted + 0.1)) };
        for (const tid of cur.traits) {
          nodes = graphReinforce(nodes, tid, cfg.memory.max_variation_par_interaction, cfg.memory.max_variation_par_interaction, now);
        }
        promus.push(s.texte);
        this.log("PROMOTION", "memory/decay_engine", `promotion vecteur → graphe : « ${trunc(s.texte, 52)} » (seuil sommeil-adjusté: ${effectivePromotionThresholdValue.toFixed(2)})`);
        this.log("CONSOLIDATION", "memory/graph_memory", `traits renforcés : ${cur.traits.length ? cur.traits.join(", ") : "aucun"} (+${cfg.memory.max_variation_par_interaction} max)`);
      }
      kept.push(cur);
    }
    if (kept.length !== memories.length) this.flash("memory/vector_memory");
    memories = kept;

    // 2) homéostasie du graphe + émergences
    nodes = graphTick(nodes);
    for (const n of nodes) {
      if (!n.emerge && n.origine === "acquis" && n.force >= 0.6) {
        this.log("EMERGENCE", "memory/graph_memory", `cluster_by_theme() : thème émergent détecté — « ${n.label} » (force ${n.force.toFixed(2)})`);
      }
    }
    nodes = nodes.map((n) => (!n.emerge && n.origine === "acquis" && n.force >= 0.6 ? { ...n, emerge: true } : n));
    // plafond de nœuds acquis (hygiène du graphe)
    const acquis = nodes.filter((n) => n.origine === "acquis").sort((a, b) => a.force - b.force);
    if (acquis.length > 12) {
      const toDrop = new Set(acquis.slice(0, acquis.length - 12).map((n) => n.id));
      nodes = nodes.filter((n) => !toDrop.has(n.id));
    }

    // 3) state/hormonal_state : redescente vers la baseline
    this.flash("state/hormonal_state");
    const hormBefore = this.state.hormones;
    const horm = hormonesDecay(hormBefore);
    const deltaAdr = horm.adrenaline.level - hormBefore.adrenaline.level;
    if (Math.abs(deltaAdr) > 0.015)
      this.log("HORM", "state/hormonal_state", `redescente hormonale au tic : adrénaline ${hormBefore.adrenaline.level.toFixed(2)} → ${horm.adrenaline.level.toFixed(2)} (vitesse ${0.15})`);

    // 4) regulation/ : le préfrontal récupère avec les interactions positives
    const recents = this.state.recentValences.filter((r) => r.t > now - 10 * 60000);
    const valMoy = recents.length ? recents.reduce((s, r) => s + r.v, 0) / recents.length : 0;
    const nonResolus = memories.filter((m) => m.statut === "non_resolu").length;
    const regBefore = this.state.regulation;
    const reg = regulationTick(regBefore, valMoy, nonResolus);

    // 4b) sleep/ : cycle circadien veille/sommeil
    this.flash("sleep");
    const sleepBefore = this.state.sleep;
    const sleep = sleepUpdate(sleepBefore, now);
    if (sleep.phase !== sleepBefore.phase) {
      this.log("SLEEP", "sleep", `changement de phase : ${sleepBefore.phase} → ${sleep.phase} — ${sleepSummary(sleep)}`);
    }
    
    // Appliquer les modificateurs du sommeil au seuil de promotion et aux lambdas de decay
    const effectivePromotionThresholdValue = effectivePromotionThreshold(cfg.memory.seuil_promotion_graphe, sleep.consolidationMultiplier);
    const effectiveDecayLambdas = {
      negatif: effectiveDecayLambda(cfg.memory.decay_lambda_negatif, sleep.decaySlowdown),
      neutre: effectiveDecayLambda(cfg.memory.decay_lambda_neutre, sleep.decaySlowdown),
      positif: effectiveDecayLambda(cfg.memory.decay_lambda_positif, sleep.decaySlowdown),
    };

    // reconsolidation « thérapeutique » : le préfrontal restauré re-contextualise
    if (reconsolidable(reg, valMoy) && nonResolus > 0) {
      const cible = oldestUnresolved(memories);
      if (cible) {
        memories = memories.map((m) => (m.id === cible.id ? { ...m, statut: "contextualise" as const, creeLe: now } : m));
        this.flash("regulation/prefrontal_cortex");
        this.flash("regulation/hippocampus");
        this.log("RECONSO", "regulation/prefrontal_cortex", `signal de sécurité émis (force ${reg.prefrontalForce.toFixed(2)}) : « ${trunc(cible.texte, 48)} » re-contextualisé — le decay reprend`);
      }
    }
    if (reg.regime !== regBefore.regime) {
      this.flash("regulation/amygdala");
      this.log("REGIME", "regulation/amygdala", `changement de régime de régulation : ${regBefore.regime} → ${reg.regime.toUpperCase()} (seuil amygdale ${reg.amygdalaSeuil.toFixed(2)}, préfrontal ${reg.prefrontalForce.toFixed(2)}, ${nonResolus} trace(s) à vif)`);
    }

    // 5) memory_size_manager : respect du plafond
    this.flash("memory/memory_size_manager");
    const cap = cfg.memory.max_size_mb * 1024 * 1024;
    const before = totalSizeBytes(memories, nodes, this.state.edges, this.state.events.length);
    const { kept: keptMem, dropped } = enforceCap(memories, nodes, this.state.edges, this.state.events.length, cfg);
    if (dropped.length) {
      memories = keptMem;
      dropped.forEach((d) => this.log("OUBLI", "memory/memory_size_manager", `plafond ${cfg.memory.max_size_mb} Mo : suppression forcée de « ${trunc(d.texte, 44)} »`));
    } else if (before > cap * 0.75) {
      this.log("TAILLE", "memory/memory_size_manager", `usage ${fmtBytes(before)} — surveillance renforcée (seuil 90 %)`);
    }

    const taille = totalSizeBytes(memories, nodes, this.state.edges, this.state.events.length);
    this.state.tickCount += 1;
    this.state.totalForgotten += oublies.length + dropped.length;
    this.state.lastTick = { t: now, decayes: this.state.memories.length, promus, oublies: [...oublies, ...dropped.map((d) => d.texte)], tailleOctets: taille };
    this.state.memories = memories;
    this.state.nodes = nodes;
    this.state.hormones = horm;
    this.state.regulation = reg;
    this.state.sleep = sleep;
    this.state.sizeBytes = taille;
    this.state.nextTickAt = now + cfg.memory.tic_interval_seconds * 1000;
    this.pushHormonesHistory(now, horm);
    
    // Appliquer decay attention et habits au tick
    const attentionAfter = attentionDecay(this.state.attention, now);
    const habitsAfter = habitsDecay(this.state.habits, now);
    const semanticAfter = semanticDecay(this.state.semantic);
    this.state.attention = attentionAfter;
    this.state.habits = habitsAfter;
    this.state.semantic = semanticAfter;
    
    this.log(
      "TIC",
      "memory/memory_scheduler",
      `tic n°${this.state.tickCount} — decay recalculé sur ${this.state.lastTick.decayes} souvenir(s), ${promus.length} promotion(s), ${oublies.length + dropped.length} oubli(s), hormones en redescente, ${sleepSummary(sleep)}, ${attentionSummary(attentionAfter)}, ${habitsSummary(habitsAfter)}`
    );
    this.log("DECAY", "memory/decay_engine", `λ appliqué : nég ${cfg.memory.decay_lambda_negatif} · neu ${cfg.memory.decay_lambda_neutre} · pos ${cfg.memory.decay_lambda_positif} (modulé par sommeil: ×${sleep.decaySlowdown.toFixed(2)}) — les traces à vif échappent au decay`);
  }

  // ── api/server.py : POST /chat ────────────────────────────────────────────
  async chat(texte: string) {
    const cfg = this.state.config;
    const now = Date.now();
    const userMsg: ChatMessage = { id: uid(), role: "user", texte, t: now };
    this.state.chat = [...this.state.chat, userMsg];
    this.log("CHAT", "api/server", `POST /chat — message entrant (${texte.length} car.)`);
    this.commit();

    // 1) core/emotion_evaluator
    this.flash("core/emotion_evaluator");
    const emo = evaluateEmotion(texte, this.state.nodes);
    this.log(
      "EVAL",
      "core/emotion_evaluator",
      `auto-évaluation : intensité ${emo.intensite.toFixed(2)} · valence ${emo.valence.toFixed(2)} (${emo.valenceCat}) · traits [${emo.traits_actives.join(", ") || "∅"}]`
    );

    // Theory of Mind : mise à jour de l'état mental de l'utilisateur
    let tomState = updateEmotionalState(this.state.theoryOfMind, emo.valence, emo.intensite, now);
    tomState = inferIntentions(tomState, texte, emo.intensite, emo.valence, now).state;
    tomState = inferBeliefs(tomState, texte, emo.valence, now).state;
    tomState = updateEngagement(tomState, texte.length, (texte.match(/\?/g) || []).length);
    this.state.theoryOfMind = tomState;
    this.log("TOM", "theory_of_mind", `${theoryOfMindSummary(tomState)}`);

    // 2) memory/vector_memory : rappel par similarité (limité par la capacité attentionnelle)
    const maxRecalls = Math.max(2, Math.floor((1 - cognitiveLoad(this.state.attention)) * 5));
    const hits = vectorSearch(this.state.memories, texte, maxRecalls);
    let memories = this.state.memories;
    
    // Ajouter les souvenirs rappelés au focus attentionnel
    let attentionState = this.state.attention;
    hits.forEach((h) => {
      memories = memories.map((s) =>
        s.id === h.s.id ? { ...s, foisRappele: s.foisRappele + 1, intensiteInitiale: clamp01(s.intensiteInitiale + 0.04) } : s
      );
      const relevance = h.score * (1 + Math.abs(emo.valence) * 0.3);
      const addResult = addToFocus(attentionState, h.s, relevance, now);
      attentionState = addResult.state;
      this.log("RENFORCEMENT", "memory/vector_memory", `rappel (sim ${h.score.toFixed(2)}${h.s.statut === "non_resolu" ? " · À VIF" : ""}) : « ${trunc(h.s.texte, 44)} » — reconsolidation +0,04`);
    });
    this.state.attention = attentionState;

    // 3) state/hormonal_state : le pic émotionnel devient pic hormonal
    this.flash("state/hormonal_state");
    const bestSim = hits[0]?.score ?? 0;
    let horm = hormonesUpdate(this.state.hormones, {
      intensite: emo.intensite,
      valence: emo.valence,
      surprise: clamp01(1 - bestSim),
      social: socialScore(texte),
    });

    // flashback : une trace non résolue similaire resurgit intacte
    const flash = hits.find((h) => h.s.statut === "non_resolu" && h.score >= 0.28) ?? null;
    if (flash) {
      horm = {
        ...horm,
        adrenaline: { prev: horm.adrenaline.level, level: clamp01(horm.adrenaline.level + 0.3) },
        cortisol: { prev: horm.cortisol.level, level: clamp01(horm.cortisol.level + 0.1) },
      };
      this.flash("regulation/amygdala");
      this.log("FLASH", "regulation/amygdala", `flashback : « ${trunc(flash.s.texte, 48)} » a resurgi intact (sim ${flash.score.toFixed(2)}, intensité ${flash.s.intensiteInitiale.toFixed(2)}) — pic d'adrénaline +0,30`);
    }

    // 4) regulation/ : amygdale → hippocampe → préfrontal
    const { r: reg, active } = amygdalaDetect(this.state.regulation, emo.intensite, emo.valence);
    const pf = prefrontalForce(horm, reg);
    const statut = hippocampusContextualiser(reg.amygdalaActivation, pf);
    const nonResolus = memories.filter((m) => m.statut === "non_resolu").length + (statut === "non_resolu" ? 1 : 0);
    const regime = computeRegime({ ...reg, prefrontalForce: pf }, nonResolus);
    this.flash("regulation/amygdala");
    if (active)
      this.log("HORM", "regulation/amygdala", `amygdale activée (menace ${emo.intensite.toFixed(2)}×${Math.abs(emo.valence).toFixed(2)}) : seuil abaissé à ${reg.amygdalaSeuil.toFixed(2)} — hypersensibilisation`);
    if (statut === "non_resolu") {
      this.flash("regulation/hippocampus");
      horm = { ...horm, cortisol: { prev: horm.cortisol.level, level: clamp01(horm.cortisol.level + 0.08) } };
      this.log("STOCKAGE", "regulation/hippocampus", `hippocampe INHIBÉ (activation ${reg.amygdalaActivation.toFixed(2)} > 0,65, préfrontal ${pf.toFixed(2)} < 0,40) : le souvenir ne sera PAS daté — decay suspendu, rejouable intact`);
    } else {
      this.flash("regulation/hippocampus");
    }
    if (regime !== this.state.regulation.regime)
      this.log("REGIME", "regulation/amygdala", `changement de régime de régulation : ${this.state.regulation.regime} → ${regime.toUpperCase()}`);
    const regOut: RegulationState = { ...reg, prefrontalForce: pf, regime, hippocampeInhibe: statut === "non_resolu" };

    // 5) core/prompt_builder (mémoire + hormones + régulation)
    this.flash("core/prompt_builder");
    const traitsActifs = getActiveTraits(this.state.nodes, 6);
    const sysPrompt = buildSystemPrompt(traitsActifs, hits, cfg, fmtBytes(this.state.sizeBytes), horm, regOut, nonResolus);
    this.state.promptDebug = sysPrompt;
    this.log("PROMPT", "core/prompt_builder", `prompt système assemblé : ${traitsActifs.length} traits + ${hits.length} rappel(s) + état hormonal + régulation (${sysPrompt.length} car.)`);

    // 6) core/llm_interface — réponse modulée par le ton hormonal
    this.state.typing = true;
    this.commit();
    this.flash("core/llm_interface");
    const ton = hormoneTone(horm);
    let answer: string;
    let mode: "simule" | "ollama" = "simule";
    if (cfg.llm.provider === "ollama") {
      try {
        answer = await askOllama(cfg, sysPrompt, texte);
        mode = "ollama";
        this.log("LLM", "core/llm_interface", `réponse Ollama (${cfg.llm.model}) reçue — ${answer.length} car.`);
      } catch {
        mode = "simule";
        this.log("LLM", "core/llm_interface", `Ollama injoignable — repli sur le moteur simulé embarqué`);
        answer = this.localAnswer(texte, emo, hits, traitsActifs, horm, ton, flash?.s ?? null);
      }
    } else {
      await new Promise((r) => setTimeout(r, 700 + Math.random() * 800));
      answer = this.localAnswer(texte, emo, hits, traitsActifs, horm, ton, flash?.s ?? null);
      this.log("LLM", "core/llm_interface", `moteur simulé : réponse contextuelle générée (ton « ${ton} »)`);
    }

    // 7) stockage vectoriel — avec le statut décidé par l'hippocampe
    this.flash("memory/vector_memory");
    memories = vectorAdd(memories, texte, emo.valenceCat, emo.valence, emo.traits_actives, emo.intensite * 0.9 + 0.1, statut);
    this.log("STOCKAGE", "memory/vector_memory", `souvenir encodé : I₀ ${(emo.intensite * 0.9 + 0.1).toFixed(2)} · ${emo.valenceCat} · ${emo.traits_actives.length} trait(s) · ${statut === "non_resolu" ? "NON RÉSOLU (à vif)" : "contextualisé"}`);

    // 8) renforcement du graphe (borné par max_variation_par_interaction)
    this.flash("memory/graph_memory");
    let nodes = this.state.nodes;
    for (const tid of emo.traits_actives) {
      if (tid.startsWith("marqueur:")) {
        const label = tid.replace("marqueur:", "");
        nodes = graphAddNode(nodes, tid, `marqueur : ${label}`, emo.valence, 0.32 + emo.intensite * 0.2, Date.now());
        this.log("RENFORCEMENT", "memory/graph_memory", `nouveau nœud acquis : « marqueur : ${label} » (valence ${emo.valence.toFixed(2)})`);
      } else {
        nodes = graphReinforce(nodes, tid, emo.impact * 0.6 + (emo.impact === 0 ? 0.03 : 0), cfg.memory.max_variation_par_interaction, Date.now());
      }
    }
    const edges = graphCoActivate(this.state.edges, emo.traits_actives);
    if (emo.traits_actives.length)
      this.log("RENFORCEMENT", "memory/graph_memory", `Δ borné à ±${cfg.memory.max_variation_par_interaction} sur [${emo.traits_actives.join(", ")}]`);

    // état court terme mis à jour + historique
    this.state.hormones = horm;
    this.state.regulation = regOut;
    this.state.recentValences = [...this.state.recentValences.slice(-7), { v: emo.valence, t: now }];
    this.pushHormonesHistory(now, horm);
    this.state.memories = memories;
    this.state.nodes = nodes;
    this.state.edges = edges;
    this.state.llmMode = mode;
    this.state.sizeBytes = totalSizeBytes(memories, nodes, edges, this.state.events.length);
    this.state.typing = false;
    
    // Mettre à jour la confiance (trust) basée sur la qualité perçue de l'interaction
    const interactionQuality = emo.valence * 0.3 + (1 - Math.abs(emo.valence)) * 0.4;
    this.state.theoryOfMind = updateTrust(this.state.theoryOfMind, interactionQuality, now);
    
    // Extraction sémantique : vérifier si des patterns répétitifs émergent
    if (hits.length >= 2) {
      const similarTexts = hits.map(h => h.s.texte);
      const semanticResult = extractSemanticFromEpisodic(this.state.semantic, memories.filter(m => m.foisRappele > 1), similarTexts);
      if (semanticResult.extracted) {
        this.state.semantic = semanticResult.network;
        this.log("SEMANTIC", "semantic", `fait sémantique extrait : « ${trunc(semanticResult.extracted.content, 50)} » (${semanticResult.reason})`);
      }
    }
    
    // Renforcement des habitudes basé sur le contexte et la récompense
    const context = extractContext(texte, emo.traits_actives);
    const rewardSignal = emo.valence * 0.5 + (hits.length > 0 ? 0.2 : 0);
    const habitResult = reinforceHabit(this.state.habits, context, `répondre à "${texte.slice(0, 20)}..."`, rewardSignal, now);
    if (habitResult.habit) {
      this.state.habits = habitResult.state;
      if (habitResult.created) {
        this.log("HABIT", "habits", `nouvelle habitude : « ${habitResult.habit.label} » (force: ${habitResult.habit.strength.toFixed(2)})`);
      }
    }
    
    this.state.chat = [
      ...this.state.chat,
      { id: uid(), role: "assistant", texte: answer, t: Date.now(), emotion: emo, rappels: hits.length, ton, flashback: !!flash },
    ];
    this.commit();
    
    // Générer des pensées spontanées après la réponse
    setTimeout(() => {
      const spontResult = generateSpontaneousThoughts(this.state, Date.now());
      if (spontResult.newThoughts.length > 0) {
        this.state = spontResult.state;
        spontResult.newThoughts.forEach(t => {
          this.log("SPONT", "spontaneous", `pensée générée: [${t.type}] "${t.content.slice(0, 40)}..." (urgence: ${t.urgency.toFixed(2)})`);
        });
      }
    }, 1000);
  }

  private localAnswer(
    texte: string,
    emo: ReturnType<typeof evaluateEmotion>,
    hits: { s: Souvenir; score: number }[],
    traits: ReturnType<typeof getActiveTraits>,
    horm: HormonesState,
    ton: string,
    flashback: Souvenir | null
  ): string {
    const cfg = this.state.config;
    return simulateLLM({
      msg: texte,
      emo,
      rappels: hits,
      traits,
      cfg,
      nMem: this.state.memories.length,
      nPromus: this.state.memories.filter((m) => m.promu).length,
      tickCount: this.state.tickCount,
      lastForce: this.state.memories.length
        ? this.state.memories.reduce((s, m) => s + forceOf(m, Date.now(), cfg), 0) / this.state.memories.length
        : 0,
      horm,
      ton,
      flashback,
    });
  }

  // ── actions UI ─────────────────────────────────────────────────────────────
  reinforceMemory(id: string) {
    this.state.memories = vectorUpdateForce(this.state.memories, id, 0.1);
    const s = this.state.memories.find((m) => m.id === id);
    this.log("RENFORCEMENT", "memory/vector_memory", `renforcement manuel : « ${trunc(s?.texte ?? "", 44)} » (+0,10 I₀)`);
    this.commit();
  }

  forgetMemory(id: string) {
    const s = this.state.memories.find((m) => m.id === id);
    this.state.memories = vectorDelete(this.state.memories, id);
    this.state.totalForgotten += 1;
    this.log("OUBLI", "memory/vector_memory", `suppression manuelle : « ${trunc(s?.texte ?? "", 44)} »${s?.statut === "non_resolu" ? " — trace à vif libérée" : ""}`);
    this.commit();
  }

  /** regulation/hippocampus : re-contextualiser manuellement une trace à vif */
  reconsolidate(id: string) {
    const s = this.state.memories.find((m) => m.id === id);
    if (!s || s.statut !== "non_resolu") return;
    this.state.memories = this.state.memories.map((m) => (m.id === id ? { ...m, statut: "contextualise" as const, creeLe: Date.now() } : m));
    this.flash("regulation/prefrontal_cortex");
    this.log("RECONSO", "regulation/prefrontal_cortex", `re-contextualisation manuelle : « ${trunc(s.texte, 48)} » — le decay reprend, la trace cesse d'être à vif`);
    this.commit();
  }

  setConfig(patch: Partial<Config["memory"]> | { llm: Partial<Config["llm"]> }) {
    if ("llm" in patch) {
      this.state.config = { ...this.state.config, llm: { ...this.state.config.llm, ...patch.llm } };
    } else {
      this.state.config = { ...this.state.config, memory: { ...this.state.config.memory, ...patch } };
    }
    if (Date.now() - this.lastConfigLog > 1400) {
      this.lastConfigLog = Date.now();
      this.log("CONFIG", "config.json", `paramètres mis à jour : ${Object.keys("llm" in patch ? patch.llm : patch).join(", ")}`);
    }
    this.commit();
  }

  resetConfig() {
    this.state.config = DEFAULT_CONFIG;
    this.log("CONFIG", "config.json", "réinitialisation aux valeurs par défaut");
    this.commit();
  }

  /** api/server.py : POST /memory/reset */
  reset() {
    localStorage.removeItem(LS_KEY);
    const g = seedGraph();
    const now = Date.now();
    this.state = {
      ...freshState(),
      config: this.state.config,
      now,
      events: [],
      nextTickAt: now + this.state.config.memory.tic_interval_seconds * 1000,
      chat: [
        {
          id: uid(),
          role: "assistant",
          t: now,
          texte:
            "Réinitialisation complète. Mémoire vectorielle purgée, graphe rechargé depuis primitive_seed.json, hormones remises à leur baseline, boucle de régulation réinitialisée. Je repars de mes dix traits ancestraux — plus rien d'autre. Que veux-tu graver en premier ?",
        },
      ],
    };
    this.log("RESET", "api/server", "POST /memory/reset — mémoire purgée, ADN primitif rechargé, physiologie à la baseline");
    this.log("SEED", "memory/graph_memory", "primitive_seed.json rechargé : 10 traits, 7 liens");
    this.commit();
  }

  clearEvents() {
    this.state.events = [];
    this.commit();
  }
}

export const system = new MemorySystem();

export function useSystem(): SysState {
  return useSyncExternalStore(system.subscribe, system.getState);
}

export const toneOfValence = valenceTone;

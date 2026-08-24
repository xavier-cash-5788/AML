// ── main.py + memory/memory_scheduler.py : orchestration + store réactif ────
import { useSyncExternalStore } from "react";
import type { ChatMessage, Config, EventType, MemEvent, Souvenir, SysState } from "./types";
import { DEFAULT_CONFIG, clamp01, fmtBytes, trunc, uid, valenceTone } from "./core";
import {
  enforceCap, forceOf, getActiveTraits, graphAddNode, graphCoActivate, graphReinforce,
  graphTick, promotionScore, seedGraph, totalSizeBytes, vectorAdd, vectorDelete,
  vectorSearch, vectorUpdateForce,
} from "./memory";
import { askOllama, buildSystemPrompt, evaluateEmotion, simulateLLM } from "./brain";

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
          "Bonjour. Je suis Mnémosyne — une IA locale à mémoire émotionnelle. Mon ADN primitif vient d'être chargé : 10 traits ancestraux, de la peur de l'abandon à l'attirance pour la chaleur. Chaque tic recalcule le decay de mes souvenirs : ce qui compte montera dans mon graphe, le reste s'effacera sous le seuil. Parle-moi — je retiendrai selon la force de ce que tu dis.",
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
      } as SysState;
      this.log("SEED", "memory/memory_scheduler", "Session restaurée depuis storage/ (localStorage)");
    } else {
      this.state = base;
      this.log("SEED", "memory/graph_memory", "primitive_seed.json chargé : 10 traits ancestraux, 7 liens");
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
      const { config, memories, nodes, edges, events, chat, tickCount, totalForgotten, lastTick } = this.state;
      localStorage.setItem(
        LS_KEY,
        JSON.stringify({ config, memories, nodes, edges, events: events.slice(0, 160), chat: chat.slice(-80), tickCount, totalForgotten, lastTick })
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

    // 1) decay + promotion + oubli actif
    const kept: Souvenir[] = [];
    for (const s of memories) {
      const f = forceOf(s, now, cfg);
      if (f < cfg.memory.seuil_oubli && s.creeLe < now - 20000) {
        oublies.push(s.texte);
        this.log("OUBLI", "memory/decay_engine", `oubli actif : « ${trunc(s.texte, 52)} » (force ${f.toFixed(3)} < ${cfg.memory.seuil_oubli})`);
        continue;
      }
      let cur = s;
      if (!s.promu && promotionScore(s, now, cfg) >= cfg.memory.seuil_promotion_graphe) {
        cur = { ...cur, promu: true, intensiteInitiale: clamp01(Math.max(cur.intensiteInitiale, f + 0.1)) };
        for (const tid of cur.traits) {
          nodes = graphReinforce(nodes, tid, cfg.memory.max_variation_par_interaction, cfg.memory.max_variation_par_interaction, now);
        }
        promus.push(s.texte);
        this.log("PROMOTION", "memory/decay_engine", `promotion vecteur → graphe : « ${trunc(s.texte, 52)} »`);
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

    // 3) memory_size_manager : respect du plafond
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
    this.state.sizeBytes = taille;
    this.state.nextTickAt = now + cfg.memory.tic_interval_seconds * 1000;
    this.log(
      "TIC",
      "memory/memory_scheduler",
      `tic n°${this.state.tickCount} — decay recalculé sur ${this.state.lastTick.decayes} souvenir(s), ${promus.length} promotion(s), ${oublies.length + dropped.length} oubli(s), taille ${fmtBytes(taille)}`
    );
    this.log("DECAY", "memory/decay_engine", `λ appliqué : nég ${cfg.memory.decay_lambda_negatif} · neu ${cfg.memory.decay_lambda_neutre} · pos ${cfg.memory.decay_lambda_positif} (Δt depuis encodage)`);
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

    // 2) memory/vector_memory : rappel par similarité
    const hits = vectorSearch(this.state.memories, texte, 3);
    let memories = this.state.memories;
    hits.forEach((h) => {
      memories = memories.map((s) =>
        s.id === h.s.id ? { ...s, foisRappele: s.foisRappele + 1, intensiteInitiale: clamp01(s.intensiteInitiale + 0.04) } : s
      );
      this.log("RENFORCEMENT", "memory/vector_memory", `rappel (sim ${h.score.toFixed(2)}) : « ${trunc(h.s.texte, 44)} » — reconsolidation +0,04`);
    });

    // 3) core/prompt_builder
    this.flash("core/prompt_builder");
    const traitsActifs = getActiveTraits(this.state.nodes, 6);
    const sysPrompt = buildSystemPrompt(traitsActifs, hits, cfg, fmtBytes(this.state.sizeBytes));
    this.state.promptDebug = sysPrompt;
    this.log("PROMPT", "core/prompt_builder", `prompt système assemblé : ${traitsActifs.length} traits + ${hits.length} souvenir(s) rappelés (${sysPrompt.length} car.)`);

    // 4) core/llm_interface
    this.state.typing = true;
    this.commit();
    this.flash("core/llm_interface");
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
        answer = this.localAnswer(texte, emo, hits, traitsActifs);
      }
    } else {
      await new Promise((r) => setTimeout(r, 700 + Math.random() * 800));
      answer = this.localAnswer(texte, emo, hits, traitsActifs);
      this.log("LLM", "core/llm_interface", "moteur simulé : réponse contextuelle générée");
    }

    // 5) stockage vectoriel de l'interaction
    this.flash("memory/vector_memory");
    memories = vectorAdd(memories, texte, emo.valenceCat, emo.valence, emo.traits_actives, emo.intensite * 0.9 + 0.1);
    this.log("STOCKAGE", "memory/vector_memory", `souvenir encodé : I₀ ${(emo.intensite * 0.9 + 0.1).toFixed(2)} · ${emo.valenceCat} · ${emo.traits_actives.length} trait(s)`);

    // 6) renforcement du graphe (borné par max_variation_par_interaction)
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

    this.state.memories = memories;
    this.state.nodes = nodes;
    this.state.edges = edges;
    this.state.llmMode = mode;
    this.state.sizeBytes = totalSizeBytes(memories, nodes, edges, this.state.events.length);
    this.state.typing = false;
    this.state.chat = [
      ...this.state.chat,
      { id: uid(), role: "assistant", texte: answer, t: Date.now(), emotion: emo, rappels: hits.length },
    ];
    this.commit();
  }

  private localAnswer(texte: string, emo: ReturnType<typeof evaluateEmotion>, hits: { s: Souvenir; score: number }[], traits: ReturnType<typeof getActiveTraits>): string {
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
    this.log("OUBLI", "memory/vector_memory", `suppression manuelle : « ${trunc(s?.texte ?? "", 44)} »`);
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
            "Réinitialisation complète. Mémoire vectorielle purgée, graphe rechargé depuis primitive_seed.json, journal remis à zéro. Je repars de mes dix traits ancestraux — plus rien d'autre. Que veux-tu graver en premier ?",
        },
      ],
    };
    this.log("RESET", "api/server", "POST /memory/reset — mémoire purgée, ADN primitif rechargé");
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

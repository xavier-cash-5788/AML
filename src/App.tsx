import { useState } from "react";
import { useSystem } from "./engine/system";
import { fmtBytes } from "./engine/core";
import ChatPanel from "./components/ChatPanel";
import StatusPanel from "./components/StatusPanel";
import VectorPanel from "./components/VectorPanel";
import GraphPanel from "./components/GraphPanel";
import LogPanel from "./components/LogPanel";
import ConfigPanel from "./components/ConfigPanel";
import TestsPanel from "./components/TestsPanel";
import DebugPanel from "./components/DebugPanel";
import { Corners } from "./components/ui";

type Tab = "apercu" | "vecteurs" | "graphe" | "journal" | "config" | "tests" | "debug";

const MODULES = [
  "core/llm_interface.py",
  "core/emotion_evaluator.py",
  "core/prompt_builder.py",
  "memory/vector_memory.py",
  "memory/graph_memory.py",
  "memory/decay_engine.py",
  "memory/memory_scheduler.py",
  "memory/memory_size_manager.py",
  "api/server.py",
];

const TABS: { id: Tab; label: string; file: string }[] = [
  { id: "apercu", label: "Aperçu", file: "GET /memory/status" },
  { id: "vecteurs", label: "Vecteurs", file: "vector_db/" },
  { id: "graphe", label: "Graphe", file: "graph.json" },
  { id: "journal", label: "Journal", file: "memory_events.jsonl" },
  { id: "config", label: "Config", file: "config.json" },
  { id: "tests", label: "Tests", file: "tests/" },
  { id: "debug", label: "Debug", file: "debugSuite.ts" },
];

function Logo() {
  return (
    <svg width="34" height="34" viewBox="0 0 40 40" fill="none" aria-hidden>
      <rect x="1.5" y="1.5" width="37" height="37" stroke="var(--line2)" strokeWidth="1.5" />
      <circle cx="20" cy="20" r="4" fill="var(--neu)" />
      <circle cx="10" cy="12" r="2.4" fill="var(--neg)" opacity="0.9" />
      <circle cx="30" cy="11" r="2.4" fill="var(--pos)" opacity="0.9" />
      <circle cx="31" cy="29" r="2.4" fill="var(--cy)" opacity="0.9" />
      <circle cx="11" cy="30" r="2.4" fill="var(--neu)" opacity="0.7" />
      <path d="M20 20 10 12M20 20l10-9M20 20l11 9M20 20 11 30" stroke="var(--line2)" strokeWidth="1.2" />
    </svg>
  );
}

export default function App() {
  const st = useSystem();
  const [tab, setTab] = useState<Tab>("apercu");
  const remaining = Math.max(0, Math.ceil((st.nextTickAt - st.now) / 1000));
  const lastEvent = st.events[0];

  return (
    <div className="h-full flex flex-col relative overflow-hidden">
      {/* fond ambiant */}
      <div className="absolute inset-0 bg-grid pointer-events-none" aria-hidden />
      <div className="glow glow-a w-[560px] h-[560px] -top-40 -left-32" aria-hidden />
      <div className="glow glow-b w-[640px] h-[640px] -bottom-56 -right-40" aria-hidden />
      <div className="noise" aria-hidden />

      {/* ── header ─────────────────────────────────────────── */}
      <header className="relative z-10 shrink-0 border-b border-[var(--line)] bg-[var(--ink)]/80 backdrop-blur-sm">
        <div className="px-4 py-2.5 flex items-center gap-4">
          <div className="flex items-center gap-3">
            <Logo />
            <div>
              <h1 className="font-display text-[17px] font-extrabold tracking-[0.06em] leading-none">
                MNÉMOSYNE
              </h1>
              <div className="mono text-[9.5px] text-[var(--dim)] mt-1">~/ia_locale_memoire · port navigateur · v0.9</div>
            </div>
          </div>

          <div className="ml-auto hidden md:flex items-center gap-2 mono text-[10.5px]">
            <span className="flex items-center gap-1.5 border border-[var(--line)] bg-[var(--ink2)] px-2.5 py-1.5 text-[var(--mut)]">
              <span className="live-dot w-1.5 h-1.5 rounded-full bg-[var(--neu)] inline-block" />
              système actif
            </span>
            <span className="border border-[var(--line)] bg-[var(--ink2)] px-2.5 py-1.5 text-[var(--mut)]">
              LLM : <span className={st.llmMode === "ollama" ? "text-[var(--neu)]" : "text-[var(--pos)]"}>{st.llmMode === "ollama" ? `ollama/${st.config.llm.model}` : "simulé"}</span>
            </span>
            <span className="border border-[var(--line)] bg-[var(--ink2)] px-2.5 py-1.5 text-[var(--mut)]">
              {st.memories.length} souvenirs · <span className="text-[var(--cy)]">{fmtBytes(st.sizeBytes)}</span>
            </span>
            <span className="border border-[var(--line)] bg-[var(--ink2)] px-2.5 py-1.5 text-[var(--mut)]">
              tic <span className="text-[var(--neu)] font-semibold">T−{remaining}s</span>
            </span>
          </div>
        </div>
      </header>

      {/* ── corps ──────────────────────────────────────────── */}
      <main className="relative z-10 flex-1 min-h-0 overflow-y-auto xl:overflow-hidden p-3 grid gap-3 grid-cols-1 xl:grid-cols-[450px_1fr]">
        {/* conversation */}
        <div className="h-[560px] xl:h-auto xl:min-h-0">
          <ChatPanel delay={0} />
        </div>

        {/* tableau de bord */}
        <div className="min-h-0 flex flex-col gap-3">
          {/* barre d'onglets */}
          <nav className="anim-in shrink-0 flex items-stretch gap-1 border border-[var(--line)] bg-[var(--panel)]/90 px-1.5 py-1.5 overflow-x-auto relative">
            <Corners />
            {TABS.map((t) => {
              const active = tab === t.id;
              const count =
                t.id === "vecteurs" ? st.memories.length : t.id === "graphe" ? st.nodes.length : t.id === "journal" ? st.events.length : null;
              return (
                <button
                  key={t.id}
                  onClick={() => setTab(t.id)}
                  className={`relative shrink-0 px-3.5 py-2 text-left transition-colors ${
                    active ? "bg-[var(--ink2)]" : "hover:bg-[var(--ink2)]/50"
                  }`}
                >
                  <span className={`block font-display text-[11.5px] font-bold uppercase tracking-[0.1em] ${active ? "text-[var(--neu)]" : "text-[var(--mut)]"}`}>
                    {t.label}
                    {count !== null && <span className="mono font-normal text-[9.5px] text-[var(--dim)] ml-1.5">{count}</span>}
                  </span>
                  <span className="mono block text-[9px] text-[var(--dim)] mt-0.5">{t.file}</span>
                  {active && <span className="absolute bottom-0 left-2 right-2 h-[2px] bg-[var(--neu)]" />}
                </button>
              );
            })}
          </nav>

          {/* contenu d'onglet */}
          <div className="flex-1 min-h-0 xl:overflow-y-auto">
            <div className="min-h-[480px] xl:min-h-0 xl:h-full">
              {tab === "apercu" && <StatusPanel delay={0} />}
              {tab === "vecteurs" && <div className="xl:h-full min-h-[480px] xl:min-h-0"><VectorPanel delay={0} /></div>}
              {tab === "graphe" && <GraphPanel delay={0} />}
              {tab === "journal" && <div className="xl:h-full min-h-[480px] xl:min-h-0"><LogPanel delay={0} /></div>}
              {tab === "config" && <ConfigPanel delay={0} />}
              {tab === "tests" && <TestsPanel delay={0} />}
              {tab === "debug" && <DebugPanel delay={0} />}
            </div>
          </div>
        </div>
      </main>

      {/* ── bandeau modules ────────────────────────────────── */}
      <footer className="relative z-10 shrink-0 border-t border-[var(--line)] bg-[var(--ink)]/85 backdrop-blur-sm">
        <div className="px-4 py-2 flex items-center gap-3">
          <span className="mono text-[9px] uppercase tracking-[0.18em] text-[var(--dim)] shrink-0 hidden sm:block">modules</span>
          <div className="flex-1 min-w-0 flex items-center gap-1.5 overflow-x-auto py-0.5">
            {MODULES.map((m) => {
              const ts = st.flash[m] ?? 0;
              const fresh = st.now - ts < 1800;
              return (
                <span
                  key={m}
                  className={`shrink-0 mono text-[9.5px] px-2 py-1 border transition-colors ${
                    fresh ? "chip-flash border-[var(--neu)] text-[var(--neu)]" : "border-[var(--line)] text-[var(--dim)]"
                  }`}
                >
                  <span className={`inline-block w-1 h-1 rounded-full mr-1.5 align-middle ${fresh ? "bg-[var(--neu)]" : "bg-[var(--line2)]"}`} />
                  {m.replace(".py", "")}
                </span>
              );
            })}
          </div>
          <div className="hidden lg:block shrink-0 max-w-[380px] overflow-hidden">
            {lastEvent ? (
              <div key={lastEvent.id} className="log-in mono text-[9.5px] text-[var(--dim)] truncate">
                <span className="text-[var(--neu)]">{lastEvent.type}</span> · {lastEvent.message}
              </div>
            ) : (
              <div className="mono text-[9.5px] text-[var(--dim)]">en attente d'événements…</div>
            )}
          </div>
        </div>
      </footer>
    </div>
  );
}

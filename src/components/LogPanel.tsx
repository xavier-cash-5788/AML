import { useMemo, useState } from "react";
import { system, useSystem } from "../engine/system";
import { fmtClock } from "../engine/core";
import type { EventType } from "../engine/types";
import { Btn, EmptyState, Panel } from "./ui";

const TYPE_COLOR: Partial<Record<EventType, string>> = {
  TIC: "var(--neu)",
  DECAY: "var(--dim)",
  PROMOTION: "var(--pos)",
  CONSOLIDATION: "var(--pos)",
  OUBLI: "var(--neg)",
  STOCKAGE: "var(--cy)",
  RENFORCEMENT: "var(--neu)",
  EVAL: "var(--pos)",
  PROMPT: "var(--mut)",
  LLM: "var(--cy)",
  SEED: "var(--neu)",
  RESET: "var(--neg)",
  TAILLE: "var(--pos)",
  EMERGENCE: "var(--pos)",
  CONFIG: "var(--mut)",
  CHAT: "var(--text)",
};

export default function LogPanel({ delay }: { delay: number }) {
  const st = useSystem();
  const [filter, setFilter] = useState<EventType | "TOUS">("TOUS");

  const types = useMemo(() => [...new Set(st.events.map((e) => e.type))].sort(), [st.events]);
  const rows = filter === "TOUS" ? st.events : st.events.filter((e) => e.type === filter);

  const exportJsonl = () => {
    const body = [...st.events].reverse().map((e) => JSON.stringify({ t: new Date(e.t).toISOString(), type: e.type, module: e.module, message: e.message })).join("\n");
    const url = URL.createObjectURL(new Blob([body], { type: "application/jsonl" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = "memory_events.jsonl";
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <Panel
      title="Journal des décisions"
      file="storage/logs/memory_events.jsonl"
      delay={delay}
      className="flex flex-col min-h-0 h-full"
      right={
        <>
          <select
            value={filter}
            onChange={(e) => setFilter(e.target.value as EventType | "TOUS")}
            className="mono text-[10.5px] bg-[var(--ink)] border border-[var(--line)] px-1.5 py-1 text-[var(--mut)]"
          >
            <option value="TOUS">TOUS ({st.events.length})</option>
            {types.map((t) => (
              <option key={t} value={t}>{t}</option>
            ))}
          </select>
          <Btn onClick={exportJsonl} className="!py-1 !px-2 !text-[10.5px]" title="Télécharger memory_events.jsonl">
            ⤓ .jsonl
          </Btn>
        </>
      }
    >
      <div className="flex-1 min-h-0 overflow-y-auto">
        {rows.length === 0 ? (
          <EmptyState>Journal vide. Les décisions du tic, les évaluations émotionnelles et les stockages s'inscriront ici ligne par ligne.</EmptyState>
        ) : (
          <ul className="mono text-[11px] leading-relaxed">
            {rows.map((e, i) => (
              <li
                key={e.id}
                className={`${i === 0 ? "log-in" : ""} flex gap-2.5 px-4 py-[7px] border-b border-[var(--line)]/50 hover:bg-[var(--panel2)]/60`}
              >
                <span className="text-[var(--dim)] shrink-0">{fmtClock(e.t)}</span>
                <span
                  className="shrink-0 w-[110px] font-semibold"
                  style={{ color: TYPE_COLOR[e.type] ?? "var(--mut)" }}
                >
                  {e.type}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="text-[var(--dim)]">{e.module}</span>
                  <span className="text-[var(--mut)]"> — {e.message}</span>
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>
      <footer className="px-4 py-2 border-t border-[var(--line)]/70 flex items-center justify-between mono text-[10px] text-[var(--dim)]">
        <span>{rows.length} ligne(s) affichée(s) · buffer max 260</span>
        <button onClick={() => system.clearEvents()} className="hover:text-[var(--neg)] transition-colors">purger le journal</button>
      </footer>
    </Panel>
  );
}

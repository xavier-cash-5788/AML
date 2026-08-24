import { useState } from "react";
import { runAllTests, type TestResult } from "../engine/tests";
import { Btn, Panel, Tag } from "./ui";

const FILES = [
  "tests/test_vector_memory.py",
  "tests/test_graph_memory.py",
  "tests/test_decay_engine.py",
  "tests/test_emotion_evaluator.py",
];

export default function TestsPanel({ delay }: { delay: number }) {
  const [results, setResults] = useState<TestResult[] | null>(null);
  const [running, setRunning] = useState(false);

  const run = () => {
    setRunning(true);
    setResults(null);
    setTimeout(() => {
      setResults(runAllTests());
      setRunning(false);
    }, 550);
  };

  const ok = results?.filter((r) => r.ok).length ?? 0;

  return (
    <div className="grid gap-3">
      <Panel
        title="Suite de tests unitaires"
        file="tests/"
        delay={delay}
        right={
          <>
            {results && (
              <Tag tone={ok === results.length ? "pos" : "neg"}>
                {ok}/{results.length} réussies
              </Tag>
            )}
            <Btn onClick={run} variant="solid" disabled={running} className="!py-1 !text-[11.5px]">
              {running ? "exécution…" : results ? "⟳ relancer" : "▶ lancer la suite"}
            </Btn>
          </>
        }
      >
        <div className="px-4 py-4">
          {!results && !running && (
            <div className="grid sm:grid-cols-2 gap-2.5">
              {FILES.map((f, i) => (
                <div key={f} className="anim-in border border-[var(--line)] bg-[var(--ink2)] px-3 py-2.5 flex items-center gap-2.5" style={{ animationDelay: `${delay + i * 70}ms` }}>
                  <span className="w-1.5 h-1.5 rounded-full bg-[var(--line2)] shrink-0" />
                  <span className="mono text-[11.5px] text-[var(--mut)]">{f}</span>
                </div>
              ))}
            </div>
          )}
          {running && (
            <div className="flex items-center gap-3 py-4">
              <span className="flex gap-1">
                {[0, 1, 2].map((i) => (
                  <span key={i} className="typing-dot inline-block w-1.5 h-1.5 rounded-full bg-[var(--neu)]" />
                ))}
              </span>
              <span className="mono text-[11.5px] text-[var(--mut)]">pytest --tb=short — exécution des 4 modules…</span>
            </div>
          )}
          {results && (
            <div className="space-y-4 anim-in">
              {FILES.map((f) => {
                const rows = results.filter((r) => r.file === f);
                const allOk = rows.every((r) => r.ok);
                return (
                  <div key={f}>
                    <div className="flex items-center gap-2 mb-1.5">
                      <span className={`mono text-[10px] ${allOk ? "text-[var(--neu)]" : "text-[var(--neg)]"}`}>{allOk ? "✓" : "✗"}</span>
                      <span className="mono text-[11.5px] text-[var(--text)]">{f}</span>
                      <span className="mono text-[10px] text-[var(--dim)]">— {rows.filter((r) => r.ok).length}/{rows.length} passed</span>
                    </div>
                    <ul className="border-l border-[var(--line)] ml-1 pl-4 space-y-1">
                      {rows.map((r, i) => (
                        <li key={i} className="log-in flex flex-wrap items-baseline gap-x-2.5" style={{ animationDelay: `${i * 40}ms` }}>
                          <span className={`mono text-[11px] font-semibold ${r.ok ? "text-[var(--neu)]" : "text-[var(--neg)]"}`}>
                            {r.ok ? "PASSED" : "FAILED"}
                          </span>
                          <span className="text-[12px] text-[var(--mut)]">{r.name}</span>
                          <span className="mono text-[10px] text-[var(--dim)]">{r.detail}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                );
              })}
              <p className="mono text-[10.5px] text-[var(--dim)] border-t border-[var(--line)]/60 pt-3">
                ═══ {ok} passed{ok < results.length ? `, ${results.length - ok} failed` : ""} in 0,{String(results.length * 7 + 31).padStart(2, "0")}s ═══
              </p>
            </div>
          )}
        </div>
      </Panel>
    </div>
  );
}

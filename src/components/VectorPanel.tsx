import { useMemo, useState } from "react";
import { system, useSystem } from "../engine/system";
import { fmtAge, fmtNum, trunc } from "../engine/core";
import { forceOf, vectorSearch } from "../engine/memory";
import { Bar, Btn, EmptyState, Panel, Tag, ValenceDot } from "./ui";

export default function VectorPanel({ delay }: { delay: number }) {
  const st = useSystem();
  const [query, setQuery] = useState("");

  const hits = useMemo(
    () => (query.trim() ? vectorSearch(st.memories, query, 4) : []),
    [query, st.memories, st.now]
  );
  const searching = query.trim().length > 0;

  const rows = useMemo(() => {
    if (searching) return hits.map((h) => ({ s: h.s, score: h.score }));
    return [...st.memories]
      .sort((a, b) => b.creeLe - a.creeLe)
      .slice(0, 40)
      .map((s) => ({ s, score: null as number | null }));
  }, [searching, hits, st.memories]);

  return (
    <Panel
      title="Stockage vectoriel"
      file="memory/vector_memory.py"
      delay={delay}
      className="flex flex-col min-h-0 h-full"
      right={<span className="mono text-[10px] text-[var(--dim)]">{st.memories.length} document(s) · dim 96</span>}
    >
      {/* recherche par similarité */}
      <div className="px-4 py-3 border-b border-[var(--line)]/70">
        <div className="relative">
          <svg className="absolute left-2.5 top-1/2 -translate-y-1/2 text-[var(--dim)]" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
            <circle cx="11" cy="11" r="7" />
            <path d="m20 20-3.5-3.5" />
          </svg>
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="search(query, top_k=4) — tester la similarité cosinus…"
            className="w-full bg-[var(--ink)] border border-[var(--line)] pl-8 pr-3 py-2 text-[12.5px] mono placeholder:text-[var(--dim)] focus:border-[var(--line2)]"
          />
        </div>
      </div>

      <div className="flex-1 min-h-0 overflow-y-auto">
        {rows.length === 0 && (
          <EmptyState>
            {searching
              ? "Aucun souvenir ne dépasse le seuil de similarité (cos > 0,08) pour cette requête."
              : "Stockage vide. Écrivez quelque chose d'émotionnel dans la conversation : chaque message utilisateur est encodé ici avec sa force initiale I₀."}
          </EmptyState>
        )}
        <ul>
          {rows.map(({ s, score }) => {
            const f = forceOf(s, st.now, st.config);
            const tone = s.valence === "positif" ? "pos" : s.valence === "negatif" ? "neg" : "neu";
            return (
              <li
                key={s.id}
                className="group border-b border-[var(--line)]/60 px-4 py-3 hover:bg-[var(--panel2)]/70 transition-colors"
              >
                <div className="flex items-start gap-3">
                  <ValenceDot v={s.valenceScore} size={9} />
                  <div className="min-w-0 flex-1">
                    <p className="text-[13px] leading-snug text-[var(--text)]">« {trunc(s.texte, 110)} »</p>
                    <div className="flex flex-wrap items-center gap-2 mt-1.5 mono text-[10px] text-[var(--dim)]">
                      <span>{fmtAge(s.creeLe, st.now)}</span>
                      <span>· I₀ {fmtNum(s.intensiteInitiale)}</span>
                      <span>· rappelé {s.foisRappele}×</span>
                      {s.promu && <Tag tone="pos">consolidé ▲</Tag>}
                      {score !== null && <Tag tone="neu">sim {fmtNum(score)}</Tag>}
                      {s.traits.slice(0, 3).map((t) => (
                        <span key={t} className="text-[var(--cy)]">#{t.replace("marqueur:", "~")}</span>
                      ))}
                    </div>
                    <div className="flex items-center gap-2.5 mt-2">
                      <Bar value={f} color={tone === "pos" ? "var(--pos)" : tone === "neg" ? "var(--neg)" : "var(--neu)"} className="flex-1" striped={f < st.config.memory.seuil_oubli * 2} />
                      <span className="mono text-[10.5px] w-10 text-right" style={{ color: f < st.config.memory.seuil_oubli * 2 ? "var(--neg)" : "var(--mut)" }}>
                        {fmtNum(f)}
                      </span>
                    </div>
                  </div>
                  <div className="flex flex-col gap-1 opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
                    <Btn onClick={() => system.reinforceMemory(s.id)} className="!px-2 !py-0.5 !text-[10px]" title="Renforcer (+0,10 I₀)">
                      +Δ
                    </Btn>
                    <Btn onClick={() => system.forgetMemory(s.id)} variant="danger" className="!px-2 !py-0.5 !text-[10px]" title="Oubli manuel">
                      ✕
                    </Btn>
                  </div>
                </div>
              </li>
            );
          })}
        </ul>
      </div>
      <footer className="px-4 py-2 border-t border-[var(--line)]/70 mono text-[10px] text-[var(--dim)] flex justify-between">
        <span>force &lt; {st.config.memory.seuil_oubli} → oubli au prochain tic</span>
        <span>force + récurrence ≥ {st.config.memory.seuil_promotion_graphe} → graphe</span>
      </footer>
    </Panel>
  );
}

import { useEffect, useMemo, useRef, useState } from "react";
import { useSystem } from "../engine/system";
import { fmtNum, valenceColor } from "../engine/core";
import { clusterByTheme } from "../engine/memory";
import type { TraitNode } from "../engine/types";
import { Panel, Tag, ValenceDot } from "./ui";

const W = 640;
const H = 430;

function shortLabel(label: string): string {
  return label
    .replace(/^peur de l'/, "")
    .replace(/^peur du /, "")
    .replace(/^peur de la /, "")
    .replace(/^crainte du /, "")
    .replace(/^attirance : /, "+")
    .replace(/^besoin de /, "")
    .replace(/^goût du /, "")
    .replace(/^marqueur : /, "~");
}

interface P { x: number; y: number; vx: number; vy: number; }

export default function GraphPanel({ delay }: { delay: number }) {
  const st = useSystem();
  const pos = useRef(new Map<string, P>());
  const [, setFrame] = useState(0);
  const [hover, setHover] = useState<string | null>(null);
  const nodesRef = useRef(st.nodes);
  const edgesRef = useRef(st.edges);
  nodesRef.current = st.nodes;
  edgesRef.current = st.edges;

  // réconciliation des positions
  useEffect(() => {
    const map = pos.current;
    const ids = new Set(st.nodes.map((n) => n.id));
    st.nodes.forEach((n, i) => {
      if (!map.has(n.id)) {
        const a = (i / Math.max(1, st.nodes.length)) * Math.PI * 2;
        map.set(n.id, {
          x: W / 2 + Math.cos(a) * (90 + Math.random() * 70),
          y: H / 2 + Math.sin(a) * (70 + Math.random() * 50),
          vx: 0, vy: 0,
        });
      }
    });
    [...map.keys()].forEach((k) => { if (!ids.has(k)) map.delete(k); });
  }, [st.nodes]);

  // boucle de physique
  useEffect(() => {
    let raf = 0;
    const step = () => {
      const nodes = nodesRef.current;
      const edges = edgesRef.current;
      const map = pos.current;
      // répulsion
      for (let i = 0; i < nodes.length; i++) {
        const a = map.get(nodes[i].id);
        if (!a) continue;
        for (let j = i + 1; j < nodes.length; j++) {
          const b = map.get(nodes[j].id);
          if (!b) continue;
          let dx = a.x - b.x, dy = a.y - b.y;
          let d2 = dx * dx + dy * dy;
          if (d2 < 1) { dx = Math.random() - 0.5; dy = Math.random() - 0.5; d2 = 1; }
          const f = 2400 / d2;
          const d = Math.sqrt(d2);
          const fx = (dx / d) * f, fy = (dy / d) * f;
          a.vx += fx; a.vy += fy;
          b.vx -= fx; b.vy -= fy;
        }
        // gravité centrale
        a.vx += (W / 2 - a.x) * 0.006;
        a.vy += (H / 2 - a.y) * 0.007;
      }
      // ressorts des arêtes
      edges.forEach((e) => {
        const a = map.get(e.a), b = map.get(e.b);
        if (!a || !b) return;
        const dx = b.x - a.x, dy = b.y - a.y;
        const d = Math.sqrt(dx * dx + dy * dy) || 1;
        const rest = 120 - e.poids * 40;
        const f = (d - rest) * 0.004;
        const fx = (dx / d) * f, fy = (dy / d) * f;
        a.vx += fx; a.vy += fy;
        b.vx -= fx; b.vy -= fy;
      });
      // intégration
      map.forEach((p) => {
        p.vx *= 0.82; p.vy *= 0.82;
        p.x = Math.max(46, Math.min(W - 46, p.x + p.vx));
        p.y = Math.max(40, Math.min(H - 40, p.y + p.vy));
      });
      setFrame((f) => (f + 1) % 1000000);
      raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, []);

  const clusters = useMemo(() => clusterByTheme(st.nodes), [st.nodes]);
  const byId = useMemo(() => new Map(st.nodes.map((n) => [n.id, n])), [st.nodes]);
  const hovered: TraitNode | null = hover ? byId.get(hover) ?? null : null;

  return (
    <div className="grid gap-3 xl:grid-cols-[1.5fr_1fr]">
      <Panel title="Graphe de traits" file="memory/graph_memory.py" delay={delay} className="min-h-0">
        <div className="relative">
          <svg viewBox={`0 0 ${W} ${H}`} className="w-full block" style={{ background: "radial-gradient(ellipse at center, rgba(85,194,171,0.05), transparent 70%)" }}>
            {/* arêtes */}
            {st.edges.map((e, i) => {
              const a = pos.current.get(e.a), b = pos.current.get(e.b);
              if (!a || !b) return null;
              const active = hover === e.a || hover === e.b;
              return (
                <line
                  key={i} x1={a.x} y1={a.y} x2={b.x} y2={b.y}
                  stroke={active ? "var(--neu)" : "var(--line2)"}
                  strokeWidth={0.8 + e.poids * 2.2}
                  strokeOpacity={active ? 0.9 : 0.25 + e.poids * 0.3}
                />
              );
            })}
            {/* nœuds */}
            {st.nodes.map((n) => {
              const p = pos.current.get(n.id);
              if (!p) return null;
              const r = 9 + n.force * 15;
              const col = valenceColor(n.valence);
              const isHov = hover === n.id;
              return (
                <g key={n.id} transform={`translate(${p.x},${p.y})`} onMouseEnter={() => setHover(n.id)} onMouseLeave={() => setHover(null)} style={{ cursor: "pointer" }}>
                  <circle r={r + 5} fill={col} opacity={isHov ? 0.16 : 0.07} />
                  <circle
                    r={r}
                    fill={`color-mix(in srgb, ${col} ${n.origine === "acquis" ? "22%" : "30%"}, transparent)`}
                    stroke={col}
                    strokeWidth={isHov ? 2.4 : 1.4}
                    strokeDasharray={n.origine === "acquis" ? "4 3" : undefined}
                  />
                  {n.emerge && <circle r={r + 3} fill="none" stroke="var(--pos)" strokeWidth={1} strokeDasharray="2 4" opacity={0.8} />}
                  <text y={r + 13} textAnchor="middle" className="mono" fontSize="9.5" fill={isHov ? "var(--text)" : "var(--mut)"}>
                    {shortLabel(n.label)}
                  </text>
                  <text y={3.5} textAnchor="middle" className="mono" fontSize="9" fill={col} fontWeight={600}>
                    {n.force.toFixed(1).replace(".", ",")}
                  </text>
                </g>
              );
            })}
          </svg>
          {/* légende + tooltip */}
          <div className="absolute top-2 left-3 flex items-center gap-3 mono text-[9.5px] text-[var(--dim)]">
            <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full" style={{ background: "var(--neg)" }} /> crainte</span>
            <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full" style={{ background: "var(--neu)" }} /> neutre</span>
            <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full" style={{ background: "var(--pos)" }} /> attirance</span>
            <span className="text-[var(--line2)]">│</span>
            <span>◌ acquis · ⊙ émergent</span>
          </div>
          {hovered && (
            <div className="absolute bottom-2 left-3 right-3 border border-[var(--line2)] bg-[var(--ink2)]/95 px-3 py-2 anim-in">
              <div className="flex items-center gap-2">
                <ValenceDot v={hovered.valence} />
                <span className="text-[12.5px] font-semibold">{hovered.label}</span>
                <Tag tone={hovered.valence > 0.15 ? "pos" : hovered.valence < -0.15 ? "neg" : "neu"}>
                  valence {hovered.valence > 0 ? "+" : ""}{fmtNum(hovered.valence)}
                </Tag>
                {hovered.emerge && <Tag tone="pos">émergent</Tag>}
              </div>
              <div className="mono text-[10px] text-[var(--dim)] mt-1">
                force {fmtNum(hovered.force)} · {hovered.activations} activation(s) · origine {hovered.origine}
              </div>
            </div>
          )}
        </div>
      </Panel>

      {/* clusters */}
      <Panel title="cluster_by_theme()" file="memory/graph_memory.py" delay={delay + 80}>
        <div className="px-4 py-3 space-y-4">
          {[
            { label: "Peurs ancestrales & acquises", list: clusters.peurs, tone: "neg" as const },
            { label: "Attirances", list: clusters.attirances, tone: "pos" as const },
          ].map((c) => (
            <div key={c.label}>
              <div className="flex items-center gap-2 mb-2">
                <span className="font-display text-[11px] font-bold uppercase tracking-[0.14em] text-[var(--mut)]">{c.label}</span>
                <span className="mono text-[10px] text-[var(--dim)]">({c.list.length})</span>
              </div>
              <div className="flex flex-wrap gap-1.5">
                {c.list.map((n) => (
                  <span
                    key={n.id}
                    className="mono text-[10.5px] px-2 py-1 border cursor-default transition-transform hover:-translate-y-0.5"
                    style={{
                      color: valenceColor(n.valence),
                      borderColor: `color-mix(in srgb, ${valenceColor(n.valence)} 35%, transparent)`,
                      background: `color-mix(in srgb, ${valenceColor(n.valence)} 7%, transparent)`,
                    }}
                    title={n.label}
                  >
                    {shortLabel(n.label)} · {n.force.toFixed(2).replace(".", ",")}
                  </span>
                ))}
                {c.list.length === 0 && <span className="text-[11px] text-[var(--dim)]">aucun nœud</span>}
              </div>
            </div>
          ))}
          <div>
            <div className="flex items-center gap-2 mb-2">
              <span className="font-display text-[11px] font-bold uppercase tracking-[0.14em] text-[var(--mut)]">Thèmes émergents</span>
              <span className="mono text-[10px] text-[var(--dim)]">({clusters.emergents.length})</span>
            </div>
            {clusters.emergents.length === 0 ? (
              <p className="text-[11.5px] text-[var(--mut)] leading-relaxed">
                Aucun pour l'instant. Les nœuds <span className="mono text-[var(--cy)]">acquis</span> (marqueurs) naissent des émotions fortes sans trait primitif correspondant ;
                à force ≥ 0,60, le clustering les signale comme thèmes émergents.
              </p>
            ) : (
              <div className="flex flex-wrap gap-1.5">
                {clusters.emergents.map((n) => (
                  <span key={n.id} className="mono text-[10.5px] px-2 py-1 border border-[var(--pos)]/50 text-[var(--pos)] bg-[var(--pos)]/10">
                    {n.label} · {n.force.toFixed(2).replace(".", ",")}
                  </span>
                ))}
              </div>
            )}
          </div>
          <p className="text-[10.5px] text-[var(--dim)] leading-relaxed border-t border-[var(--line)]/60 pt-3">
            Les arêtes naissent de la co-activation des traits dans une même interaction (poids +0,15).
            À chaque tic, le graphe subit une légère homéostasie (×0,995) avec plancher 0,25 pour l'ADN primitif.
          </p>
        </div>
      </Panel>
    </div>
  );
}

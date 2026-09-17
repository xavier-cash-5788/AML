import { useEffect, useRef, useState } from "react";
import { useSystem } from "../engine/system";
import { Panel } from "./ui";

const W = 640;
const H = 430;

// Positions fixes des zones cérébrales (anatomie simplifiée)
const BRAIN_ZONES = [
  { id: "prefrontal", label: "Cortex Préfrontal", x: W / 2, y: H * 0.25, color: "#3b82f6" },
  { id: "hippocampus", label: "Hippocampe", x: W * 0.35, y: H * 0.55, color: "#22c55e" },
  { id: "amygdala", label: "Amygdale", x: W * 0.65, y: H * 0.55, color: "#ef4444" },
  { id: "striatum", label: "Striatum", x: W / 2, y: H * 0.65, color: "#eab308" },
  { id: "temporal", label: "Cortex Temporal", x: W / 2, y: H * 0.8, color: "#a855f7" },
];

// Connexions anatomiques entre zones
const CONNECTIONS = [
  ["prefrontal", "hippocampus"],
  ["prefrontal", "amygdala"],
  ["prefrontal", "striatum"],
  ["hippocampus", "amygdala"],
  ["hippocampus", "temporal"],
  ["amygdala", "striatum"],
  ["striatum", "temporal"],
];

interface P { x: number; y: number; radius: number; intensity: number; }

export default function BrainView({ delay }: { delay: number }) {
  const st = useSystem();
  const [, setFrame] = useState(0);
  const zonesRef = useRef<Map<string, P>>(new Map());

  useEffect(() => {
    const map = zonesRef.current;
    BRAIN_ZONES.forEach((zone) => {
      const currentState = map.get(zone.id) || { x: zone.x, y: zone.y, radius: 0, intensity: 0 };
      const brainState = (st as any).brainState;
      const zoneState = brainState?.[zone.id];
      const targetIntensity = zoneState?.isActive ? (zoneState.intensity || 0.5) : 0.1;
      const newIntensity = currentState.intensity + (targetIntensity - currentState.intensity) * 0.15;
      const newRadius = 12 + newIntensity * 18;
      map.set(zone.id, { x: zone.x, y: zone.y, radius: newRadius, intensity: newIntensity });
    });
    setFrame((f) => (f + 1) % 1000000);
  }, [st.nodes, st.hormones, st.attention]);

  return (
    <div className="grid gap-3 xl:grid-cols-[1.5fr_1fr]">
      <Panel title="Activité Cérébrale" file="engine/cognitive_rl.ts" delay={delay} className="min-h-0">
        <div className="relative">
          <svg viewBox={`0 0 ${W} ${H}`} className="w-full block" style={{ background: "radial-gradient(ellipse at center, rgba(59,130,246,0.08), transparent 70%)" }}>
            {CONNECTIONS.map(([idA, idB], i) => {
              const a = zonesRef.current.get(idA);
              const b = zonesRef.current.get(idB);
              if (!a || !b) return null;
              const activity = (a.intensity + b.intensity) / 2;
              return (
                <line key={i} x1={a.x} y1={a.y} x2={b.x} y2={b.y} stroke="#60a5fa" strokeWidth={1 + activity * 2.5} strokeOpacity={0.15 + activity * 0.6} />
              );
            })}
            {BRAIN_ZONES.map((zone) => {
              const state = zonesRef.current.get(zone.id);
              if (!state) return null;
              const glowSize = state.radius * (1.5 + state.intensity);
              return (
                <g key={zone.id} transform={`translate(${state.x},${state.y})`}>
                  <circle r={glowSize} fill={zone.color} opacity={0.15 + state.intensity * 0.2} />
                  <circle r={state.radius} fill={zone.color} opacity={0.8 + state.intensity * 0.2} stroke="#fff" strokeWidth={1.5 + state.intensity * 2} />
                  <text y={-state.radius - 8} textAnchor="middle" className="mono" fontSize="10" fill="#cbd5e1" fontWeight="600" style={{ textShadow: "0 1px 2px rgba(0,0,0,0.8)" }}>{zone.label}</text>
                  <text y={4} textAnchor="middle" className="mono" fontSize="11" fill="#fff" fontWeight="bold">{Math.round(state.intensity * 100)}%</text>
                </g>
              );
            })}
          </svg>
          <div className="absolute top-2 left-3 flex flex-wrap items-center gap-3 mono text-[9.5px] text-[var(--dim)] bg-[var(--ink2)]/80 px-3 py-2 rounded border border-[var(--line2)]">
            <span className="font-bold text-[var(--text)] mr-1">Zones:</span>
            {BRAIN_ZONES.map((z) => (
              <span key={z.id} className="flex items-center gap-1"><span className="w-2 h-2 rounded-full" style={{ background: z.color }} />{z.label.split(" ")[0]}</span>
            ))}
          </div>
        </div>
      </Panel>
      <Panel title="État des Zones" file="engine/types.ts" delay={delay + 80}>
        <div className="px-4 py-3 space-y-3">
          {BRAIN_ZONES.map((zone) => {
            const state = zonesRef.current.get(zone.id);
            const intensity = state?.intensity || 0;
            return (
              <div key={zone.id} className="flex items-center justify-between border-b border-[var(--line)]/50 pb-2 last:border-0">
                <div className="flex items-center gap-2"><span className="w-3 h-3 rounded-full" style={{ background: zone.color }} /><span className="text-[11px] font-medium text-[var(--text)]">{zone.label}</span></div>
                <div className="flex items-center gap-2">
                  <div className="w-24 h-2 bg-[var(--line)] rounded-full overflow-hidden"><div className="h-full transition-all duration-300" style={{ width: `${intensity * 100}%`, background: zone.color }} /></div>
                  <span className="mono text-[10px] text-[var(--dim)] w-8 text-right">{Math.round(intensity * 100)}%</span>
                </div>
              </div>
            );
          })}
        </div>
      </Panel>
    </div>
  );
}

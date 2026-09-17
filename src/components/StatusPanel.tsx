import { system, useSystem } from "../engine/system";
import { fmtBytes, fmtNum, valenceColor } from "../engine/core";
import { forceOf, getActiveTraits } from "../engine/memory";
import { Bar, Btn, Panel, Stat, Tag, ValenceDot } from "./ui";

export default function StatusPanel({ delay }: { delay: number }) {
  const st = useSystem();
  const cfg = st.config.memory;
  const cap = cfg.max_size_mb * 1024 * 1024;
  const ratio = Math.min(1, st.sizeBytes / cap);
  const promus = st.memories.filter((m) => m.promu).length;
  const forces = st.memories.map((m) => forceOf(m, st.now, st.config));
  const buckets = new Array(10).fill(0) as number[];
  forces.forEach((f) => buckets[Math.min(9, Math.floor(f * 10))]++);
  const maxBucket = Math.max(1, ...buckets);
  const traits = getActiveTraits(st.nodes, 6);
  const remaining = Math.max(0, Math.ceil((st.nextTickAt - st.now) / 1000));
  const progress = 1 - remaining / Math.max(1, cfg.tic_interval_seconds);
  const avgForce = forces.length ? forces.reduce((a, b) => a + b, 0) / forces.length : 0;

  return (
    <div className="grid gap-3 lg:grid-cols-[1.2fr_1fr]">
      <div className="grid gap-3">
        {/* chiffres clés */}
        <div className="grid grid-cols-2 xl:grid-cols-4 gap-3 anim-in" style={{ animationDelay: `${delay}ms` }}>
          <Stat label="Souvenirs actifs" value={st.memories.length} sub={`${promus} consolidés au graphe`} accent="var(--neu)" />
          <Stat label="Taille mémoire" value={fmtBytes(st.sizeBytes)} sub={`${fmtNum(ratio * 100, ratio < 0.001 ? 4 : 3)} % du plafond`} accent="var(--cy)" />
          <Stat label="Oublis totaux" value={st.totalForgotten} sub="actifs + forcés (plafond)" accent="var(--neg)" />
          <Stat label="Tics effectués" value={st.tickCount} sub={`intervalle ${cfg.tic_interval_seconds} s`} accent="var(--pos)" />
        </div>

        <Panel title="Usage du plafond 500 Mo" file="memory/memory_size_manager.py" delay={delay + 60}>
          <div className="px-4 py-4">
            <div className="relative h-4 bg-[var(--ink)] border border-[var(--line)] overflow-hidden">
              <div
                className="h-full bar-anim bar-striped"
                style={{
                  width: `${Math.max(0.6, Math.sqrt(ratio) * 100)}%`,
                  background: ratio > 0.9 ? "var(--neg)" : ratio > 0.75 ? "var(--pos)" : "var(--neu)",
                }}
              />
              <span className="absolute inset-y-0 right-[10%] w-px bg-[var(--pos)]/60" title="seuil d'alerte 90 %" />
            </div>
            <div className="flex justify-between mt-2 mono text-[10px] text-[var(--dim)]">
              <span>0</span>
              <span className="text-[var(--pos)]">alerte 90 % ({fmtBytes(cap * 0.9)})</span>
              <span>{cfg.max_size_mb} Mo</span>
            </div>
            <p className="text-[11.5px] text-[var(--mut)] mt-3 leading-relaxed">
              Échelle en √ pour lisibilité. Au-delà de 90 %, le gestionnaire force l'oubli des souvenirs à force la plus basse
              jusqu'à repasser sous le plafond. Budget restant : <span className="mono text-[var(--neu)]">{fmtBytes(Math.max(0, cap - st.sizeBytes))}</span>.
            </p>
          </div>
        </Panel>

        {/* distribution des forces */}
        <Panel title="Distribution des forces (decay)" file="memory/decay_engine.py" delay={delay + 120}>
          <div className="px-4 pt-5 pb-3">
            <div className="flex items-end gap-[5px] h-24">
              {buckets.map((b, i) => (
                <div key={i} className="flex-1 flex flex-col items-center gap-1">
                  <div className="w-full flex items-end h-20">
                    <div
                      className="w-full col-anim"
                      style={{
                        height: `${(b / maxBucket) * 100}%`,
                        minHeight: b > 0 ? 3 : 1,
                        background: b > 0 ? "var(--neu)" : "var(--line)",
                        opacity: b > 0 ? 0.25 + 0.75 * (b / maxBucket) : 0.5,
                      }}
                    />
                  </div>
                  <span className="mono text-[9px] text-[var(--dim)]">{(i / 10).toFixed(1).replace(".", ",")}</span>
                </div>
              ))}
            </div>
            <p className="text-[11px] text-[var(--mut)] mt-2">
              {forces.length === 0
                ? "Aucun souvenir encodé — la distribution se remplira avec vos échanges."
                : `${forces.length} trace(s) · force moyenne ${fmtNum(avgForce)} · la masse glisse vers la gauche à chaque tic.`}
            </p>
          </div>
        </Panel>
      </div>

      <div className="grid gap-3">
        {/* tic */}
        <Panel
          title="Tic de consolidation"
          file="memory/memory_scheduler.py"
          delay={delay + 60}
          right={
            <Btn onClick={() => system.forceTick()} variant="ghost" className="!py-1 !px-2 !text-[11px]">
              ⚡ forcer le tic
            </Btn>
          }
        >
          <div className="px-4 py-4 flex items-center gap-4">
            <div className="relative w-[74px] h-[74px] shrink-0">
              <svg viewBox="0 0 80 80" className="w-full h-full -rotate-90">
                <circle cx="40" cy="40" r="34" fill="none" stroke="var(--line)" strokeWidth="6" />
                <circle
                  cx="40" cy="40" r="34" fill="none" stroke="var(--neu)" strokeWidth="6" strokeLinecap="round"
                  strokeDasharray={2 * Math.PI * 34}
                  strokeDashoffset={(1 - progress) * 2 * Math.PI * 34}
                  style={{ transition: "stroke-dashoffset 1s linear" }}
                />
              </svg>
              <div className="absolute inset-0 flex flex-col items-center justify-center">
                <span className="mono text-[19px] font-semibold text-[var(--neu)] leading-none">{remaining}</span>
                <span className="text-[9px] uppercase tracking-widest text-[var(--dim)] mt-0.5">sec</span>
              </div>
            </div>
            <div className="min-w-0">
              {st.lastTick ? (
                <>
                  <div className="text-[12px] text-[var(--text)] font-medium">
                    Dernier tic : n°{st.tickCount}
                  </div>
                  <div className="mono text-[10.5px] text-[var(--mut)] mt-1 leading-relaxed">
                    {st.lastTick.promus.length > 0 && <div className="text-[var(--pos)]">▲ {st.lastTick.promus.length} promotion(s) → graphe</div>}
                    {st.lastTick.oublies.length > 0 && <div className="text-[var(--neg)]">▼ {st.lastTick.oublies.length} oubli(s) actif(s)</div>}
                    {st.lastTick.promus.length === 0 && st.lastTick.oublies.length === 0 && <div>decay recalculé, rien à consolider ni à effacer</div>}
                    <div className="text-[var(--dim)]">taille après tic : {fmtBytes(st.lastTick.tailleOctets)}</div>
                  </div>
                </>
              ) : (
                <p className="text-[12px] text-[var(--mut)] leading-relaxed">
                  Aucun tic pour l'instant. Toutes les {cfg.tic_interval_seconds} s : decay recalculé, promotions vecteur → graphe, oublis actifs sous {cfg.seuil_oubli}.
                </p>
              )}
            </div>
          </div>
        </Panel>

        {/* traits dominants */}
        <Panel title="Traits dominants" file="memory/graph_memory.py" delay={delay + 120}>
          <div className="px-4 py-3 space-y-2.5">
            {traits.length === 0 && <p className="text-[12px] text-[var(--mut)] py-3">Graphe au repos — aucun trait saillant.</p>}
            {traits.map((t) => (
              <div key={t.id} className="group">
                <div className="flex items-center gap-2 mb-1">
                  <ValenceDot v={t.valence} />
                  <span className="text-[12.5px] font-medium text-[var(--text)] group-hover:text-[var(--neu)] transition-colors">{t.label}</span>
                  {t.emerge && <Tag tone="pos">émergent</Tag>}
                  {t.origine === "primitif" ? (
                    <span className="mono text-[9px] text-[var(--dim)] uppercase tracking-wider">ADN</span>
                  ) : (
                    <span className="mono text-[9px] text-[var(--cy)] uppercase tracking-wider">acquis</span>
                  )}
                  <span className="mono ml-auto text-[11px]" style={{ color: valenceColor(t.valence) }}>
                    {fmtNum(t.force)}
                  </span>
                </div>
                <Bar value={t.force} color={valenceColor(t.valence)} />
              </div>
            ))}
          </div>
        </Panel>

        {/* formules */}
        <Panel title="Loi du decay" file="config.json" delay={delay + 180}>
          <div className="px-4 py-4 mono text-[11.5px] leading-6 text-[var(--mut)]">
            <div className="text-[var(--text)]">force(t) = I₀ × e<sup>−λ·Δt</sup></div>
            <div className="mt-2 grid grid-cols-3 gap-2 text-center">
              <div className="border border-[var(--line)] py-1.5">
                <div className="text-[var(--neg)]">λ nég</div>
                <div>{fmtNum(cfg.decay_lambda_negatif, 3)}</div>
              </div>
              <div className="border border-[var(--line)] py-1.5">
                <div className="text-[var(--neu)]">λ neu</div>
                <div>{fmtNum(cfg.decay_lambda_neutre, 3)}</div>
              </div>
              <div className="border border-[var(--line)] py-1.5">
                <div className="text-[var(--pos)]">λ pos</div>
                <div>{fmtNum(cfg.decay_lambda_positif, 3)}</div>
              </div>
            </div>
            <div className="mt-2 text-[10px] text-[var(--dim)]">
              promotion ≥ {cfg.seuil_promotion_graphe} · oubli &lt; {cfg.seuil_oubli} · Δmax/interaction ±{cfg.max_variation_par_interaction}
            </div>
          </div>
        </Panel>
      </div>
    </div>
  );
}


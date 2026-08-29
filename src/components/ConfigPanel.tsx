import { useState } from "react";
import { system, useSystem } from "../engine/system";
import { DEFAULT_CONFIG, fmtNum } from "../engine/core";
import { testOllama, fetchOllamaModels } from "../engine/brain";
import type { LlmProvider } from "../engine/types";
import { Btn, Modal, Panel } from "./ui";

function Slider({
  label, value, min, max, step, onChange, fmt = (v: number) => fmtNum(v, 2),
}: {
  label: string; value: number; min: number; max: number; step: number;
  onChange: (v: number) => void; fmt?: (v: number) => string;
}) {
  return (
    <label className="block">
      <div className="flex items-baseline justify-between mb-1">
        <span className="text-[12px] text-[var(--mut)]">{label}</span>
        <span className="mono text-[11.5px] text-[var(--neu)]">{fmt(value)}</span>
      </div>
      <input
        type="range" min={min} max={max} step={step} value={value}
        onChange={(e) => onChange(parseFloat(e.target.value))}
        className="w-full h-[3px] cursor-pointer"
      />
    </label>
  );
}

export default function ConfigPanel({ delay }: { delay: number }) {
  const st = useSystem();
  const cfg = st.config;
  const [testState, setTestState] = useState<{ ok: boolean; detail: string } | null>(null);
  const [testing, setTesting] = useState(false);
  const [confirmReset, setConfirmReset] = useState(false);
  const [ollamaModels, setOllamaModels] = useState<string[]>([]);
  const [loadingModels, setLoadingModels] = useState(false);
  
  const guardrail = cfg.guardrail || DEFAULT_CONFIG.guardrail!;

  const runTest = async () => {
    setTesting(true);
    setTestState(null);
    const r = await testOllama(cfg.llm.endpoint);
    setTestState(r);
    setTesting(false);
  };
  
  const loadModels = async () => {
    setLoadingModels(true);
    const models = await fetchOllamaModels(cfg.llm.endpoint);
    setOllamaModels(models);
    setLoadingModels(false);
  };

  return (
    <div className="grid gap-3 lg:grid-cols-2">
      <Panel title="LLM local" file="config.json · llm" delay={delay}>
        <div className="px-4 py-4 space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <label className="block">
              <span className="text-[12px] text-[var(--mut)] block mb-1">provider</span>
              <select
                value={cfg.llm.provider}
                onChange={(e) => system.setConfig({ llm: { provider: e.target.value as LlmProvider } })}
                className="w-full mono bg-[var(--ink)] border border-[var(--line)] px-2 py-2 text-[12px] text-[var(--text)]"
              >
                <option value="simule">simule (moteur embarqué)</option>
                <option value="ollama">ollama</option>
              </select>
            </label>
            <label className="block">
              <span className="text-[12px] text-[var(--mut)] block mb-1">model</span>
              <div className="flex gap-2">
                <select
                  value={cfg.llm.model}
                  onChange={(e) => system.setConfig({ llm: { model: e.target.value } })}
                  className="flex-1 mono bg-[var(--ink)] border border-[var(--line)] px-2 py-2 text-[12px] text-[var(--text)]"
                >
                  {ollamaModels.length === 0 ? (
                    <option value={cfg.llm.model}>{cfg.llm.model || "mistral"}</option>
                  ) : (
                    ollamaModels.map((m) => (
                      <option key={m} value={m}>{m}</option>
                    ))
                  )}
                </select>
                <button
                  onClick={loadModels}
                  disabled={loadingModels}
                  className="mono bg-[var(--neu)] text-[var(--ink)] px-2 py-2 text-[11px] disabled:opacity-50"
                  title="Charger les modèles depuis Ollama"
                >
                  {loadingModels ? "..." : "↻"}
                </button>
              </div>
            </label>
          </div>
          <label className="block">
            <span className="text-[12px] text-[var(--mut)] block mb-1">endpoint</span>
            <input
              value={cfg.llm.endpoint}
              onChange={(e) => system.setConfig({ llm: { endpoint: e.target.value } })}
              className="w-full mono bg-[var(--ink)] border border-[var(--line)] px-2 py-2 text-[12px] text-[var(--text)]"
            />
          </label>
          <div className="flex items-center gap-3">
            <Btn onClick={runTest} disabled={testing} variant="solid" className="!text-[11.5px]">
              {testing ? "test en cours…" : "Tester la connexion Ollama"}
            </Btn>
            {testState && (
              <span className={`mono text-[10.5px] anim-in ${testState.ok ? "text-[var(--neu)]" : "text-[var(--neg)]"}`}>
                {testState.ok ? "✓" : "✗"} {testState.detail}
              </span>
            )}
          </div>
          {ollamaModels.length > 0 && (
            <p className="text-[10px] text-[var(--dim)]">
              {ollamaModels.length} modèle(s) détecté(s): {ollamaModels.slice(0, 5).join(", ")}{ollamaModels.length > 5 ? "…" : ""}
            </p>
          )}
          <p className="text-[11px] text-[var(--dim)] leading-relaxed border-t border-[var(--line)]/60 pt-3">
            En mode <span className="mono">ollama</span>, chaque /chat tente <span className="mono">POST {cfg.llm.endpoint}/api/chat</span> avec le prompt système construit
            par prompt_builder ; en cas d'échec, le moteur simulé contextuel prend le relais sans interruption.
          </p>
        </div>
      </Panel>

      <Panel title="Paramètres mémoire" file="config.json · memory" delay={delay + 60}>
        <div className="px-4 py-4 space-y-4">
          <Slider label="tic_interval_seconds" value={cfg.memory.tic_interval_seconds} min={5} max={300} step={5}
            fmt={(v) => `${v} s`} onChange={(v) => system.setConfig({ tic_interval_seconds: v })} />
          <Slider label="decay_lambda_neutre" value={cfg.memory.decay_lambda_neutre} min={0.002} max={0.2} step={0.002}
            fmt={(v) => fmtNum(v, 3)} onChange={(v) => system.setConfig({ decay_lambda_neutre: v })} />
          <Slider label="decay_lambda_negatif" value={cfg.memory.decay_lambda_negatif} min={0.002} max={0.2} step={0.002}
            fmt={(v) => fmtNum(v, 3)} onChange={(v) => system.setConfig({ decay_lambda_negatif: v })} />
          <Slider label="decay_lambda_positif" value={cfg.memory.decay_lambda_positif} min={0.002} max={0.2} step={0.002}
            fmt={(v) => fmtNum(v, 3)} onChange={(v) => system.setConfig({ decay_lambda_positif: v })} />
          <div className="grid grid-cols-2 gap-x-5 gap-y-4">
            <Slider label="seuil_promotion_graphe" value={cfg.memory.seuil_promotion_graphe} min={0.3} max={0.95} step={0.01}
              onChange={(v) => system.setConfig({ seuil_promotion_graphe: v })} />
            <Slider label="seuil_oubli" value={cfg.memory.seuil_oubli} min={0.01} max={0.3} step={0.01}
              onChange={(v) => system.setConfig({ seuil_oubli: v })} />
          </div>
          <Slider label="max_variation_par_interaction" value={cfg.memory.max_variation_par_interaction} min={0.01} max={0.5} step={0.01}
            onChange={(v) => system.setConfig({ max_variation_par_interaction: v })} />
          <div className="flex items-center justify-between border-t border-[var(--line)]/60 pt-3">
            <span className="mono text-[10px] text-[var(--dim)]">plafond : {cfg.memory.max_size_mb} Mo (fixe)</span>
            <Btn onClick={() => system.resetConfig()} className="!text-[11px]">rétablir les défauts</Btn>
          </div>
        </div>
      </Panel>

      <Panel title="Zone sensible" file="api/server.py · POST /memory/reset" delay={delay + 120} className="lg:col-span-2">
        <div className="px-4 py-4 flex flex-col sm:flex-row sm:items-center gap-3 justify-between">
          <p className="text-[12px] text-[var(--mut)] leading-relaxed max-w-xl">
            Purge le stockage vectoriel, recharge le graphe depuis <span className="mono text-[var(--dim)]">primitive_seed.json</span>,
            remet le journal et la conversation à zéro. Les paramètres sont conservés.
          </p>
          <Btn variant="danger" onClick={() => setConfirmReset(true)}>
            ⌦ purger la mémoire
          </Btn>
        </div>
      </Panel>

      <Modal open={confirmReset} onClose={() => setConfirmReset(false)} title="POST /memory/reset">
        <p className="text-[13px] text-[var(--mut)] leading-relaxed">
          {st.memories.length} souvenir(s) actif(s), {st.nodes.length} nœuds de graphe et {st.events.length} lignes de journal seront
          <span className="text-[var(--neg)]"> définitivement effacés</span>. L'ADN primitif sera rechargé. Confirmer ?
        </p>
        <div className="flex justify-end gap-2 mt-5">
          <Btn onClick={() => setConfirmReset(false)}>annuler</Btn>
          <Btn
            variant="danger"
            onClick={() => {
              system.reset();
              setConfirmReset(false);
            }}
          >
            purger définitivement
          </Btn>
        </div>
      </Modal>

      <Panel title="Pipeline de Validation (Guardrail)" file="guardrail/validator.ts" delay={delay + 180} className="lg:col-span-2">
        <div className="px-4 py-4 space-y-4">
          <div className="flex items-center justify-between">
            <span className="text-[12px] text-[var(--mut)]">activer la validation des citations</span>
            <input
              type="checkbox"
              checked={guardrail.enabled}
              onChange={(e) => system.setConfig({ guardrail: { ...guardrail, enabled: e.target.checked } })}
              className="h-4 w-4"
            />
          </div>
          <p className="text-[11px] text-[var(--dim)] leading-relaxed">
            Un petit modèle vérifie que les souvenirs cités par le LLM existent réellement dans le RAG avant d'afficher la réponse.
            Fiabilité absolue (0 % d'hallucination d'épisode), mais ajoute de la latence.
          </p>
          <div className="grid grid-cols-2 gap-3">
            <label className="block">
              <span className="text-[12px] text-[var(--mut)] block mb-1">provider</span>
              <select
                value={guardrail.provider}
                onChange={(e) => system.setConfig({ guardrail: { ...guardrail, provider: e.target.value as "simule" | "ollama" | "none" } })}
                className="w-full mono bg-[var(--ink)] border border-[var(--line)] px-2 py-2 text-[12px] text-[var(--text)]"
              >
                <option value="simule">simule (ultra-rapide, heuristique)</option>
                <option value="ollama">ollama (petit modèle, ex: gemma2:2b)</option>
                <option value="none">aucun</option>
              </select>
            </label>
            <label className="block">
              <span className="text-[12px] text-[var(--mut)] block mb-1">modèle (si ollama)</span>
              <input
                value={guardrail.model || "gemma2:2b"}
                onChange={(e) => system.setConfig({ guardrail: { ...guardrail, model: e.target.value } })}
                className="w-full mono bg-[var(--ink)] border border-[var(--line)] px-2 py-2 text-[12px] text-[var(--text)]"
                placeholder="gemma2:2b"
              />
            </label>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <label className="block">
              <span className="text-[12px] text-[var(--mut)] block mb-1">endpoint (si ollama)</span>
              <input
                value={guardrail.endpoint || cfg.llm.endpoint}
                onChange={(e) => system.setConfig({ guardrail: { ...guardrail, endpoint: e.target.value } })}
                className="w-full mono bg-[var(--ink)] border border-[var(--line)] px-2 py-2 text-[12px] text-[var(--text)]"
                placeholder="http://localhost:11434"
              />
            </label>
            <label className="block">
              <span className="text-[12px] text-[var(--mut)] block mb-1">latence max acceptable (ms)</span>
              <input
                type="number"
                value={guardrail.maxLatencyAcceptable || 1500}
                onChange={(e) => system.setConfig({ guardrail: { ...guardrail, maxLatencyAcceptable: parseInt(e.target.value) || 1500 } })}
                className="w-full mono bg-[var(--ink)] border border-[var(--line)] px-2 py-2 text-[12px] text-[var(--text)]"
              />
            </label>
          </div>
          <div className="flex items-center gap-3 border-t border-[var(--line)]/60 pt-3">
            <span className="mono text-[10.5px] text-[var(--dim)]">
              état : {guardrail.enabled ? `✓ activé (${guardrail.provider}${guardrail.model ? ` · ${guardrail.model}` : ""})` : "✗ désactivé"}
            </span>
          </div>
        </div>
      </Panel>
    </div>
  );
}

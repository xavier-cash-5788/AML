import { useEffect, useRef, useState } from "react";
import { system, useSystem } from "../engine/system";
import { fmtClock, fmtNum, trunc } from "../engine/core";
import type { ChatMessage } from "../engine/types";
import { Panel, TONE_HEX, Tag } from "./ui";

const SUGGESTIONS = [
  "J'ai peur du noir depuis toujours",
  "Qu'est-ce que tu sais de moi ?",
  "Je me sens tellement seul ce soir",
  "Pourquoi est-ce que tu oublies ?",
  "Qui es-tu exactement ?",
  "Le soleil chaud me rend heureux !",
];

function toneOf(v: number): "pos" | "neg" | "neu" {
  return v > 0.15 ? "pos" : v < -0.15 ? "neg" : "neu";
}

function Bubble({ m }: { m: ChatMessage }) {
  const user = m.role === "user";
  const tone = m.emotion ? toneOf(m.emotion.valence) : "neu";
  return (
    <div className={`bubble-in flex ${user ? "justify-end" : "justify-start"}`}>
      <div className={`max-w-[86%] ${user ? "order-1" : ""}`}>
        <div
          className={`relative px-3.5 py-2.5 text-[13.5px] leading-relaxed border ${
            user
              ? "bg-[#173830] border-[#28544a] text-[var(--text)] rounded-lg rounded-br-[2px]"
              : "bg-[var(--panel2)] border-[var(--line)] rounded-lg rounded-bl-[2px]"
          }`}
          style={!user ? { borderLeft: `2px solid ${TONE_HEX[tone]}` } : undefined}
        >
          {m.texte}
        </div>
        <div className={`flex items-center gap-2 mt-1 ${user ? "justify-end" : "justify-start"}`}>
          <span className="mono text-[10px] text-[var(--dim)]">{fmtClock(m.t)}</span>
          {user && m.emotion && (
            <>
              <Tag tone={tone}>
                {m.emotion.valence >= 0 ? "+" : ""}
                {fmtNum(m.emotion.valence)} · I {fmtNum(m.emotion.intensite)}
              </Tag>
              {m.emotion.traits_actives.length > 0 && (
                <span className="mono text-[10px] text-[var(--dim)]">traits : {m.emotion.traits_actives.map((t) => t.replace("marqueur:", "~")).slice(0, 2).join(", ")}</span>
              )}
            </>
          )}
          {!user && (m.rappels ?? 0) > 0 && (
            <span className="mono text-[10px] text-[var(--neu)]">◈ {m.rappels} souvenir{(m.rappels ?? 0) > 1 ? "s" : ""} rappelé{(m.rappels ?? 0) > 1 ? "s" : ""}</span>
          )}
        </div>
      </div>
    </div>
  );
}

export default function ChatPanel({ delay }: { delay: number }) {
  const st = useSystem();
  const [text, setText] = useState("");
  const [showPrompt, setShowPrompt] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTo({ top: el.scrollHeight, behavior: "smooth" });
  }, [st.chat.length, st.typing]);

  const send = (raw?: string) => {
    const value = (raw ?? text).trim();
    if (!value || st.typing) return;
    setText("");
    system.chat(value);
    inputRef.current?.focus();
  };

  return (
    <Panel
      title="Conversation"
      file="api/server.py · POST /chat"
      delay={delay}
      className="flex flex-col min-h-0 h-full"
      right={
        <span className="flex items-center gap-1.5 text-[10px] mono text-[var(--mut)]">
          <span className="live-dot inline-block w-1.5 h-1.5 rounded-full bg-[var(--neu)]" />
          pipeline actif
        </span>
      }
    >
      {/* fil de discussion */}
      <div ref={scrollRef} className="flex-1 min-h-0 overflow-y-auto px-4 py-4 space-y-4">
        {st.chat.map((m) => (
          <Bubble key={m.id} m={m} />
        ))}
        {st.typing && (
          <div className="bubble-in flex justify-start">
            <div className="px-4 py-3 bg-[var(--panel2)] border border-[var(--line)] rounded-lg rounded-bl-[2px] flex items-center gap-1.5">
              {[0, 1, 2].map((i) => (
                <span key={i} className="typing-dot inline-block w-1.5 h-1.5 rounded-full bg-[var(--neu)]" />
              ))}
              <span className="mono text-[10px] text-[var(--dim)] ml-2">
                {st.config.llm.provider === "ollama" ? "ollama…" : "encodage émotionnel…"}
              </span>
            </div>
          </div>
        )}
      </div>

      {/* inspecteur de prompt */}
      {showPrompt && st.promptDebug && (
        <div className="border-t border-[var(--line)] bg-[var(--ink2)] px-4 py-3 max-h-44 overflow-y-auto">
          <div className="mono text-[10px] text-[var(--neu)] mb-1.5">core/prompt_builder.py — prompt système injecté au LLM ↓</div>
          <pre className="mono text-[11px] leading-relaxed text-[var(--mut)] whitespace-pre-wrap">{st.promptDebug}</pre>
        </div>
      )}

      {/* suggestions */}
      {st.chat.length <= 2 && (
        <div className="px-4 pb-2 flex flex-wrap gap-1.5">
          {SUGGESTIONS.map((s) => (
            <button
              key={s}
              onClick={() => send(s)}
              className="mono text-[10.5px] px-2 py-1 border border-[var(--line)] text-[var(--mut)] hover:border-[var(--neu)] hover:text-[var(--neu)] transition-colors"
            >
              {trunc(s, 34)}
            </button>
          ))}
        </div>
      )}

      {/* saisie */}
      <div className="border-t border-[var(--line)] p-3 bg-[var(--ink2)]/60">
        <div className="flex items-end gap-2">
          <textarea
            ref={inputRef}
            rows={1}
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                send();
              }
            }}
            placeholder="Écris quelque chose qui compte… (Entrée pour envoyer)"
            className="flex-1 resize-none bg-[var(--ink)] border border-[var(--line)] px-3 py-2.5 text-[13.5px] placeholder:text-[var(--dim)] focus:border-[var(--line2)]"
          />
          <button
            onClick={() => send()}
            disabled={!text.trim() || st.typing}
            className="shrink-0 w-10 h-10 flex items-center justify-center bg-[var(--neu)] text-[#08211b] disabled:opacity-30 hover:bg-[#6fd4bd] active:translate-y-[1px] transition-all"
            title="Envoyer"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
              <path d="M5 12h14M13 6l6 6-6 6" />
            </svg>
          </button>
        </div>
        <div className="flex items-center justify-between mt-2">
          <button onClick={() => setShowPrompt((v) => !v)} className="mono text-[10px] text-[var(--dim)] hover:text-[var(--neu)] transition-colors">
            {showPrompt ? "▾ masquer" : "▸ inspecter"} le prompt système
          </button>
          <span className="mono text-[10px] text-[var(--dim)]">
            LLM : {st.llmMode === "ollama" ? `ollama/${st.config.llm.model}` : "moteur simulé"}
          </span>
        </div>
      </div>
    </Panel>
  );
}

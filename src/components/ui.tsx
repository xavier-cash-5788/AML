import type { ReactNode } from "react";
import { valenceColor } from "../engine/core";

export const TONE_HEX: Record<"pos" | "neg" | "neu", string> = {
  pos: "var(--pos)",
  neg: "var(--neg)",
  neu: "var(--neu)",
};

/** Coins en équerre — signature visuelle des panneaux */
export function Corners({ tone = "var(--line2)" }: { tone?: string }) {
  const c = "absolute w-2.5 h-2.5 border-current pointer-events-none";
  return (
    <span aria-hidden className="contents" style={{ color: tone }}>
      <span className={`${c} top-0 left-0 border-t border-l`} />
      <span className={`${c} top-0 right-0 border-t border-r`} />
      <span className={`${c} bottom-0 left-0 border-b border-l`} />
      <span className={`${c} bottom-0 right-0 border-b border-r`} />
    </span>
  );
}

export function Panel({
  title,
  file,
  right,
  children,
  className = "",
  delay = 0,
}: {
  title?: string;
  file?: string;
  right?: ReactNode;
  children: ReactNode;
  className?: string;
  delay?: number;
}) {
  return (
    <section
      className={`anim-in relative border border-[var(--line)] bg-[var(--panel)]/90 ${className}`}
      style={{ animationDelay: `${delay}ms` }}
    >
      <Corners />
      {title && (
        <header className="flex items-center gap-2.5 px-4 pt-3 pb-2 border-b border-[var(--line)]/70">
          <h2 className="font-display text-[13px] font-bold uppercase tracking-[0.14em] text-[var(--text)]">{title}</h2>
          {file && (
            <span className="mono hidden sm:inline text-[10px] text-[var(--dim)] border border-[var(--line)] px-1.5 py-0.5 bg-[var(--ink2)]">
              {file}
            </span>
          )}
          <div className="ml-auto flex items-center gap-2">{right}</div>
        </header>
      )}
      {children}
    </section>
  );
}

export function Stat({
  label,
  value,
  sub,
  accent = "var(--neu)",
}: {
  label: string;
  value: ReactNode;
  sub?: ReactNode;
  accent?: string;
}) {
  return (
    <div className="relative border border-[var(--line)] bg-[var(--ink2)] px-3.5 py-3 overflow-hidden group hover:border-[var(--line2)] transition-colors">
      <span className="absolute top-0 left-0 h-[2px] w-8 transition-all duration-500 group-hover:w-full" style={{ background: accent }} />
      <div className="text-[10px] uppercase tracking-[0.16em] text-[var(--dim)] font-medium">{label}</div>
      <div className="mono text-[22px] leading-7 font-semibold mt-1" style={{ color: accent }}>
        {value}
      </div>
      {sub && <div className="text-[11px] text-[var(--mut)] mt-0.5">{sub}</div>}
    </div>
  );
}

export function Bar({ value, color, className = "", striped = false }: { value: number; color: string; className?: string; striped?: boolean }) {
  return (
    <div className={`h-[5px] bg-[var(--ink)] border border-[var(--line)]/60 overflow-hidden ${className}`}>
      <div
        className={`h-full bar-anim ${striped ? "bar-striped" : ""}`}
        style={{ width: `${Math.max(0.5, Math.min(100, value * 100))}%`, background: color }}
      />
    </div>
  );
}

export function Tag({ children, tone = "neu" }: { children: ReactNode; tone?: "pos" | "neg" | "neu" }) {
  return (
    <span
      className="mono inline-flex items-center gap-1 text-[10px] px-1.5 py-[3px] border leading-none"
      style={{ color: TONE_HEX[tone], borderColor: `color-mix(in srgb, ${TONE_HEX[tone]} 40%, transparent)`, background: `color-mix(in srgb, ${TONE_HEX[tone]} 8%, transparent)` }}
    >
      {children}
    </span>
  );
}

export function ValenceDot({ v, size = 8 }: { v: number; size?: number }) {
  return (
    <span
      className="inline-block rounded-full shrink-0"
      style={{ width: size, height: size, background: valenceColor(v), boxShadow: `0 0 6px ${valenceColor(v)}66` }}
    />
  );
}

export function Btn({
  children,
  onClick,
  variant = "ghost",
  className = "",
  disabled,
  title,
}: {
  children: ReactNode;
  onClick?: () => void;
  variant?: "ghost" | "solid" | "danger";
  className?: string;
  disabled?: boolean;
  title?: string;
}) {
  const base = "inline-flex items-center gap-1.5 px-3 py-1.5 text-[12px] font-medium border transition-all duration-150 active:translate-y-[1px] disabled:opacity-40 disabled:pointer-events-none";
  const styles =
    variant === "solid"
      ? "bg-[var(--neu)] text-[#08211b] border-[var(--neu)] hover:bg-[#6fd4bd] font-semibold"
      : variant === "danger"
        ? "border-[color-mix(in_srgb,var(--neg)_55%,transparent)] text-[var(--neg)] hover:bg-[color-mix(in_srgb,var(--neg)_14%,transparent)]"
        : "border-[var(--line2)] text-[var(--mut)] hover:text-[var(--text)] hover:border-[var(--neu)] hover:text-[var(--neu)]";
  return (
    <button title={title} disabled={disabled} onClick={onClick} className={`${base} ${styles} ${className}`}>
      {children}
    </button>
  );
}

export function Modal({ open, onClose, title, children }: { open: boolean; onClose: () => void; title: string; children: ReactNode }) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" role="dialog" aria-modal>
      <div className="absolute inset-0 bg-[#05080780] backdrop-blur-[2px]" onClick={onClose} />
      <div className="anim-in relative w-full max-w-md border border-[var(--line2)] bg-[var(--panel)] shadow-[0_24px_80px_rgba(0,0,0,0.6)]">
        <Corners tone="var(--neg)" />
        <header className="px-5 pt-4 pb-3 border-b border-[var(--line)]">
          <h3 className="font-display text-sm font-bold uppercase tracking-[0.12em]">{title}</h3>
        </header>
        <div className="px-5 py-4">{children}</div>
      </div>
    </div>
  );
}

export function EmptyState({ children }: { children: ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center py-10 text-center px-6">
      <svg width="34" height="34" viewBox="0 0 24 24" fill="none" className="text-[var(--dim)] mb-3" stroke="currentColor" strokeWidth="1.4">
        <circle cx="12" cy="12" r="3.2" />
        <path d="M12 2v4M12 18v4M2 12h4M18 12h4M4.9 4.9l2.8 2.8M16.3 16.3l2.8 2.8M4.9 19.1l2.8-2.8M16.3 7.7l2.8-2.8" strokeLinecap="round" />
      </svg>
      <p className="text-[12.5px] text-[var(--mut)] max-w-[300px] leading-relaxed">{children}</p>
    </div>
  );
}

// ── config.json + primitive_seed.json + embedding + utilitaires ─────────────
import type { Config } from "./types";

export const DEFAULT_CONFIG: Config = {
  llm: { provider: "simule", model: "mistral", endpoint: "http://localhost:11434" },
  memory: {
    max_size_mb: 500,
    tic_interval_seconds: 60,
    decay_lambda_neutre: 0.05,
    decay_lambda_negatif: 0.02,
    decay_lambda_positif: 0.03,
    seuil_promotion_graphe: 0.65,
    seuil_oubli: 0.05,
    max_variation_par_interaction: 0.1,
  },
};

export const EMBED_DIM = 96;

// ── primitive_seed.json : ADN primitif (peurs / attirances ancestrales) ─────
export interface SeedTrait {
  id: string;
  label: string;
  valence: number;
  force: number;
  keywords: string[];
}

export const PRIMITIVE_SEED: { traits: SeedTrait[]; liens: [string, string, number][] } = {
  traits: [
    { id: "abandon", label: "peur de l'abandon", valence: -0.8, force: 0.62, keywords: ["seul", "seule", "solitude", "abandonn", "quitte", "délaiss", "personne", "vide", "manque", "isolé"] },
    { id: "noir", label: "peur du noir", valence: -0.7, force: 0.55, keywords: ["nuit", "noir", "sombre", "obscur", "ombre", "cauchemar", "ténèbres"] },
    { id: "rejet", label: "peur du rejet", valence: -0.75, force: 0.58, keywords: ["rejet", "jugé", "jugée", "moque", "exclu", "exclue", "pas aimé", "rejeté", "humilié"] },
    { id: "foule", label: "peur de la foule", valence: -0.6, force: 0.48, keywords: ["foule", "trop de gens", "cohue", "bondé", "métro", "file"] },
    { id: "bruit", label: "crainte du bruit fort", valence: -0.5, force: 0.42, keywords: ["cri", "hurle", "fracas", "explosion", "tonnerre", "bruit", "claquement"] },
    { id: "chaleur", label: "attirance : chaleur", valence: 0.7, force: 0.56, keywords: ["chaud", "soleil", "feu", "thé", "câlin", "doux", "tiède", "réconfort", "cocon"] },
    { id: "voix", label: "attirance : voix familière", valence: 0.65, force: 0.52, keywords: ["voix", "raconte", "chanson", "musique", "murmure", "parole"] },
    { id: "curiosite", label: "curiosité", valence: 0.6, force: 0.66, keywords: ["pourquoi", "comment", "curieux", "curieuse", "découvrir", "apprendre", "énigme", "mystère", "explique"] },
    { id: "lien", label: "besoin de lien", valence: 0.75, force: 0.68, keywords: ["ami", "amie", "famille", "ensemble", "proches", "amour", "aime", "lien", "confiance"] },
    { id: "jeu", label: "goût du jeu", valence: 0.5, force: 0.45, keywords: ["jeu", "joue", "drôle", "amusant", "rire", "blague", "devinette", "amusant"] },
  ],
  liens: [
    ["abandon", "rejet", 0.65],
    ["abandon", "lien", 0.7],
    ["noir", "bruit", 0.35],
    ["chaleur", "voix", 0.45],
    ["curiosite", "jeu", 0.5],
    ["lien", "voix", 0.4],
    ["rejet", "foule", 0.3],
  ],
};

// ── embedding léger : hachage de tokens + bigrammes (ChromaDB local) ────────
const STOP = new Set(
  "le la les un une des du de d l et ou où est sont être avoir a ai as je tu il elle on nous vous ils elles ce cette mon ma mes ton ta tes pour avec dans sur sous par pas ne n pas plus moins très bien que qui quoi dont alors donc mais si très y en au aux ça cela cet ces ainsi aussi comme comment quand tout tous toute toutes fait faire dire dit moi toi lui leur se sa son ses ici là très déjà encore toujours jamais rien quelqu rien lors depuis vers chez entre après avant pendant sans".split(/\s+/)
);

function fnv1a(str: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

function stem(t: string): string {
  return t
    .replace(/(eaux|eaux)$/, "")
    .replace(/(tion|tions|sion|sions)$/, "t")
    .replace(/(eur|euse|eurs|euses)$/, "e")
    .replace(/(ment|ments)$/, "")
    .replace(/(ées|ée|és|é|es|e|s|x)$/, "");
}

export function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9àâäéèêëîïôùûüç\s'-]/gi, " ")
    .split(/[\s'-]+/)
    .map((t) => t.trim())
    .filter((t) => t.length > 1 && !STOP.has(t));
}

export function embed(text: string): number[] {
  const v = new Array<number>(EMBED_DIM).fill(0);
  const toks = tokenize(text);
  const add = (h: number, w: number) => {
    v[h % EMBED_DIM] += w;
    v[(h >> 8) % EMBED_DIM] += w * 0.4;
  };
  toks.forEach((t, i) => {
    add(fnv1a(stem(t)), 1);
    if (toks[i + 1]) add(fnv1a(stem(t) + "_" + stem(toks[i + 1])), 0.55);
  });
  const norm = Math.sqrt(v.reduce((s, x) => s + x * x, 0)) || 1;
  return v.map((x) => x / norm);
}

export function cosine(a: number[], b: number[]): number {
  let s = 0;
  for (let i = 0; i < a.length; i++) s += a[i] * b[i];
  return s;
}

// ── utilitaires ──────────────────────────────────────────────────────────────
export const clamp = (x: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, x));
export const clamp01 = (x: number) => clamp(x, 0, 1);
export const uid = () => Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-3);

export function fmtBytes(b: number): string {
  if (b < 1024) return `${b} o`;
  if (b < 1024 * 1024) return `${(b / 1024).toFixed(1).replace(".", ",")} Ko`;
  if (b < 1024 * 1024 * 1024) return `${(b / 1048576).toFixed(2).replace(".", ",")} Mo`;
  return `${(b / 1073741824).toFixed(2).replace(".", ",")} Go`;
}

export function fmtNum(n: number, d = 2): string {
  return n.toFixed(d).replace(".", ",");
}

export function trunc(s: string, n: number): string {
  return s.length > n ? s.slice(0, n - 1).trimEnd() + "…" : s;
}

export function fmtAge(ts: number, now: number): string {
  const s = Math.max(0, Math.round((now - ts) / 1000));
  if (s < 5) return "à l'instant";
  if (s < 60) return `il y a ${s} s`;
  const m = Math.floor(s / 60);
  if (m < 60) return `il y a ${m} min`;
  const h = Math.floor(m / 60);
  return `il y a ${h} h ${m % 60 ? (m % 60) + " min" : ""}`.trim();
}

export function fmtClock(ts: number): string {
  const d = new Date(ts);
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}:${String(d.getSeconds()).padStart(2, "0")}`;
}

export const valenceTone = (v: number): "pos" | "neg" | "neu" =>
  v > 0.15 ? "pos" : v < -0.15 ? "neg" : "neu";

/** Couleur d'un nœud selon sa valence (négatif → neutre → positif) */
export function valenceColor(v: number): string {
  const neg = [242, 105, 92];
  const neu = [96, 178, 161];
  const pos = [232, 176, 75];
  const mix = (a: number[], b: number[], t: number) =>
    a.map((x, i) => Math.round(x + (b[i] - x) * t));
  const c = v < 0 ? mix(neu, neg, Math.min(1, -v)) : mix(neu, pos, Math.min(1, v));
  return `rgb(${c[0]},${c[1]},${c[2]})`;
}

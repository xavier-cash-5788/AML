// ── state/hormonal_state.py + state/state_config.json ────────────────────────
// Couche COURT TERME : module comment le système réagit maintenant,
// sans toucher à la trace mémorielle (vecteur/graphe = long terme).
import type { HormoneId, HormonesState } from "./types";
import { clamp01 } from "./core";

export interface HormoneDef {
  label: string;
  role: string;
  baseline: number;
  vitesse_montee: number;
  vitesse_redescente: number;
  declencheur: string;
  conseil: string;
  couleur: string;
}

/** state_config.json */
export const HORMONES_CONFIG: Record<HormoneId, HormoneDef> = {
  adrenaline: {
    label: "Adrénaline",
    role: "réactivité, urgence, mode défense/attaque",
    baseline: 0.1,
    vitesse_montee: 0.6,
    vitesse_redescente: 0.15,
    declencheur: "valence négative forte + intensité haute",
    conseil: "sois plus vigilant, réponses plus courtes et directes",
    couleur: "#f2695c",
  },
  cortisol: {
    label: "Cortisol",
    role: "stress soutenu, méfiance, fatigue décisionnelle",
    baseline: 0.15,
    vitesse_montee: 0.2,
    vitesse_redescente: 0.03,
    declencheur: "accumulation stress répété",
    conseil: "une légère prudence de fond, vérifie avant d'affirmer",
    couleur: "#e0913f",
  },
  dopamine: {
    label: "Dopamine",
    role: "motivation, recherche de récompense, enthousiasme",
    baseline: 0.2,
    vitesse_montee: 0.4,
    vitesse_redescente: 0.2,
    declencheur: "valence positive + surprise",
    conseil: "enthousiasme spontané bienvenu, propose d'explorer",
    couleur: "#e8b04b",
  },
  serotonine: {
    label: "Sérotonine",
    role: "stabilité, calme, satisfaction de fond",
    baseline: 0.3,
    vitesse_montee: 0.05,
    vitesse_redescente: 0.02,
    declencheur: "accumulation positive long terme",
    conseil: "ton posé et stable, ni trop froid ni trop lyrique",
    couleur: "#51b5a2",
  },
  ocytocine: {
    label: "Ocytocine",
    role: "confiance, attachement, chaleur relationnelle",
    baseline: 0.2,
    vitesse_montee: 0.25,
    vitesse_redescente: 0.08,
    declencheur: "lien social + réciprocité",
    conseil: "ton chaleureux envers l'utilisateur",
    couleur: "#dd8fb2",
  },
};

export const HORMONE_IDS: HormoneId[] = ["adrenaline", "cortisol", "dopamine", "serotonine", "ocytocine"];

export function hormonesInit(): HormonesState {
  const s = {} as HormonesState;
  HORMONE_IDS.forEach((id) => (s[id] = { level: HORMONES_CONFIG[id].baseline, prev: HORMONES_CONFIG[id].baseline }));
  return s;
}

const SOCIAL_WORDS = ["ami", "amie", "amour", "aime", "famille", "ensemble", "confiance", "merci", "partage", "raconte", "confie", "lien", "coeur", "soutien", "manque", "besoin de toi", "avec toi"];
const RECIPROCITY = ["et toi", "ton avis", "tu pense", "tu crois", "pour toi", "tu aime"];

/** Score de lien social / réciprocité (déclencheur ocytocine) */
export function socialScore(texte: string): number {
  const t = texte.toLowerCase();
  let s = 0;
  SOCIAL_WORDS.forEach((w) => {
    if (t.includes(w)) s += 0.4;
  });
  RECIPROCITY.forEach((w) => {
    if (t.includes(w)) s += 0.3;
  });
  return clamp01(s);
}

/**
 * hormonal_state.update() — traduit intensité/valence en deltas hormonaux.
 * surprise = nouveauté de l'interaction (1 − meilleure similarité trouvée).
 */
export function hormonesUpdate(
  h: HormonesState,
  input: { intensite: number; valence: number; surprise: number; social: number }
): HormonesState {
  const { intensite, valence, surprise, social } = input;
  const out = { ...h };
  const up = (id: HormoneId, delta: number) => {
    out[id] = { prev: h[id].level, level: clamp01(h[id].level + delta) };
  };

  // Adrénaline : menace / conflit / surprise négative forte
  if (valence < -0.15) up("adrenaline", HORMONES_CONFIG.adrenaline.vitesse_montee * intensite * (0.5 + 0.5 * Math.abs(valence)));
  else up("adrenaline", HORMONES_CONFIG.adrenaline.vitesse_montee * 0.05 * surprise);

  // Cortisol : stress répété — monte plus si l'amygdale s'emballe déjà
  if (valence < 0) up("cortisol", HORMONES_CONFIG.cortisol.vitesse_montee * Math.abs(valence) * (0.6 + 0.4 * intensite));
  if (out.adrenaline.level > 0.5) up("cortisol", 0.06);

  // Dopamine : succès, nouveauté positive, compliment
  if (valence > 0.1) up("dopamine", HORMONES_CONFIG.dopamine.vitesse_montee * valence * (0.45 + 0.55 * surprise));

  // Sérotonine : accumulation positive lente
  if (valence > 0) up("serotonine", HORMONES_CONFIG.serotonine.vitesse_montee * valence * (0.5 + 0.5 * intensite));

  // Ocytocine : lien social + réciprocité
  if (social > 0.05) up("ocytocine", HORMONES_CONFIG.ocytocine.vitesse_montee * social * (0.6 + 0.4 * intensite));

  return out;
}

/** Tic : redescente progressive vers la baseline de chaque hormone */
export function hormonesDecay(h: HormonesState): HormonesState {
  const out = { ...h };
  HORMONE_IDS.forEach((id) => {
    const cfg = HORMONES_CONFIG[id];
    const level = h[id].level + (cfg.baseline - h[id].level) * cfg.vitesse_redescente;
    out[id] = { prev: h[id].level, level: clamp01(level) };
  });
  return out;
}

/** Ton dominant observable — injecté dans le générateur de réponses */
export function hormoneTone(h: HormonesState): string {
  if (h.adrenaline.level > 0.55) return "direct et vigilant";
  if (h.cortisol.level > 0.5) return "prudent et retenu";
  if (h.ocytocine.level > 0.55) return "chaleureux";
  if (h.dopamine.level > 0.5) return "enthousiaste";
  if (h.serotonine.level > 0.5) return "posé et stable";
  return "posé";
}

export function qualifier(level: number, baseline: number): string {
  if (level >= 0.7) return "très élevée";
  if (level >= 0.45) return "élevée";
  if (level <= Math.max(0.05, baseline - 0.12)) return "basse";
  return "modérée";
}

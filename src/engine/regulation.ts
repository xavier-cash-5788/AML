// ── regulation/ : amygdala.py · hippocampus.py · prefrontal_cortex.py ────────
// Boucle de régulation à 3 blocs : détection de menace (seuil variable),
// contextualisation des souvenirs (ou inhibition), signal de frein préfrontal.
import type { HormonesState, Regime, RegulationState, Souvenir } from "./types";
import { clamp01 } from "./core";

/** regulation_config.json */
export const REGULATION_CONFIG = {
  seuil_base: 0.6,
  facteur_sensibilisation: 0.06,
  facteur_recuperation: 0.12,
  seuil_inhibition: 0.65,
  seuil_min_prefrontal: 0.4,
  seuil_critique: 0.8,
  force_base: 0.75,
  poids_cortisol: 0.35,
  poids_adrenaline: 0.4,
  poids_oxytocine: 0.15,
  poids_serotonine: 0.12,
};

export function regulationInit(): RegulationState {
  return {
    amygdalaSeuil: REGULATION_CONFIG.seuil_base,
    amygdalaActivation: 0,
    activRecentes: 0,
    prefrontalForce: REGULATION_CONFIG.force_base,
    hippocampeInhibe: false,
    regime: "sain",
  };
}

/** amygdala.py — le seuil baisse à chaque activation rapprochée non régulée */
export function amygdalaDetect(r: RegulationState, intensite: number, valence: number): { r: RegulationState; active: boolean } {
  const menace = clamp01(intensite * Math.max(0, -valence) * 1.4);
  const active = menace >= r.amygdalaSeuil;
  let next = { ...r };
  if (active) {
    const activRecentes = r.activRecentes + 1;
    next = {
      ...next,
      activRecentes,
      amygdalaSeuil: Math.max(0.25, REGULATION_CONFIG.seuil_base - activRecentes * REGULATION_CONFIG.facteur_sensibilisation),
      amygdalaActivation: clamp01(r.amygdalaActivation + 0.35 + menace * 0.4),
    };
  } else {
    next = { ...next, amygdalaActivation: clamp01(r.amygdalaActivation + menace * 0.15) };
  }
  return { r: next, active };
}

/** prefrontal_cortex.py — force du signal de régulation */
export function prefrontalForce(horm: HormonesState, r: RegulationState): number {
  let force =
    REGULATION_CONFIG.force_base -
    horm.cortisol.level * REGULATION_CONFIG.poids_cortisol -
    horm.adrenaline.level * REGULATION_CONFIG.poids_adrenaline +
    horm.ocytocine.level * REGULATION_CONFIG.poids_oxytocine +
    horm.serotonine.level * REGULATION_CONFIG.poids_serotonine;
  // écrasé si l'activation amygdalienne dépasse le seuil critique
  if (r.amygdalaActivation > REGULATION_CONFIG.seuil_critique) force *= 0.3;
  return clamp01(force);
}

/** hippocampus.py — contextualise le souvenir… sauf si l'amygdale écrase le frein */
export function hippocampusContextualiser(amygdalaActivation: number, forcePrefrontale: number): "contextualise" | "non_resolu" {
  if (amygdalaActivation > REGULATION_CONFIG.seuil_inhibition && forcePrefrontale < REGULATION_CONFIG.seuil_min_prefrontal) {
    return "non_resolu"; // pas daté, pas de decay normal, rejouable intact
  }
  return "contextualise";
}

export function computeRegime(r: RegulationState, nonResolus: number): Regime {
  if (nonResolus >= 2 && r.prefrontalForce < 0.45) return "traumatique";
  if (r.activRecentes >= 2 || r.amygdalaActivation > 0.5 || nonResolus >= 1) return "tendu";
  return "sain";
}

/**
 * Tic de régulation : l'activation redescend, le seuil remonte si le préfrontal
 * tient, et la force préfrontale se restaure avec les interactions positives.
 */
export function regulationTick(r: RegulationState, valenceMoyenne: number, nonResolus: number): RegulationState {
  const recup = valenceMoyenne > 0 ? 0.03 + 0.05 * valenceMoyenne : 0.008;
  let force = clamp01(r.prefrontalForce + recup);
  let seuil = r.amygdalaSeuil;
  if (force > 0.5) {
    seuil = Math.min(REGULATION_CONFIG.seuil_base, seuil + REGULATION_CONFIG.facteur_recuperation * force * 0.25);
  }
  const activRecentes = Math.max(0, r.activRecentes - (valenceMoyenne > 0 ? 0.6 : 0.2));
  const activation = clamp01(r.amygdalaActivation * 0.72);
  const next: RegulationState = {
    amygdalaSeuil: seuil,
    amygdalaActivation: activation,
    activRecentes,
    prefrontalForce: force,
    hippocampeInhibe: activation > REGULATION_CONFIG.seuil_inhibition && force < REGULATION_CONFIG.seuil_min_prefrontal,
    regime: "sain",
  };
  next.regime = computeRegime(next, nonResolus);
  return next;
}

/** Reconsolidation « thérapeutique » : le préfrontal restauré re-contextualise */
export function reconsolidable(r: RegulationState, valenceMoyenne: number): boolean {
  return r.prefrontalForce > 0.55 && valenceMoyenne > 0.05;
}

export function oldestUnresolved(memories: Souvenir[]): Souvenir | null {
  const nr = memories.filter((m) => m.statut === "non_resolu").sort((a, b) => a.creeLe - b.creeLe);
  return nr[0] ?? null;
}

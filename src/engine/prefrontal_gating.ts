/**
 * Prefrontal Gating Mechanism (Filtre d'Inhibition)
 * Décide quelles actions/habitudes sont autorisées ou inhibées avant l'exécution.
 */

import { SystemState, HabitAction } from './types';
import { rpeEngine } from './rpe_engine';

export interface GatingDecision {
  allowed: boolean;
  reason: string;
  forcedConstraint?: string; // Contrainte à injecter dans le prompt
  shortcutAllowed: boolean; // Si on peut bypasser la recherche vectorielle
}

export class PrefrontalCortex {
  /**
   * Évalue une habitude candidate avant exécution
   */
  public evaluateHabit(habit: HabitAction, state: SystemState): GatingDecision {
    const qValue = habit.qValue || 0;
    const rpePrediction = rpeEngine.shouldInhibitConfidence();

    // Cas 1 : Habitude fortement punie historiquement (Q < 0)
    if (qValue < -0.2) {
      return {
        allowed: false,
        reason: `Habitude inhibée (Q=${qValue.toFixed(2)} < 0)`,
        forcedConstraint: "Évite absolument les réponses spéculatives ou les faux souvenirs. Reste factuel et prudent.",
        shortcutAllowed: false
      };
    }

    // Cas 2 : Contexte global à risque (Prédiction RPE négative)
    if (rpePrediction) {
      return {
        allowed: true, // On laisse passer mais avec prudence
        reason: "Contexte risqué détecté, activation du mode prudent",
        forcedConstraint: "L'utilisateur semble mécontent ou sceptique. Vérifie tes faits avant de répondre. Ne tente pas d'humour ou de familiarité excessive.",
        shortcutAllowed: false
      };
    }

    // Cas 3 : Habitude très forte et contexte sûr (Q > 0.8)
    if (qValue > 0.8 && !rpePrediction) {
      return {
        allowed: true,
        reason: `Habitude experte confirmée (Q=${qValue.toFixed(2)})`,
        shortcutAllowed: true // Bypass recherche vectorielle lourde
      };
    }

    // Cas par défaut : Autorisation normale
    return {
      allowed: true,
      reason: "Aucune inhibition nécessaire",
      shortcutAllowed: false
    };
  }

  /**
   * Génère les contraintes système dynamiques à injecter dans le Prompt Builder
   * en fonction de l'état actuel du PFC.
   */
  public generateSystemConstraints(state: SystemState): string[] {
    const constraints: string[] = [];
    
    // Si le RPE prédit un échec
    if (rpeEngine.shouldInhibitConfidence()) {
      constraints.push("ATTENTION : Le contexte suggère une réaction négative de l'utilisateur. Sois extrêmement prudent sur tes affirmations.");
    }

    // Si une habitude spécifique vient d'être inhibée (logique externe à ajouter si besoin)
    // ...

    return constraints;
  }
}

export const prefrontalCortex = new PrefrontalCortex();

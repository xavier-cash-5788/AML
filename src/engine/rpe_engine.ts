/**
 * RPE Engine (Reward Prediction Error)
 * Calcule l'écart entre la valence attendue et la valence réelle pour moduler l'apprentissage.
 */

import { SystemState, HabitAction } from './types';

export class RPEEngine {
  private predictedValence: number = 0.0;
  private lastContextHash: string = '';

  /**
   * Étape 1 : Prédire la valence avant la réponse
   * Basé sur l'historique récent et l'état émotionnel global de l'utilisateur
   */
  public predict(state: SystemState): number {
    const tom = state.userMentalState;
    
    // Facteurs de prédiction simples mais efficaces
    let prediction = 0.0;

    // 1. Biais de l'humeur de fond (si l'utilisateur est globalement heureux, on s'attend à du positif)
    prediction += tom.globalMood.valence * 0.4;

    // 2. Biais de l'intention (si l'utilisateur cherche du support, une réponse empathique devrait être bien reçue)
    if (tom.currentIntent === 'seeking_support' || tom.currentIntent === 'venting') {
      prediction += 0.3; 
    } else if (tom.currentIntent === 'testing' || tom.currentIntent === 'problem_solving') {
      // Plus incertain, dépend de la compétence perçue
      prediction += 0.1;
    }

    // 3. Historique récent (moyenne mobile des 3 dernières interactions si disponible)
    // Simplifié ici par un lissage de la prédiction précédente
    prediction = (prediction + this.predictedValence) / 2;

    // Clamp entre -1 et 1
    this.predictedValence = Math.max(-1, Math.min(1, prediction));
    return this.predictedValence;
  }

  /**
   * Étape 2 : Calculer l'erreur de prédiction après feedback
   * @param actualValence La valence réellement détectée après la réponse de l'IA
   * @returns Le signal RPE (Reward Prediction Error)
   */
  public computeError(actualValence: number): number {
    const rpe = actualValence - this.predictedValence;
    
    // Reset partiel pour la prochaine itération (oubli de la prédiction spécifique)
    // On garde une trace pour la stabilité, mais on réduit l'influence
    this.predictedValence = this.predictedValence * 0.7 + actualValence * 0.3;

    return rpe;
  }

  /**
   * Applique les effets du RPE sur l'apprentissage
   * Retourne un multiplicateur pour les mises à jour Hebbiennes et Q-Learning
   */
  public getLearningMultiplier(rpe: number): number {
    if (rpe > 0.1) {
      // Surprise positive : Apprentissage accéléré (Boost Dopamine)
      // Ex: RPE de 0.5 -> Multiplicateur de 1.5
      return 1 + (rpe * 2); 
    } else if (rpe < -0.1) {
      // Surprise négative : Punition forte (Dopamine Dip)
      // Ex: RPE de -0.5 -> Multiplicateur de -1.5 (inversion et amplification de la pénalité)
      return -1 - (Math.abs(rpe) * 2);
    }
    // Résultat attendu : Apprentissage normal
    return 1.0;
  }

  /**
   * Détermine si une inhibition préfrontale est nécessaire
   * Si la prédiction de succès est très faible, on prépare le système à inhiber.
   */
  public shouldInhibitConfidence(): boolean {
    return this.predictedValence < -0.3;
  }
}

export const rpeEngine = new RPEEngine();

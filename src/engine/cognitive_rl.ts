/**
 * Cognitive RL Module
 * Implémente l'apprentissage par renforcement cognitif :
 * - Hebbian Learning sur le graphe
 * - Q-Learning pour les habitudes
 * - Exploration vs Exploitation (epsilon-greedy)
 */

import { SystemState, HabitAction, TraitNode } from './types';

export interface RLState {
  epsilon: number; // Taux d'exploration (0..1)
  alpha: number; // Taux d'apprentissage
  gamma: number; // Facteur de discount
  lastAction: string | null;
  lastReward: number;
  explorationCount: number;
  exploitationCount: number;
}

export interface ActionSelection {
  actionType: 'habit' | 'rag' | 'spontaneous';
  actionId?: string;
  isExploration: boolean;
  confidence: number;
}

const DEFAULT_RL_STATE: RLState = {
  epsilon: 0.15, // 15% d'exploration au départ
  alpha: 0.1,    // Taux d'apprentissage modéré
  gamma: 0.9,    // Importance des récompenses futures
  lastAction: null,
  lastReward: 0,
  explorationCount: 0,
  exploitationCount: 0
};

export class CognitiveRL {
  private state: RLState;

  constructor() {
    this.state = { ...DEFAULT_RL_STATE };
  }

  getState(): RLState {
    return { ...this.state };
  }

  reset() {
    this.state = { ...DEFAULT_RL_STATE };
  }

  /**
   * Sélectionne une action selon la stratégie epsilon-greedy
   * @param habits Liste des habitudes disponibles
   * @param contextScore Score de pertinence du contexte RAG
   */
  public selectAction(habits: HabitAction[], contextScore: number): ActionSelection {
    const { epsilon, alpha, gamma } = this.state;

    // Trouver la meilleure habitude selon Q-value
    const bestHabit = habits.length > 0 
      ? habits.reduce((max, h) => (h.qValue > max.qValue ? h : max))
      : null;

    const habitQ = bestHabit?.qValue || 0;
    const ragQ = contextScore; // Le score RAG sert de Q-value implicite

    // Décision epsilon-greedy
    const random = Math.random();
    let isExploration = false;
    let selectedAction: ActionSelection;

    if (random < epsilon) {
      // EXPLORATION : Choisir une option aléatoire ou variée
      isExploration = true;
      this.state.explorationCount++;
      
      // Choix aléatoire entre habitude (même faible) et RAG
      const choices: Array<{ type: 'habit' | 'rag'; id?: string; score: number }> = [];
      
      if (habits.length > 0) {
        // Sélectionner une habitude aléatoire (pas forcément la meilleure)
        const randomHabit = habits[Math.floor(Math.random() * habits.length)];
        choices.push({ type: 'habit', id: randomHabit.id, score: randomHabit.qValue });
      }
      
      choices.push({ type: 'rag', score: ragQ });
      
      const choice = choices[Math.floor(Math.random() * choices.length)];
      
      selectedAction = {
        actionType: choice.type,
        actionId: choice.id,
        isExploration: true,
        confidence: choice.score
      };
    } else {
      // EXPLOITATION : Choisir la meilleure option connue
      isExploration = false;
      this.state.exploitationCount++;

      if (habitQ > ragQ && habitQ > 0.3) {
        // L'habitude est meilleure que le RAG
        selectedAction = {
          actionType: 'habit',
          actionId: bestHabit!.id,
          isExploration: false,
          confidence: habitQ
        };
      } else {
        // Le RAG est meilleur ou aucune habitude fiable
        selectedAction = {
          actionType: 'rag',
          isExploration: false,
          confidence: ragQ
        };
      }
    }

    this.state.lastAction = `${selectedAction.actionType}:${selectedAction.actionId || 'rag'}`;
    
    return selectedAction;
  }

  /**
   * Met à jour les Q-values basé sur la récompense reçue
   * Formule: Q(s,a) ← Q(s,a) + α × (R - Q(s,a))
   */
  public updateQValue(
    actionType: 'habit' | 'rag',
    actionId: string | undefined,
    reward: number,
    habits: HabitAction[]
  ): void {
    const { alpha, gamma } = this.state;
    this.state.lastReward = reward;

    if (actionType === 'habit' && actionId) {
      // Mise à jour Q-Learning pour l'habitude
      const habit = habits.find(h => h.id === actionId);
      if (habit) {
        const oldQ = habit.qValue || 0;
        const newQ = oldQ + alpha * (reward - oldQ);
        habit.qValue = Math.max(-1, Math.min(1, newQ)); // Clamp [-1, 1]
        
        console.log(`[RL-Q] Habitude ${actionId}: Q=${oldQ.toFixed(3)} → ${newQ.toFixed(3)} (R=${reward})`);
      }
    } else if (actionType === 'rag') {
      // Pour le RAG, on ajuste implicitement via le système de poids
      // Stocké dans lastReward pour utilisation par Hebbian learning
      console.log(`[RL-Q] RAG reward: ${reward}`);
    }

    // Ajustement dynamique de epsilon (décroissance lente vers plus d'exploitation)
    if (reward > 0.5) {
      // Succès : on réduit légèrement epsilon pour stabiliser
      this.state.epsilon = Math.max(0.05, this.state.epsilon * 0.99);
    } else if (reward < -0.3) {
      // Échec : on augmente epsilon pour explorer d'autres options
      this.state.epsilon = Math.min(0.3, this.state.epsilon * 1.1);
    }
  }

  /**
   * Calcule le facteur d'apprentissage Hebbien basé sur la récompense
   * Utilisé pour renforcer/affaiblir les connexions du graphe
   */
  public getHebbianFactor(reward: number): number {
    if (reward > 0.2) {
      // Renforcement positif : consolidation des liens actifs
      return 1 + (reward * 0.5); // Jusqu'à +50% de renforcement
    } else if (reward < -0.2) {
      // Punition négative : accélération du decay
      return -1 - (Math.abs(reward) * 0.5); // Jusqu'à -50% de pénalité
    }
    return 1.0; // Neutre
  }

  /**
   * Active les zones cérébrales appropriées selon le mode RL
   */
  public activateBrainZones(action: ActionSelection, reward: number): Array<'prefrontal' | 'striatum' | 'hippocampus'> {
    const zones: Array<'prefrontal' | 'striatum' | 'hippocampus'> = [];

    // Préfrontal : toujours actif pour le contrôle exécutif
    zones.push('prefrontal');

    if (action.isExploration) {
      // Exploration demande plus de contrôle préfrontal
      zones.push('prefrontal');
    } else {
      // Exploitation active le striatum (habitudes)
      if (action.actionType === 'habit') {
        zones.push('striatum');
      }
    }

    if (Math.abs(reward) > 0.3) {
      // Récompense significative active l'hippocampe pour consolidation
      zones.push('hippocampus');
    }

    return zones;
  }
}

export const cognitiveRL = new CognitiveRL();

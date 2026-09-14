#!/usr/bin/env python3
"""
Lance un cycle de neuro-évolution des hyperparamètres du système.

La neuro-évolution n'évolue PAS les poids d'un réseau de neurones (trop coûteux et
inadapté à l'échelle d'un seul utilisateur), mais LES HYPERPARAMÈTRES du système:
taux de decay, seuils de régulation, taux d'apprentissage RL, etc.

Chaque "individu" est un vecteur d'hyperparamètres. La fitness est calculée à partir
du feedback utilisateur accumulé (👍 = +1, 👎 = -1) sur les réponses générées avec
ces hyperparamètres.

Usage:
    python scripts/run_evolution_cycle.py [--population-size 20] [--generations 10]
"""

import argparse
import json
import sys
from pathlib import Path
from datetime import datetime

sys.path.insert(0, str(Path(__file__).parent.parent))

from nyx.learning.evolution import NeuroEvolution, EVOLUTION_CONFIG


def load_feedback_history(data_dir: Path) -> list[dict]:
    """Charge l'historique de feedback depuis feedback_log.json."""
    feedback_file = data_dir / "feedback_log.json"
    if not feedback_file.exists():
        print(f"[WARN] {feedback_file} n'existe pas.")
        return []
    
    with open(feedback_file, "r", encoding="utf-8") as f:
        data = json.load(f)
    
    print(f"[INFO] {len(data)} entrées de feedback chargées.")
    return data


def calculate_fitness_for_individual(individual_idx: int, 
                                      feedback_history: list[dict],
                                      generation_start: str,
                                      evolution_engine: NeuroEvolution) -> float:
    """
    Calcule la fitness d'un individu basée sur le feedback reçu pendant sa période d'utilisation.
    
    Chaque individu est associé à une période temporelle. On somme les rewards
    (👍=+1, 👎=-1) reçus pendant cette période.
    """
    # Pour la première version simplifiée: on utilise le feedback global
    # et on le pondère par la similarité avec les configurations passées
    # Ici, version simple: fitness moyenne du feedback récent
    
    recent_feedback = [
        f for f in feedback_history
        if f.get("timestamp", "") >= generation_start
    ]
    
    if len(recent_feedback) == 0:
        # Pas de feedback pour cette génération → fitness neutre
        return 0.5  # Valeur par défaut
    
    total_reward = 0
    for fb in recent_feedback:
        reward = fb.get("reward", 0)
        total_reward += reward
    
    avg_reward = total_reward / len(recent_feedback)
    # Normalisation: reward moyen entre -1 et +1 → fitness entre 0 et 1
    fitness = (avg_reward + 1) / 2
    return max(0.0, min(1.0, fitness))


def main():
    parser = argparse.ArgumentParser(description="Lancer un cycle de neuro-évolution")
    parser.add_argument("--population-size", type=int, default=EVOLUTION_CONFIG["population_size"],
                        help=f"Taille de la population (défaut: {EVOLUTION_CONFIG['population_size']})")
    parser.add_argument("--generations", type=int, default=EVOLUTION_CONFIG["generations_per_cycle"],
                        help=f"Générations par cycle (défaut: {EVOLUTION_CONFIG['generations_per_cycle']})")
    parser.add_argument("--mutation-rate", type=float, default=EVOLUTION_CONFIG["mutation_rate"],
                        help=f"Taux de mutation (défaut: {EVOLUTION_CONFIG['mutation_rate']})")
    parser.add_argument("--elitism-count", type=int, default=EVOLUTION_CONFIG["elitism_count"],
                        help=f"Nombre d'élites conservées (défaut: {EVOLUTION_CONFIG['elitism_count']})")
    parser.add_argument("--load-existing", action="store_true",
                        help="Charger la population existante depuis population.json")
    
    args = parser.parse_args()
    
    # Chemins
    project_root = Path(__file__).parent.parent
    data_dir = project_root / "data"
    evolution_dir = data_dir / "evolution"
    evolution_dir.mkdir(parents=True, exist_ok=True)
    
    population_file = evolution_dir / "population.json"
    generations_log_file = evolution_dir / "generations_log.json"
    
    # Chargement du feedback
    feedback_history = load_feedback_history(data_dir)
    if len(feedback_history) == 0:
        print("[WARN] Aucun feedback disponible. La fitness sera basée sur des valeurs par défaut.")
        print("[INFO] Interagissez avec Nyx et utilisez les boutons 👍/👎 pour améliorer l'évolution.")
    
    # Initialisation de l'engine d'évolution
    print("\n[INFO] Initialisation de la neuro-évolution...")
    evolution_engine = NeuroEvolution(
        param_space={},  # Utilise le param space par défaut de la classe
        population_size=args.population_size,
        generations=args.generations,
        mutation_rate=args.mutation_rate,
        elitism_count=args.elitism_count
    )
    
    # Chargement ou création de la population
    if args.load_existing and population_file.exists():
        print(f"[INFO] Chargement de la population depuis {population_file}")
        with open(population_file, "r", encoding="utf-8") as f:
            saved_pop = json.load(f)
        evolution_engine.population = saved_pop.get("individuals", [])
        evolution_engine.current_generation = saved_pop.get("generation", 0)
        print(f"[INFO] Population chargée: génération {evolution_engine.current_generation}")
    else:
        if args.load_existing:
            print(f"[WARN] {population_file} n'existe pas. Création d'une nouvelle population.")
        print("[INFO] Création d'une nouvelle population aléatoire...")
        evolution_engine.initialize_population()
    
    # Affichage de la population initiale
    print(f"\n[INFO] Population actuelle: {len(evolution_engine.population)} individus")
    if len(evolution_engine.population) > 0:
        print("[INFO] Premier individu (exemple):")
        first_indiv = evolution_engine.population[0]
        for key, val in list(first_indiv["params"].items())[:5]:
            print(f"  {key}: {val}")
        if len(first_indiv["params"]) > 5:
            print(f"  ... et {len(first_indiv['params']) - 5} autres paramètres")
    
    # Lancement de l'évolution
    generation_start = datetime.now().isoformat()
    print(f"\n[INFO] Démarrage de l'évolution ({args.generations} générations)...")
    print(f"{'='*60}")
    
    best_individual = None
    best_fitness = -float("inf")
    
    for gen_idx in range(args.generations):
        # Calcul des fitness
        fitnesses = []
        for i, individual in enumerate(evolution_engine.population):
            # Pour cette version simplifiée, on simule une fitness
            # Dans une version future, il faudrait tester chaque config en conditions réelles
            fitness = calculate_fitness_for_individual(
                i, feedback_history, generation_start, evolution_engine
            )
            fitnesses.append(fitness)
            
            if fitness > best_fitness:
                best_fitness = fitness
                best_individual = individual
        
        # Affichage génération
        avg_fitness = sum(fitnesses) / len(fitnesses) if fitnesses else 0
        max_fitness = max(fitnesses) if fitnesses else 0
        min_fitness = min(fitnesses) if fitnesses else 0
        
        print(f"Génération {evolution_engine.current_generation + 1:3d}: "
              f"Fitness avg={avg_fitness:.3f}, min={min_fitness:.3f}, max={max_fitness:.3f}")
        
        # Évolution vers la prochaine génération
        evolution_engine.next_generation(fitnesses)
    
    print(f"{'='*60}")
    
    # Sauvegarde de la population finale
    population_data = {
        "generation": evolution_engine.current_generation,
        "individuals": evolution_engine.population,
        "best_params": best_individual["params"] if best_individual else {},
        "best_fitness": best_fitness,
        "timestamp": datetime.now().isoformat()
    }
    
    with open(population_file, "w", encoding="utf-8") as f:
        json.dump(population_data, f, indent=2, ensure_ascii=False)
    print(f"\n[INFO] Population sauvegardée dans {population_file}")
    
    # Log de la génération
    gen_log_entry = {
        "generation": evolution_engine.current_generation,
        "best_fitness": best_fitness,
        "best_params": best_individual["params"] if best_individual else {},
        "population_size": len(evolution_engine.population),
        "timestamp": datetime.now().isoformat()
    }
    
    generations_log = []
    if generations_log_file.exists():
        with open(generations_log_file, "r", encoding="utf-8") as f:
            generations_log = json.load(f)
    
    generations_log.append(gen_log_entry)
    
    with open(generations_log_file, "w", encoding="utf-8") as f:
        json.dump(generations_log, f, indent=2, ensure_ascii=False)
    print(f"[INFO] Log de génération sauvegardé dans {generations_log_file}")
    
    # Rapport final
    print(f"\n{'='*60}")
    print(f"RAPPORT DE NEURO-ÉVOLUTION")
    print(f"{'='*60}")
    print(f"Génération finale:        {evolution_engine.current_generation}")
    print(f"Taille population:        {len(evolution_engine.population)}")
    print(f"Meilleure fitness:        {best_fitness:.4f}")
    print(f"\nMeilleurs hyperparamètres:")
    if best_individual:
        for key, val in sorted(best_individual["params"].items()):
            print(f"  {key}: {val}")
    else:
        print("  (aucun)")
    print(f"{'='*60}")
    
    # Application recommandée
    print(f"\n[INFO] Pour appliquer ces hyperparamètres:")
    print(f"  1. Copiez les valeurs ci-dessus dans config/user_config.json")
    print(f"  2. Redémarrez Nyx pour qu'il utilise la nouvelle configuration")
    print(f"\n[INFO] Cycle de neuro-évolution terminé.")


if __name__ == "__main__":
    main()

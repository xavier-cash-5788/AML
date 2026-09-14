#!/usr/bin/env python3
"""
NyX — Scripts utilitaires

Ce dossier contient des scripts exécutés à la demande pour:
- Entraîner les modèles (auto-encodeur, classifieur)
- Lancer des cycles de neuro-évolution
- Exporter/migrer des données
- Réinitialiser la mémoire

Usage général:
    python scripts/<nom_du_script>.py --help

Scripts disponibles:
-------------------
1. train_autoencoder.py
   Entraîne l'auto-encodeur de compression sur les souvenirs existants.
   → Utilise: data/memories/vector_memory.json
   → Produit: data/autoencoder/weights.npz
   
   Exemple:
   python scripts/train_autoencoder.py --dimensions 128 --epochs 100

2. train_classifier.py
   Entraîne le classifieur émotionnel sur les données de feedback.
   → Utilise: data/emotion/training_data.json
   → Produit: data/emotion/classifier_weights.npz
   
   Exemple:
   python scripts/train_classifier.py --model-type mlp --epochs 50

3. run_evolution_cycle.py
   Lance un cycle de neuro-évolution des hyperparamètres.
   → Utilise: data/feedback_log.json
   → Produit: data/evolution/population.json
   
   Exemple:
   python scripts/run_evolution_cycle.py --population-size 20 --generations 10

4. export_journal.py
   Exporte le journal d'événements en rapport lisible (Markdown ou JSON).
   → Utilise: data/events_log.jsonl
   → Produit: rapport_evenements_YYYYMMDD_HHMMSS.md (ou .json)
   
   Exemple:
   python scripts/export_journal.py --format markdown

5. reset_memory.py
   Réinitialise tout ou partie de la mémoire de Nyx.
   ⚠️ DESTRUCTIF - Confirmation requise
   
   Exemple:
   python scripts/reset_memory.py --memories --emotion
   python scripts/reset_memory.py --all --force

6. migrate_v1_to_v2.py
   Migre les données depuis Mnémosyne v1 (prototype TypeScript).
   → Utilise: ancien répertoire de données v1
   → Produit: data/ (structure v2)
   
   Exemple:
   python scripts/migrate_v1_to_v2.py --input ../mnemosyne-v1/data --dry-run

---

Tous les scripts supportent l'option --help pour afficher l'aide détaillée.

"""

import subprocess
import sys
from pathlib import Path


def list_scripts():
    """Liste les scripts disponibles avec une brève description."""
    scripts_dir = Path(__file__).parent
    scripts = sorted(scripts_dir.glob("*.py"))
    
    print("\n" + "="*60)
    print("SCRIPTS NYX DISPONIBLES")
    print("="*60 + "\n")
    
    descriptions = {
        "train_autoencoder.py": "Entraîne l'auto-encodeur de compression",
        "train_classifier.py": "Entraîne le classifieur émotionnel",
        "run_evolution_cycle.py": "Lance un cycle de neuro-évolution",
        "export_journal.py": "Exporte le journal en rapport lisible",
        "reset_memory.py": "Réinitialise la mémoire (DESTRUCTIF)",
        "migrate_v1_to_v2.py": "Migre depuis Mnémosyne v1",
    }
    
    for script in scripts:
        if script.name == "__init__.py" or script.name == Path(__file__).name:
            continue
        
        desc = descriptions.get(script.name, "")
        print(f"  • {script.name:<25} {desc}")
    
    print("\n" + "="*60)
    print("\nPour plus d'informations sur un script:")
    print(f"  python scripts/<script>.py --help\n")


def main():
    if len(sys.argv) < 2:
        list_scripts()
        return
    
    command = sys.argv[1]
    
    if command == "--list" or command == "-l":
        list_scripts()
        return
    
    if command == "--help" or command == "-h":
        list_scripts()
        print("Utilisation:")
        print("  python scripts/run.py                 # Affiche cette aide")
        print("  python scripts/run.py --list          # Liste les scripts")
        print("  python scripts/run.py <script> [args] # Lance un script")
        print("\nExemples:")
        print("  python scripts/run.py train_autoencoder --epochs 100")
        print("  python scripts/run.py reset_memory --memories")
        return
    
    # Lancement du script demandé
    script_path = Path(__file__).parent / f"{command}.py"
    if not script_path.exists():
        # Essaye sans le suffixe .py
        script_path = Path(__file__).parent / command
        if not script_path.exists():
            print(f"[ERREUR] Script '{command}' non trouvé.")
            print("\nScripts disponibles:")
            list_scripts()
            sys.exit(1)
    
    args = [sys.executable, str(script_path)] + sys.argv[2:]
    
    try:
        subprocess.run(args, check=True)
    except subprocess.CalledProcessError as e:
        print(f"\n[ERREUR] Le script s'est terminé avec l'erreur {e.returncode}")
        sys.exit(e.returncode)
    except KeyboardInterrupt:
        print("\n[INFO] Interruption par l'utilisateur.")
        sys.exit(130)


if __name__ == "__main__":
    main()

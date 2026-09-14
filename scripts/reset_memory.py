#!/usr/bin/env python3
"""
Réinitialise complètement ou partiellement la mémoire de Nyx.

ATTENTION: Ce script est DESTRUCTIF. Il supprime des données de manière irréversible.
Une confirmation explicite est demandée avant toute suppression.

Options:
- --all: Reset complet (toutes les données)
- --memories: Uniquement les souvenirs (vectoriels + archive)
- --graph: Uniquement le graphe de traits
- --semantic: Uniquement la mémoire sémantique
- --habits: Uniquement les habitudes/patterns
- --learning: Uniquement les données d'apprentissage (RL, feedback, évolution)
- --emotion: Uniquement les données émotionnelles (classifieur, training data)
- --keep-config: Préserve la configuration (défaut: true)

Usage:
    python scripts/reset_memory.py --all              # Reset total
    python scripts/reset_memory.py --memories         # Reset souvenirs seulement
    python scripts/reset_memory.py --learning         # Reset apprentissage seulement
"""

import argparse
import json
import sys
from pathlib import Path
from datetime import datetime


def confirm_action(message: str) -> bool:
    """Demande une confirmation explicite à l'utilisateur."""
    print(f"\n⚠️  {message}")
    response = input("Tapez 'OUI' pour confirmer: ").strip().upper()
    return response == "OUI"


def reset_file(file_path: Path, keep_structure: bool = True) -> None:
    """Réinitialise un fichier JSON ou JSONL."""
    if not file_path.exists():
        print(f"[INFO] {file_path.name} n'existe pas, ignoré.")
        return
    
    if keep_structure:
        # Garde la structure (liste vide ou objet vide)
        try:
            with open(file_path, "r", encoding="utf-8") as f:
                content = f.read().strip()
                if content.startswith("["):
                    data = []
                else:
                    data = {}
        except (json.JSONDecodeError, UnicodeDecodeError):
            data = {}
        
        with open(file_path, "w", encoding="utf-8") as f:
            json.dump(data, f, indent=2, ensure_ascii=False)
    else:
        # Fichier vide
        file_path.write_text("")
    
    print(f"[INFO] {file_path.name} réinitialisé.")


def reset_directory(dir_path: Path) -> None:
    """Supprime tous les fichiers d'un répertoire."""
    if not dir_path.exists():
        print(f"[INFO] {dir_path.name} n'existe pas, ignoré.")
        return
    
    for file_path in dir_path.iterdir():
        if file_path.is_file():
            file_path.unlink()
            print(f"[INFO] Supprimé: {file_path.name}")
        elif file_path.is_dir():
            reset_directory(file_path)
    
    print(f"[INFO] Répertoire {dir_path.name} vidé.")


def backup_data(data_dir: Path, backup_dir: Path) -> None:
    """Crée une sauvegarde des données avant reset."""
    if not data_dir.exists():
        return
    
    backup_dir.mkdir(parents=True, exist_ok=True)
    timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
    
    for file_path in data_dir.rglob("*"):
        if file_path.is_file():
            rel_path = file_path.relative_to(data_dir)
            dest_path = backup_dir / timestamp / rel_path
            dest_path.parent.mkdir(parents=True, exist_ok=True)
            
            # Copie simple
            dest_path.write_bytes(file_path.read_bytes())
    
    print(f"[INFO] Sauvegarde créée dans {backup_dir / timestamp}")


def main():
    parser = argparse.ArgumentParser(description="Réinitialiser la mémoire de Nyx")
    parser.add_argument("--all", action="store_true",
                        help="Reset complet de toutes les données")
    parser.add_argument("--memories", action="store_true",
                        help="Reset des souvenirs (vectoriels + archive)")
    parser.add_argument("--graph", action="store_true",
                        help="Reset du graphe de traits")
    parser.add_argument("--semantic", action="store_true",
                        help="Reset de la mémoire sémantique")
    parser.add_argument("--habits", action="store_true",
                        help="Reset des habitudes/patterns")
    parser.add_argument("--learning", action="store_true",
                        help="Reset des données d'apprentissage (RL, feedback, évolution)")
    parser.add_argument("--emotion", action="store_true",
                        help="Reset des données émotionnelles")
    parser.add_argument("--chat", action="store_true",
                        help="Reset de l'historique de conversation")
    parser.add_argument("--logs", action="store_true",
                        help="Reset des logs d'événements")
    parser.add_argument("--no-backup", action="store_true",
                        help="Ne crée pas de sauvegarde avant reset")
    parser.add_argument("--force", action="store_true",
                        help="Ignore la confirmation (DANGEREUX)")
    
    args = parser.parse_args()
    
    # Vérification qu'au moins une option est fournie
    reset_options = [
        args.all, args.memories, args.graph, args.semantic,
        args.habits, args.learning, args.emotion, args.chat, args.logs
    ]
    
    if not any(reset_options):
        print("[ERREUR] Aucune option de reset spécifiée.")
        print("\nOptions disponibles:")
        print("  --all       Reset complet")
        print("  --memories  Souvenirs uniquement")
        print("  --graph     Graphe de traits uniquement")
        print("  --semantic  Mémoire sémantique uniquement")
        print("  --habits    Habitudes uniquement")
        print("  --learning  Données d'apprentissage uniquement")
        print("  --emotion   Données émotionnelles uniquement")
        print("  --chat      Historique de conversation uniquement")
        print("  --logs      Logs d'événements uniquement")
        print("\nExemple: python scripts/reset_memory.py --memories --emotion")
        sys.exit(1)
    
    # Chemins
    project_root = Path(__file__).parent.parent
    data_dir = project_root / "data"
    backup_dir = project_root / "data_backups"
    
    if not data_dir.exists():
        print(f"[ERREUR] Le répertoire {data_dir} n'existe pas.")
        sys.exit(1)
    
    # Détermination des cibles de reset
    targets = {
        "memories": args.all or args.memories,
        "graph": args.all or args.graph,
        "semantic": args.all or args.semantic,
        "habits": args.all or args.habits,
        "learning": args.all or args.learning,
        "emotion": args.all or args.emotion,
        "chat": args.all or args.chat,
        "logs": args.all or args.logs,
    }
    
    # Affichage des cibles
    print("\n📋 Cibles de réinitialisation:")
    for target, active in targets.items():
        if active:
            print(f"  ✓ {target}")
    
    # Confirmation
    if not args.force:
        if not confirm_action("Cette opération est IRREVERSIBLE. Toutes les données ciblées seront perdues."):
            print("\n[INFO] Opération annulée par l'utilisateur.")
            sys.exit(0)
    
    # Sauvegarde
    if not args.no_backup:
        print("\n[INFO] Création d'une sauvegarde...")
        backup_data(data_dir, backup_dir)
    
    # Exécution des resets
    print("\n[INFO] Démarrage de la réinitialisation...")
    
    if targets["memories"]:
        print("\n--- Mémoires ---")
        reset_file(data_dir / "memories" / "vector_memory.json")
        reset_file(data_dir / "memories" / "archive.json")
    
    if targets["graph"]:
        print("\n--- Graphe de traits ---")
        reset_file(data_dir / "graph" / "nodes.json")
        reset_file(data_dir / "graph" / "edges.json")
    
    if targets["semantic"]:
        print("\n--- Mémoire sémantique ---")
        reset_file(data_dir / "semantic" / "facts.json")
        reset_file(data_dir / "semantic" / "associations.json")
    
    if targets["habits"]:
        print("\n--- Habitudes ---")
        reset_file(data_dir / "habits" / "patterns.json")
    
    if targets["learning"]:
        print("\n--- Apprentissage ---")
        reset_file(data_dir / "rl_state.json")
        reset_file(data_dir / "feedback_log.json")
        reset_file(data_dir / "prediction_history.json")
        reset_directory(data_dir / "evolution")
    
    if targets["emotion"]:
        print("\n--- Émotion ---")
        reset_file(data_dir / "emotion" / "training_data.json")
        # Ne pas supprimer les poids du classifieur automatiquement
    
    if targets["chat"]:
        print("\n--- Historique de conversation ---")
        reset_file(data_dir / "chat_history.json")
    
    if targets["logs"]:
        print("\n--- Logs d'événements ---")
        reset_file(data_dir / "events_log.jsonl", keep_structure=False)
    
    # Réinitialisation des états
    if args.all or args.learning or args.emotion:
        print("\n--- États de régulation et hormones ---")
        reset_file(data_dir / "regulation_state.json")
        reset_file(data_dir / "hormones_state.json")
        reset_file(data_dir / "theory_of_mind_state.json")
    
    print("\n" + "="*60)
    print("✅ Réinitialisation terminée avec succès.")
    print("="*60)
    
    if not args.no_backup:
        print(f"\n💾 Sauvegarde disponible dans: {backup_dir}")
        print("   (Conservez-la en cas de besoin de restauration manuelle)")
    
    print("\n[INFO] Redémarrez Nyx pour appliquer les changements.")


if __name__ == "__main__":
    main()

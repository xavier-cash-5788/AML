#!/usr/bin/env python3
"""
Exporte le journal d'événements (events_log.jsonl) en rapport lisible.

Le journal brut est au format JSONL (une ligne = un objet JSON), difficile à lire
manuellement. Ce script le convertit en:
- Markdown (défaut): rapport structuré avec sections, facile à lire dans n'importe quel éditeur
- JSON indenté: pour inspection détaillée des données brutes

Usage:
    python scripts/export_journal.py [--format markdown] [--output rapport.md]
    python scripts/export_journal.py --format json --output rapport.json
"""

import argparse
import json
import sys
from pathlib import Path
from datetime import datetime


def load_events(data_dir: Path) -> list[dict]:
    """Charge tous les événements depuis events_log.jsonl."""
    log_file = data_dir / "events_log.jsonl"
    if not log_file.exists():
        print(f"[WARN] {log_file} n'existe pas.")
        return []
    
    events = []
    with open(log_file, "r", encoding="utf-8") as f:
        for line_num, line in enumerate(f, 1):
            line = line.strip()
            if not line:
                continue
            try:
                event = json.loads(line)
                events.append(event)
            except json.JSONDecodeError as e:
                print(f"[WARN] Ligne {line_num} invalide: {e}")
    
    print(f"[INFO] {len(events)} événements chargés.")
    return events


def format_timestamp(ts: str) -> str:
    """Formate un timestamp ISO en date lisible."""
    try:
        dt = datetime.fromisoformat(ts.replace("Z", "+00:00"))
        return dt.strftime("%d/%m/%Y %H:%M:%S")
    except (ValueError, AttributeError):
        return ts


def categorize_events(events: list[dict]) -> dict[str, list[dict]]:
    """Catégorise les événements par type."""
    categories = {}
    for event in events:
        event_type = event.get("type", "unknown")
        if event_type not in categories:
            categories[event_type] = []
        categories[event_type].append(event)
    return categories


def export_to_markdown(events: list[dict], output_path: Path) -> None:
    """Exporte les événements en format Markdown."""
    categories = categorize_events(events)
    
    with open(output_path, "w", encoding="utf-8") as f:
        f.write("# Rapport d'Événements Nyx\n\n")
        f.write(f"Généré le: {datetime.now().strftime('%d/%m/%Y %H:%M:%S')}\n")
        f.write(f"Total événements: {len(events)}\n\n")
        
        if len(events) == 0:
            f.write("*Aucun événement enregistré.*\n")
            return
        
        # Résumé par catégorie
        f.write("## Résumé par Type\n\n")
        f.write("| Type | Nombre |\n")
        f.write("|------|--------|\n")
        for cat_name, cat_events in sorted(categories.items()):
            f.write(f"| {cat_name} | {len(cat_events)} |\n")
        f.write("\n---\n\n")
        
        # Détails par catégorie
        for cat_name, cat_events in sorted(categories.items()):
            f.write(f"## {cat_name.replace('_', ' ').title()}\n\n")
            
            for event in cat_events[-50:]:  # Limite aux 50 derniers par catégorie
                ts = format_timestamp(event.get("timestamp", "inconnu"))
                f.write(f"### [{ts}]\n\n")
                
                # Données principales
                for key, val in sorted(event.items()):
                    if key == "timestamp":
                        continue
                    if isinstance(val, (dict, list)):
                        val_str = json.dumps(val, ensure_ascii=False, indent=2)
                    else:
                        val_str = str(val)
                    f.write(f"**{key}**: {val_str}\n")
                
                f.write("\n---\n\n")
        
        f.write("\n*Fin du rapport*\n")
    
    print(f"[INFO] Rapport Markdown sauvegardé dans {output_path}")


def export_to_json(events: list[dict], output_path: Path) -> None:
    """Exporte les événements en JSON indenté."""
    report = {
        "generated_at": datetime.now().isoformat(),
        "total_events": len(events),
        "summary": {},
        "events": events
    }
    
    # Résumé
    categories = categorize_events(events)
    for cat_name, cat_events in categories.items():
        report["summary"][cat_name] = len(cat_events)
    
    with open(output_path, "w", encoding="utf-8") as f:
        json.dump(report, f, indent=2, ensure_ascii=False)
    
    print(f"[INFO] Rapport JSON sauvegardé dans {output_path}")


def main():
    parser = argparse.ArgumentParser(description="Exporter le journal d'événements en rapport lisible")
    parser.add_argument("--format", type=str, default="markdown",
                        choices=["markdown", "md", "json"],
                        help="Format de sortie (défaut: markdown)")
    parser.add_argument("--output", type=str, default=None,
                        help="Chemin du fichier de sortie (défaut: automatique)")
    parser.add_argument("--data-dir", type=str, default=None,
                        help="Répertoire des données (défaut: ./data)")
    
    args = parser.parse_args()
    
    # Chemins
    project_root = Path(__file__).parent.parent
    data_dir = Path(args.data_dir) if args.data_dir else project_root / "data"
    
    # Chargement des événements
    events = load_events(data_dir)
    
    if len(events) == 0:
        print("[INFO] Aucun événement à exporter.")
        sys.exit(0)
    
    # Détermination du fichier de sortie
    if args.output:
        output_path = Path(args.output)
    else:
        timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
        if args.format in ["markdown", "md"]:
            output_path = project_root / f"rapport_evenements_{timestamp}.md"
        else:
            output_path = project_root / f"rapport_evenements_{timestamp}.json"
    
    # Export
    output_path.parent.mkdir(parents=True, exist_ok=True)
    
    if args.format in ["markdown", "md"]:
        export_to_markdown(events, output_path)
    else:
        export_to_json(events, output_path)
    
    print(f"\n[INFO] Export terminé avec succès.")


if __name__ == "__main__":
    main()

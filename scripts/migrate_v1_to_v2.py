#!/usr/bin/env python3
"""
Script de migration des données de Mnémosyne v1 vers Nyx v2.

Ce script tente d'importer les données d'une installation précédente de Mnémosyne
(prototype v1 en TypeScript/React) vers la nouvelle structure Nyx v2 (Python).

ATTENTION: Ce script est expérimental. Une sauvegarde des deux côtés est recommandée.

Fonctionnalités:
- Import des souvenirs depuis localStorage exporté
- Import du graphe de traits (noeuds et arêtes)
- Import de l'historique de conversation
- Adaptation des formats de données v1 → v2

Usage:
    python scripts/migrate_v1_to_v2.py --input ../mnemosyne-v1/data --dry-run
    python scripts/migrate_v1_to_v2.py --input ../mnemosyne-v1/data --migrate
"""

import argparse
import json
import sys
from pathlib import Path
from datetime import datetime


def load_v1_memories(input_dir: Path) -> list[dict]:
    """Charge les souvenirs depuis l'export v1."""
    # v1 stockait dans localStorage, format JSON typique:
    # {"memories": [...], "graph": {...}, ...}
    
    candidates = [
        input_dir / "localStorage.json",
        input_dir / "export.json",
        input_dir / "mnemosyne_data.json",
        input_dir / "data.json",
    ]
    
    for candidate in candidates:
        if candidate.exists():
            with open(candidate, "r", encoding="utf-8") as f:
                data = json.load(f)
            
            # Extraction selon le format détecté
            if isinstance(data, dict):
                if "memories" in data:
                    return data["memories"]
                if "vectorMemory" in data:  # Format v1 typique
                    return data["vectorMemory"]
            elif isinstance(data, list):
                return data
    
    print(f"[WARN] Aucun fichier de souvenirs reconnu trouvé dans {input_dir}")
    return []


def load_v1_graph(input_dir: Path) -> tuple[list[dict], list[dict]]:
    """Charge le graphe de traits depuis l'export v1."""
    candidates = [
        input_dir / "localStorage.json",
        input_dir / "export.json",
        input_dir / "graph.json",
    ]
    
    for candidate in candidates:
        if candidate.exists():
            with open(candidate, "r", encoding="utf-8") as f:
                data = json.load(f)
            
            if isinstance(data, dict):
                nodes = data.get("graph", {}).get("nodes", [])
                edges = data.get("graph", {}).get("edges", [])
                
                # Autre format possible
                if not nodes and "traitNodes" in data:
                    nodes = data.get("traitNodes", [])
                if not edges and "traitEdges" in data:
                    edges = data.get("traitEdges", [])
                
                return nodes, edges
    
    print(f"[WARN] Aucun fichier de graphe reconnu trouvé dans {input_dir}")
    return [], []


def load_v1_chat_history(input_dir: Path) -> list[dict]:
    """Charge l'historique de conversation depuis l'export v1."""
    candidates = [
        input_dir / "chatHistory.json",
        input_dir / "conversation.json",
        input_dir / "chat.json",
    ]
    
    for candidate in candidates:
        if candidate.exists():
            with open(candidate, "r", encoding="utf-8") as f:
                data = json.load(f)
            
            if isinstance(data, list):
                return data
            if isinstance(data, dict) and "messages" in data:
                return data["messages"]
    
    print(f"[WARN] Aucun fichier d'historique reconnu trouvé dans {input_dir}")
    return []


def migrate_memory_v1_to_v2(v1_memories: list[dict]) -> list[dict]:
    """Convertit les souvenirs v1 vers le format v2."""
    v2_memories = []
    
    for mem in v1_memories:
        v2_mem = {
            "id": mem.get("id", f"mem_{len(v2_memories)}"),
            "text": mem.get("text", mem.get("content", "")),
            "embedding": mem.get("embedding", None),
            "initial_strength": mem.get("initialStrength", mem.get("I0", 1.0)),
            "current_strength": mem.get("currentStrength", mem.get("strength", 1.0)),
            "valence": mem.get("valence", 0.0),
            "arousal": mem.get("arousal", 0.0),
            "dominance": mem.get("dominance", 0.0),
            "timestamp": mem.get("timestamp", mem.get("createdAt", datetime.now().isoformat())),
            "last_accessed": mem.get("lastAccessed", mem.get("timestamp", datetime.now().isoformat())),
            "access_count": mem.get("accessCount", mem.get("accesses", 0)),
            "consolidated": mem.get("consolidated", False),
            "compressed": mem.get("compressed", False),
            "latent_vector": mem.get("latentVector", None),
            "tags": mem.get("tags", []),
            "source": mem.get("source", "migrated_v1"),
        }
        v2_memories.append(v2_mem)
    
    return v2_memories


def migrate_graph_v1_to_v2(v1_nodes: list[dict], v1_edges: list[dict]) -> tuple[list[dict], list[dict]]:
    """Convertit le graphe v1 vers le format v2."""
    v2_nodes = []
    v2_edges = []
    
    for node in v1_nodes:
        v2_node = {
            "id": node.get("id", f"node_{len(v2_nodes)}"),
            "trait_name": node.get("traitName", node.get("name", "unknown")),
            "strength": node.get("strength", node.get("value", 0.5)),
            "activation": node.get("activation", 0.0),
            "baseline": node.get("baseline", 0.5),
            "is_primitive": node.get("isPrimitive", node.get("primitive", False)),
            "category": node.get("category", "general"),
            "created_at": node.get("createdAt", datetime.now().isoformat()),
            "last_modified": node.get("lastModified", datetime.now().isoformat()),
            "cluster_id": node.get("clusterId", None),
        }
        v2_nodes.append(v2_node)
    
    for edge in v1_edges:
        v2_edge = {
            "id": edge.get("id", f"edge_{len(v2_edges)}"),
            "source_id": edge.get("source", edge.get("sourceId", "")),
            "target_id": edge.get("target", edge.get("targetId", "")),
            "weight": edge.get("weight", edge.get("strength", 0.5)),
            "coactivation_count": edge.get("coactivationCount", edge.get("activations", 0)),
            "last_coactivated": edge.get("lastCoactivated", None),
            "relationship_type": edge.get("relationshipType", edge.get("type", "association")),
        }
        v2_edges.append(v2_edge)
    
    return v2_nodes, v2_edges


def migrate_chat_v1_to_v2(v1_history: list[dict]) -> list[dict]:
    """Convertit l'historique de chat v1 vers le format v2."""
    v2_history = []
    
    for msg in v1_history:
        v2_msg = {
            "role": msg.get("role", msg.get("sender", "user")),
            "content": msg.get("content", msg.get("text", "")),
            "timestamp": msg.get("timestamp", msg.get("createdAt", datetime.now().isoformat())),
            "emotion": msg.get("emotion", None),
            "response_to": msg.get("responseTo", None),
            "feedback": msg.get("feedback", None),  # 👍 ou 👎
            "used_memories": msg.get("usedMemories", []),
            "model_used": msg.get("model", msg.get("modelName", "llama3.2:3b")),
        }
        v2_history.append(v2_msg)
    
    return v2_history


def main():
    parser = argparse.ArgumentParser(description="Migrer les données de Mnémosyne v1 vers Nyx v2")
    parser.add_argument("--input", type=str, required=True,
                        help="Chemin vers le répertoire de données v1")
    parser.add_argument("--dry-run", action="store_true",
                        help="Affiche ce qui serait migré sans écrire")
    parser.add_argument("--migrate", action="store_true",
                        help="Exécute la migration effective")
    parser.add_argument("--memories-only", action="store_true",
                        help="Migre uniquement les souvenirs")
    parser.add_argument("--graph-only", action="store_true",
                        help="Migre uniquement le graphe de traits")
    parser.add_argument("--chat-only", action="store_true",
                        help="Migre uniquement l'historique de conversation")
    
    args = parser.parse_args()
    
    input_dir = Path(args.input)
    if not input_dir.exists():
        print(f"[ERREUR] Le répertoire {input_dir} n'existe pas.")
        sys.exit(1)
    
    project_root = Path(__file__).parent.parent
    data_dir = project_root / "data"
    
    print(f"\n{'='*60}")
    print(f"MIGRATION MNÉMOSYNE V1 → NYX V2")
    print(f"{'='*60}")
    print(f"Source: {input_dir}")
    print(f"Cible:  {data_dir}")
    print(f"Mode:   {'DRY-RUN (aucune écriture)' if args.dry_run else 'MIGRATION'}")
    print(f"{'='*60}\n")
    
    # Chargement des données v1
    print("[INFO] Chargement des données v1...")
    
    v1_memories = []
    v1_nodes, v1_edges = [], []
    v1_chat = []
    
    if not args.graph_only:
        v1_memories = load_v1_memories(input_dir)
        print(f"  ✓ Souvenirs chargés: {len(v1_memories)}")
    
    if not args.memories_only and not args.chat_only:
        v1_nodes, v1_edges = load_v1_graph(input_dir)
        print(f"  ✓ Graphe chargé: {len(v1_nodes)} noeuds, {len(v1_edges)} arêtes")
    
    if not args.memories_only and not args.graph_only:
        v1_chat = load_v1_chat_history(input_dir)
        print(f"  ✓ Historique chargé: {len(v1_chat)} messages")
    
    # Conversion
    print("\n[INFO] Conversion des formats...")
    
    v2_memories = migrate_memory_v1_to_v2(v1_memories) if v1_memories else []
    v2_nodes, v2_edges = migrate_graph_v1_to_v2(v1_nodes, v1_edges) if v1_nodes or v1_edges else ([], [])
    v2_chat = migrate_chat_v1_to_v2(v1_chat) if v1_chat else []
    
    print(f"  ✓ Souvenirs convertis: {len(v2_memories)}")
    print(f"  ✓ Noeuds convertis: {len(v2_nodes)}")
    print(f"  ✓ Arêtes converties: {len(v2_edges)}")
    print(f"  ✓ Messages convertis: {len(v2_chat)}")
    
    # Dry run ou migration effective
    if args.dry_run:
        print("\n[DRY-RUN] Aucune écriture effectuée.")
        print("[INFO] Exécutez sans --dry-run pour appliquer la migration.")
        return
    
    if not args.migrate:
        print("\n[INFO] Utilisez --migrate pour appliquer la migration.")
        print("[INFO] Ou --dry-run pour voir ce qui serait fait.")
        return
    
    # Confirmation
    print("\n⚠️  ATTENTION: Cette opération va écraser les fichiers cibles.")
    response = input("Tapez 'OUI' pour continuer: ").strip().upper()
    if response != "OUI":
        print("\n[INFO] Migration annulée.")
        return
    
    # Écriture des fichiers
    print("\n[INFO] Écriture des fichiers...")
    
    if not args.graph_only and not args.chat_only:
        memories_file = data_dir / "memories" / "vector_memory.json"
        memories_file.parent.mkdir(parents=True, exist_ok=True)
        with open(memories_file, "w", encoding="utf-8") as f:
            json.dump(v2_memories, f, indent=2, ensure_ascii=False)
        print(f"  ✓ {memories_file.name} écrit ({len(v2_memories)} souvenirs)")
    
    if not args.memories_only and not args.chat_only:
        nodes_file = data_dir / "graph" / "nodes.json"
        edges_file = data_dir / "graph" / "edges.json"
        nodes_file.parent.mkdir(parents=True, exist_ok=True)
        
        with open(nodes_file, "w", encoding="utf-8") as f:
            json.dump(v2_nodes, f, indent=2, ensure_ascii=False)
        print(f"  ✓ {nodes_file.name} écrit ({len(v2_nodes)} noeuds)")
        
        with open(edges_file, "w", encoding="utf-8") as f:
            json.dump(v2_edges, f, indent=2, ensure_ascii=False)
        print(f"  ✓ {edges_file.name} écrit ({len(v2_edges)} arêtes)")
    
    if not args.memories_only and not args.graph_only:
        chat_file = data_dir / "chat_history.json"
        with open(chat_file, "w", encoding="utf-8") as f:
            json.dump(v2_chat, f, indent=2, ensure_ascii=False)
        print(f"  ✓ {chat_file.name} écrit ({len(v2_chat)} messages)")
    
    print("\n" + "="*60)
    print("✅ MIGRATION TERMINÉE AVEC SUCCÈS")
    print("="*60)
    print("\n[INFO] Redémarrez Nyx pour utiliser les données migrées.")
    print("\n⚠️  NOTES IMPORTANTES:")
    print("  - Les embeddings v1 peuvent être incompatibles avec le modèle v2")
    print("  - Il est recommandé de ré-entraîner l'auto-encodeur après migration")
    print("  - Vérifiez manuellement les données migrées dans data/")


if __name__ == "__main__":
    main()

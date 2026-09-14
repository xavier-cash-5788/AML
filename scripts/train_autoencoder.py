#!/usr/bin/env python3
"""
Entraîne ou ré-entraîne l'auto-encodeur de compression sur les souvenirs stockés.

L'auto-encodeur apprend à compresser les embeddings (dimension 768 pour nomic-embed-text)
en une représentation latente plus petite (par défaut 128), puis à reconstruire l'embedding
original. Cette compression permet de réduire la taille mémoire des souvenirs anciens
tout en préservant leur contenu sémantique essentiel.

Usage:
    python scripts/train_autoencoder.py [--dimensions 128] [--epochs 100] [--learning-rate 0.001]
"""

import argparse
import json
import sys
from pathlib import Path

import numpy as np

# Ajout du parent au path pour importer nyx
sys.path.insert(0, str(Path(__file__).parent.parent))

from nyx.memory.compression import AutoEncoder, COMPRESSION_CONFIG


def load_memories(data_dir: Path) -> list[dict]:
    """Charge tous les souvenirs depuis vector_memory.json."""
    memory_file = data_dir / "memories" / "vector_memory.json"
    if not memory_file.exists():
        print(f"[WARN] {memory_file} n'existe pas. Aucun souvenir à compresser.")
        return []
    
    with open(memory_file, "r", encoding="utf-8") as f:
        memories = json.load(f)
    
    print(f"[INFO] {len(memories)} souvenirs chargés.")
    return memories


def extract_embeddings(memories: list[dict]) -> np.ndarray:
    """Extrait les embeddings valides depuis la liste des souvenirs."""
    embeddings = []
    for mem in memories:
        if "embedding" in mem and mem["embedding"] is not None:
            embeddings.append(mem["embedding"])
    
    if len(embeddings) == 0:
        print("[WARN] Aucun embedding valide trouvé.")
        return np.array([])
    
    print(f"[INFO] {len(embeddings)} embeddings extraits pour l'entraînement.")
    return np.array(embeddings, dtype=np.float32)


def main():
    parser = argparse.ArgumentParser(description="Entraîner l'auto-encodeur de compression")
    parser.add_argument("--dimensions", type=int, default=COMPRESSION_CONFIG["latent_dim"],
                        help=f"Dimension de l'espace latent (défaut: {COMPRESSION_CONFIG['latent_dim']})")
    parser.add_argument("--epochs", type=int, default=COMPRESSION_CONFIG["epochs"],
                        help=f"Nombre d'époques d'entraînement (défaut: {COMPRESSION_CONFIG['epochs']})")
    parser.add_argument("--learning-rate", type=float, default=COMPRESSION_CONFIG["learning_rate"],
                        help=f"Taux d'apprentissage (défaut: {COMPRESSION_CONFIG['learning_rate']})")
    parser.add_argument("--batch-size", type=int, default=COMPRESSION_CONFIG["batch_size"],
                        help=f"Taille des batches (défaut: {COMPRESSION_CONFIG['batch_size']})")
    
    args = parser.parse_args()
    
    # Chemins
    project_root = Path(__file__).parent.parent
    data_dir = project_root / "data"
    weights_dir = data_dir / "autoencoder"
    weights_dir.mkdir(parents=True, exist_ok=True)
    weights_path = weights_dir / "weights.npz"
    
    # Chargement des données
    memories = load_memories(data_dir)
    if len(memories) == 0:
        print("[ERREUR] Impossible d'entraîner sans souvenirs.")
        print("[INFO] Commencez par avoir des conversations avec Nyx.")
        sys.exit(1)
    
    embeddings = extract_embeddings(memories)
    if len(embeddings) == 0:
        print("[ERREUR] Aucun embedding valide trouvé.")
        sys.exit(1)
    
    input_dim = embeddings.shape[1]
    print(f"[INFO] Dimension d'entrée: {input_dim}")
    print(f"[INFO] Dimension latente cible: {args.dimensions}")
    
    # Initialisation et entraînement
    print("\n[INFO] Initialisation de l'auto-encodeur...")
    autoencoder = AutoEncoder(
        input_dim=input_dim,
        latent_dim=args.dimensions,
        learning_rate=args.learning_rate
    )
    
    print(f"\n[INFO] Démarrage de l'entraînement ({args.epochs} époques, batch size={args.batch_size})...")
    history = autoencoder.train(embeddings, epochs=args.epochs, batch_size=args.batch_size)
    
    # Sauvegarde des poids
    autoencoder.save_weights(str(weights_path))
    print(f"\n[INFO] Poids sauvegardés dans {weights_path}")
    
    # Rapport de performance
    final_loss = history["loss"][-1] if history["loss"] else float("inf")
    print(f"\n{'='*60}")
    print(f"RAPPORT D'ENTRAÎNEMENT")
    print(f"{'='*60}")
    print(f"Souvenirs utilisés:     {len(embeddings)}")
    print(f"Dimension entrée:       {input_dim}")
    print(f"Dimension latente:      {args.dimensions}")
    print(f"Taux de compression:    {(1 - args.dimensions/input_dim)*100:.1f}%")
    print(f"Perte finale (MSE):     {final_loss:.6f}")
    print(f"Époques:                {args.epochs}")
    print(f"Taux d'apprentissage:   {args.learning_rate}")
    print(f"{'='*60}")
    
    # Test de reconstruction sur un échantillon
    if len(embeddings) > 0:
        sample = embeddings[:min(5, len(embeddings))]
        reconstructed = autoencoder.decode(autoencoder.encode(sample))
        mse_sample = np.mean((sample - reconstructed) ** 2)
        print(f"\n[TEST] MSE sur échantillon: {mse_sample:.6f}")
        
        # Similarité cosinus moyenne entre original et reconstruit
        similarities = []
        for orig, rec in zip(sample, reconstructed):
            norm_orig = np.linalg.norm(orig)
            norm_rec = np.linalg.norm(rec)
            if norm_orig > 0 and norm_rec > 0:
                sim = np.dot(orig, rec) / (norm_orig * norm_rec)
                similarities.append(sim)
        
        if similarities:
            avg_sim = np.mean(similarities)
            print(f"[TEST] Similarité cosinus moyenne: {avg_sim:.4f}")
    
    print("\n[INFO] Entraînement terminé avec succès.")


if __name__ == "__main__":
    main()

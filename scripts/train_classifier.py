#!/usr/bin/env python3
"""
Entraîne le classifieur émotionnel sur les données de feedback et labels manuels.

Le classifieur apprend à prédire les émotions (valence, arousal, dominance) directement
à partir des embeddings des messages, sans passer par le LLM à chaque fois. Il s'entraîne
sur les données accumulées dans emotion/training_data.json, qui sont enrichies soit
manuellement, soit via le feedback utilisateur (👍/👎 interprété comme signal émotionnel).

Usage:
    python scripts/train_classifier.py [--model-type mlp] [--epochs 50]
"""

import argparse
import json
import sys
from pathlib import Path

import numpy as np

sys.path.insert(0, str(Path(__file__).parent.parent))

from nyx.emotion.classifier import EmotionClassifier, CLASSIFIER_CONFIG


def load_training_data(data_dir: Path) -> list[dict]:
    """Charge les données d'entraînement depuis training_data.json."""
    training_file = data_dir / "emotion" / "training_data.json"
    if not training_file.exists():
        print(f"[WARN] {training_file} n'existe pas.")
        return []
    
    with open(training_file, "r", encoding="utf-8") as f:
        data = json.load(f)
    
    print(f"[INFO] {len(data)} échantillons chargés.")
    return data


def prepare_dataset(samples: list[dict]) -> tuple[np.ndarray, np.ndarray]:
    """Prépare les embeddings et labels pour l'entraînement."""
    embeddings = []
    labels = []
    
    for sample in samples:
        if "embedding" not in sample or sample["embedding"] is None:
            continue
        if "valence" not in sample or "arousal" not in sample or "dominance" not in sample:
            continue
        
        embeddings.append(sample["embedding"])
        labels.append([sample["valence"], sample["arousal"], sample["dominance"]])
    
    if len(embeddings) == 0:
        return np.array([]), np.array([])
    
    print(f"[INFO] {len(embeddings)} échantillons valides après filtrage.")
    return np.array(embeddings, dtype=np.float32), np.array(labels, dtype=np.float32)


def main():
    parser = argparse.ArgumentParser(description="Entraîner le classifieur émotionnel")
    parser.add_argument("--model-type", type=str, default=CLASSIFIER_CONFIG["model_type"],
                        choices=["mlp", "linear"],
                        help=f"Type de modèle (défaut: {CLASSIFIER_CONFIG['model_type']})")
    parser.add_argument("--epochs", type=int, default=CLASSIFIER_CONFIG["epochs"],
                        help=f"Nombre d'époques (défaut: {CLASSIFIER_CONFIG['epochs']})")
    parser.add_argument("--learning-rate", type=float, default=CLASSIFIER_CONFIG["learning_rate"],
                        help=f"Taux d'apprentissage (défaut: {CLASSIFIER_CONFIG['learning_rate']})")
    parser.add_argument("--hidden-dim", type=int, default=CLASSIFIER_CONFIG["hidden_dim"],
                        help=f"Dimension cachée pour MLP (défaut: {CLASSIFIER_CONFIG['hidden_dim']})")
    parser.add_argument("--test-split", type=float, default=0.2,
                        help="Proportion des données pour le test (défaut: 0.2)")
    
    args = parser.parse_args()
    
    # Chemins
    project_root = Path(__file__).parent.parent
    data_dir = project_root / "data"
    weights_dir = data_dir / "emotion"
    weights_dir.mkdir(parents=True, exist_ok=True)
    weights_path = weights_dir / "classifier_weights.npz"
    
    # Chargement des données
    samples = load_training_data(data_dir)
    if len(samples) == 0:
        print("[ERREUR] Aucune donnée d'entraînement trouvée.")
        print("[INFO] Ajoutez des exemples dans data/emotion/training_data.json")
        print("[INFO] Ou interagissez avec Nyx pour accumuler du feedback.")
        sys.exit(1)
    
    embeddings, labels = prepare_dataset(samples)
    if len(embeddings) == 0:
        print("[ERREUR] Aucun échantillon valide après filtrage.")
        sys.exit(1)
    
    input_dim = embeddings.shape[1]
    output_dim = labels.shape[1]  # Toujours 3: valence, arousal, dominance
    
    print(f"\n[INFO] Dimension d'entrée: {input_dim}")
    print(f"[INFO] Dimension de sortie: {output_dim} (valence, arousal, dominance)")
    
    # Split train/test
    split_idx = int(len(embeddings) * (1 - args.test_split))
    X_train, X_test = embeddings[:split_idx], embeddings[split_idx:]
    y_train, y_test = labels[:split_idx], labels[split_idx:]
    
    print(f"[INFO] Échantillons train: {len(X_train)}")
    print(f"[INFO] Échantillons test: {len(X_test)}")
    
    # Initialisation et entraînement
    print("\n[INFO] Initialisation du classifieur...")
    classifier = EmotionClassifier(
        input_dim=input_dim,
        output_dim=output_dim,
        model_type=args.model_type,
        hidden_dim=args.hidden_dim,
        learning_rate=args.learning_rate
    )
    
    print(f"\n[INFO] Démarrage de l'entraînement ({args.epochs} époques)...")
    history = classifier.train(X_train, y_train, epochs=args.epochs, batch_size=CLASSIFIER_CONFIG["batch_size"])
    
    # Évaluation sur le set de test
    test_loss, test_mae = classifier.evaluate(X_test, y_test)
    print(f"\n[TEST] Perte sur test: {test_loss:.6f}")
    print(f"[TEST] MAE sur test: {test_mae:.6f}")
    
    # Sauvegarde des poids
    classifier.save_weights(str(weights_path))
    print(f"\n[INFO] Poids sauvegardés dans {weights_path}")
    
    # Rapport détaillé
    final_train_loss = history["loss"][-1] if history["loss"] else float("inf")
    print(f"\n{'='*60}")
    print(f"RAPPORT D'ENTRAÎNEMENT DU CLASSIFIEUR")
    print(f"{'='*60}")
    print(f"Type de modèle:         {args.model_type}")
    print(f"Échantillons total:     {len(embeddings)}")
    print(f"Entraînement:           {len(X_train)}")
    print(f"Test:                   {len(X_test)}")
    print(f"Perte finale (train):   {final_train_loss:.6f}")
    print(f"Perte finale (test):    {test_loss:.6f}")
    print(f"MAE final (test):       {test_mae:.6f}")
    print(f"Époques:                {args.epochs}")
    print(f"{'='*60}")
    
    # Prédiction exemple
    if len(X_test) > 0:
        print("\n[EXEMPLE] Prédictions sur 3 échantillons de test:")
        sample_preds = classifier.predict(X_test[:min(3, len(X_test))])
        sample_true = y_test[:min(3, len(y_test))]
        
        emotions = ["Valence", "Arousal", "Dominance"]
        for i, (pred, true) in enumerate(zip(sample_preds, sample_true)):
            print(f"  Échantillon {i+1}:")
            for j, emo in enumerate(emotions):
                print(f"    {emo}: Prédit={pred[j]:.3f}, Réel={true[j]:.3f}")
    
    print("\n[INFO] Entraînement terminé avec succès.")


if __name__ == "__main__":
    main()

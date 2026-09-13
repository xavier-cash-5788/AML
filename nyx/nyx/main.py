"""
Point d'entrée principal de l'application Nyx.

Ce module initialise tous les sous-systèmes et lance soit :
- L'interface en ligne de commande (CLI)
- L'interface web (Flask)
Selon la configuration de l'utilisateur.
"""

import sys
from pathlib import Path

# Ajouter le parent directory au path pour les imports
sys.path.insert(0, str(Path(__file__).parent.parent))


def main():
    """
    Point d'entrée principal de Nyx.
    
    Initialise la configuration, charge les modules nécessaires,
    et démarre l'interface appropriée.
    """
    print("=" * 60)
    print("Nyx v2.0 — Agent conversationnel local avec mémoire persistante")
    print("=" * 60)
    print()
    
    # Vérifier la disponibilité d'Ollama
    try:
        from nyx.llm.ollama_client import OllamaClient
        
        client = OllamaClient()
        if not client.est_disponible():
            print("⚠ ATTENTION: Le serveur Ollama ne semble pas accessible.")
            print("  Assurez-vous qu'Ollama est installé et lancé (ollama serve).")
            print("  Modèles requis : llama3.2:3b, nomic-embed-text")
            print()
            print("  Pour installer les modèles :")
            print("    ollama pull llama3.2:3b")
            print("    ollama pull nomic-embed-text")
            print()
            input("Appuyez sur Entrée pour continuer quand même...")
        else:
            modeles = client.verifier_modeles_disponibles()
            print(f"✓ Ollama détecté. Modèles disponibles : {len(modeles)}")
            
            # Vérifier les modèles requis
            requis = ["llama3.2:3b", "nomic-embed-text"]
            for modele in requis:
                if any(modele in m for m in modeles):
                    print(f"  ✓ {modele}")
                else:
                    print(f"  ⚠ {modele} manquant — exécutez: ollama pull {modele}")
            print()
    except ImportError as e:
        print(f"⚠ Erreur d'import : {e}")
        print("  Assurez-vous que les dépendances sont installées : pip install -r requirements.txt")
        return 1
    
    # Charger la configuration
    print("Chargement de la configuration...")
    config = charger_configuration()
    
    # Initialiser les fichiers de données
    initialiser_donnees()
    
    print("✓ Initialisation terminée")
    print()
    
    # Démarrer l'interface
    print("Démarrage de l'interface en ligne de commande...")
    print("(Tapez 'quit' ou 'exit' pour quitter)")
    print("-" * 60)
    
    from nyx.orchestrator import Orchestrator
    
    orchestrateur = Orchestrator(config)
    
    # Boucle principale CLI
    while True:
        try:
            utilisateur_input = input("\n🧑 Vous: ").strip()
            
            if not utilisateur_input:
                continue
            
            if utilisateur_input.lower() in ("quit", "exit", "q"):
                print("\n👋 Fermeture de Nyx...")
                break
            
            # Traiter le message
            reponse = orchestrateur.traiter_message(utilisateur_input)
            
            print(f"\n🤖 Nyx: {reponse}")
            
        except KeyboardInterrupt:
            print("\n\n👋 Interruption detected. Fermeture de Nyx...")
            break
        except Exception as e:
            print(f"\n⚠ Erreur: {e}")
            print("  Consultez les logs pour plus de détails.")
    
    return 0


def charger_configuration() -> dict:
    """
    Charger la configuration fusionnée (default + user).
    
    Returns:
        Dictionnaire de configuration complet
    """
    import json
    
    default_path = Path(__file__).parent.parent / "config" / "default_config.json"
    user_path = Path(__file__).parent.parent / "config" / "user_config.json"
    
    # Charger la config par défaut
    with open(default_path, 'r', encoding='utf-8') as f:
        config = json.load(f)
    
    # Fusionner avec la config utilisateur si elle existe
    if user_path.exists():
        try:
            with open(user_path, 'r', encoding='utf-8') as f:
                user_config = json.load(f)
            
            # Fusion récursive
            config = fusionner_config(config, user_config)
            print("  ✓ Configuration personnalisée chargée")
        except (json.JSONDecodeError, IOError) as e:
            print(f"  ⚠ Impossible de lire user_config.json: {e}")
            print("  → Utilisation de la configuration par défaut uniquement")
    else:
        print("  → Aucune configuration personnalisée (utilisation des defaults)")
    
    return config


def fusionner_config(base: dict, surcharge: dict) -> dict:
    """
    Fusionner deux dictionnaires de configuration récursivement.
    
    Args:
        base: Configuration de base
        surcharge: Configuration à fusionner par-dessus
    
    Returns:
        Configuration fusionnée
    """
    resultat = base.copy()
    
    for cle, valeur in surcharge.items():
        if cle.startswith("_"):
            # Ignorer les clés méta (commentaires, instructions)
            continue
        
        if cle in resultat and isinstance(resultat[cle], dict) and isinstance(valeur, dict):
            resultat[cle] = fusionner_config(resultat[cle], valeur)
        else:
            resultat[cle] = valeur
    
    return resultat


def initialiser_donnees():
    """
    Initialiser les fichiers de données vides s'ils n'existent pas.
    """
    import json
    from datetime import datetime
    
    data_dir = Path(__file__).parent.parent / "data"
    data_dir.mkdir(parents=True, exist_ok=True)
    
    # Fichiers JSON à initialiser
    fichiers_a_initialiser = {
        "memories/vector_memory.json": [],
        "memories/archive.json": [],
        "graph/nodes.json": [],
        "graph/edges.json": [],
        "semantic/facts.json": [],
        "semantic/associations.json": [],
        "habits/patterns.json": [],
        "regulation_state.json": {"niveau_stress": 0.5, "sensibilisation_amygdale": 0.0},
        "hormones_state.json": {
            "dopamine": 0.5,
            "serotonine": 0.5,
            "adrenaline": 0.3,
            "cortisol": 0.3,
            "ocytocine": 0.5,
        },
        "theory_of_mind_state.json": {"croyances": {}, "intentions": {}, "engagement": 0.5},
        "rl_state.json": {"q_values": {}, "epsilon": 0.3, "historique": []},
        "feedback_log.json": [],
        "prediction_history.json": [],
        "evolution/population.json": [],
        "evolution/generations_log.json": [],
        "chat_history.json": [],
    }
    
    for chemin_rel, contenu_par_defaut in fichiers_a_initialiser.items():
        chemin_complet = data_dir / chemin_rel
        chemin_complet.parent.mkdir(parents=True, exist_ok=True)
        
        if not chemin_complet.exists():
            with open(chemin_complet, 'w', encoding='utf-8') as f:
                json.dump(contenu_par_defaut, f, ensure_ascii=False, indent=2)
            print(f"  ✓ Créé: {chemin_rel}")
    
    # Fichier events_log.jsonl (vide par défaut)
    events_log_path = data_dir / "events_log.jsonl"
    if not events_log_path.exists():
        events_log_path.touch()
        print(f"  ✓ Créé: events_log.jsonl")


if __name__ == "__main__":
    sys.exit(main())

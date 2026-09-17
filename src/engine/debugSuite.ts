/**
 * Module de Debug Complet
 * Teste toutes les fonctions du système une par une avec logs détaillés
 */

import { Engine } from './engine/system';
import { Souvenir, Vecteur, Noeud, UserMentalState } from './engine/types';
import { VectorSearch } from './engine/vectorSearch';
import { GraphPondration } from './engine/graphPondration';
import { hormonesUpdate } from './engine/hormones';
import { attentionFocus } from './engine/attention';
import { detectSpontaneity } from './engine/spontaneous';
import { inferUserState } from './engine/theory_of_mind';
import { validateCitations } from './guardrail/validator';

export interface DebugResult {
  testName: string;
  status: 'PASS' | 'FAIL' | 'WARN';
  duration: number;
  logs: string[];
  error?: string;
}

export class DebugSuite {
  private engine: Engine;
  private results: DebugResult[] = [];
  private globalLogs: string[] = [];

  constructor(engine: Engine) {
    this.engine = engine;
  }

  private log(message: string): void {
    const timestamp = new Date().toISOString().split('T')[1].slice(0, -1);
    const logEntry = `[${timestamp}] ${message}`;
    this.globalLogs.push(logEntry);
    console.log(logEntry);
  }

  private async runTest(
    name: string,
    testFn: () => Promise<void> | void
  ): Promise<DebugResult> {
    const start = performance.now();
    const logs: string[] = [];
    let status: 'PASS' | 'FAIL' | 'WARN' = 'PASS';
    let error: string | undefined;

    try {
      // Override console.log for this test
      const originalLog = console.log;
      console.log = (...args) => {
        logs.push(args.join(' '));
        originalLog(...args);
      };

      this.log(`🧪 Démarrage test: ${name}`);
      await testFn();

      console.log = originalLog;
    } catch (e) {
      status = 'FAIL';
      error = e instanceof Error ? e.message : String(e);
      this.log(`❌ Échec test: ${name} - ${error}`);
    }

    const duration = performance.now() - start;
    
    if (status === 'PASS' && duration > 1000) {
      status = 'WARN';
      this.log(`⚠️ Test lent: ${name} (${duration.toFixed(2)}ms)`);
    }

    const result: DebugResult = {
      testName: name,
      status,
      duration,
      logs,
      error
    };

    this.results.push(result);
    this.log(`✅ Test terminé: ${name} (${status}, ${duration.toFixed(2)}ms)`);
    
    return result;
  }

  // Tests VectorSearch
  private async testVectorSearch(): Promise<void> {
    const vectorSearch = new VectorSearch();
    
    // Test 1: Encodage de base
    this.log('Test encodage vecteur...');
    const testText = "Je suis heureux aujourd'hui";
    const embedding = await vectorSearch.encode(testText);
    
    if (!embedding || embedding.length === 0) {
      throw new Error('Embedding vide ou nul');
    }
    this.log(`✓ Embedding généré: ${embedding.length} dimensions`);

    // Test 2: Similarité cosinus
    this.log('Test similarité cosinus...');
    const embedding2 = await vectorSearch.encode("Je suis content");
    const similarity = vectorSearch.cosineSimilarity(embedding, embedding2);
    
    if (similarity < 0 || similarity > 1) {
      throw new Error(`Similarité invalide: ${similarity}`);
    }
    this.log(`✓ Similarité calculée: ${similarity.toFixed(4)}`);

    // Test 3: Recherche avec mémoire vide
    this.log('Test recherche dans mémoire vide...');
    const emptyResults = await vectorSearch.search("test", []);
    if (emptyResults.length !== 0) {
      throw new Error('Résultats attendus vides');
    }
    this.log('✓ Recherche dans mémoire vide OK');

    // Test 4: Ajout et recherche
    this.log('Test ajout et recherche...');
    const souvenirs: Souvenir[] = [
      {
        id: 'test1',
        contenu: "J'aime la philosophie",
        valence: 0.7,
        arousal: 0.5,
        timestamp: Date.now(),
        tags: ['philosophie'],
        type: 'episodique'
      },
      {
        id: 'test2',
        contenu: "Les mathématiques sont belles",
        valence: 0.8,
        arousal: 0.6,
        timestamp: Date.now(),
        tags: ['maths'],
        type: 'sémantique'
      }
    ];
    
    const results = await vectorSearch.search("philosophie pensée", souvenirs);
    if (results.length === 0) {
      throw new Error('Aucun résultat trouvé');
    }
    this.log(`✓ Recherche retournée: ${results.length} résultats`);
  }

  // Tests GraphPondration
  private async testGraphPondration(): Promise<void> {
    const graph = new GraphPondration();
    
    // Test 1: Création de noeuds
    this.log('Test création noeuds...');
    const noeud1: Noeud = {
      id: 'n1',
      concept: 'bonheur',
      activation: 0.8,
      connexions: []
    };
    
    graph.addNoeud(noeud1);
    if (!graph.getNoeud('n1')) {
      throw new Error('Noeud non créé');
    }
    this.log('✓ Noeud créé avec succès');

    // Test 2: Connexion entre noeuds
    this.log('Test connexion noeuds...');
    const noeud2: Noeud = {
      id: 'n2',
      concept: 'joie',
      activation: 0.7,
      connexions: []
    };
    graph.addNoeud(noeud2);
    graph.connecter('n1', 'n2', 0.9);
    
    const n1 = graph.getNoeud('n1');
    if (!n1 || n1.connexions.length === 0) {
      throw new Error('Connexion échouée');
    }
    this.log(`✓ Connexion établie: ${n1.connexions.length} liens`);

    // Test 3: Propagation d'activation
    this.log('Test propagation activation...');
    graph.propagerActivation('n1', 0.5);
    const n2 = graph.getNoeud('n2');
    if (!n2 || n2.activation <= 0.7) {
      throw new Error('Propagation échouée');
    }
    this.log(`✓ Activation propagée: ${n2.activation.toFixed(4)}`);

    // Test 4: Decay
    this.log('Test decay des activations...');
    const beforeDecay = n2.activation;
    graph.applyDecay(0.1);
    const afterDecay = graph.getNoeud('n2')?.activation;
    
    if (!afterDecay || afterDecay >= beforeDecay) {
      throw new Error('Decay non appliqué correctement');
    }
    this.log(`✓ Decay appliqué: ${beforeDecay.toFixed(4)} → ${afterDecay.toFixed(4)}`);
  }

  // Tests Hormones
  private async testHormones(): Promise<void> {
    this.log('Test mise à jour hormones...');
    
    const state = {
      dopamine: 0.5,
      serotonin: 0.5,
      cortisol: 0.3,
      ocytocine: 0.4
    };

    // Scénario: récompense inattendue
    const resultat = { valence: 0.8, surprise: true };
    const attente = 0.3;
    
    const newState = hormonesUpdate(state, resultat, attente);
    
    if (newState.dopamine <= state.dopamine) {
      throw new Error('Dopamine devrait augmenter avec surprise positive');
    }
    
    this.log(`✓ Hormones mises à jour:`);
    this.log(`  Dopamine: ${state.dopamine.toFixed(2)} → ${newState.dopamine.toFixed(2)}`);
    this.log(`  Sérotonine: ${state.serotonine.toFixed(2)} → ${newState.serotonine.toFixed(2)}`);
    this.log(`  Cortisol: ${state.cortisol.toFixed(2)} → ${newState.cortisol.toFixed(2)}`);
    this.log(`  Ocytocine: ${state.ocytcine.toFixed(2)} → ${newState.ocytcine.toFixed(2)}`);

    // Test scénario négatif
    const resultatNeg = { valence: -0.6, surprise: false };
    const state2 = { dopamine: 0.5, serotonine: 0.5, cortisol: 0.3, ocytocine: 0.4 };
    const newState2 = hormonesUpdate(state2, resultatNeg, 0.5);
    
    if (newState2.cortisol <= state2.cortisol) {
      throw new Error('Cortisol devrait augmenter avec valence négative');
    }
    this.log('✓ Réponse hormonale négative OK');
  }

  // Tests Attention
  private async testAttention(): Promise<void> {
    this.log('Test focus attentionnel...');
    
    const items = [
      { id: '1', contenu: 'idée principale', pertinence: 0.9 },
      { id: '2', contenu: 'détail important', pertinence: 0.8 },
      { id: '3', contenu: 'information secondaire', pertinence: 0.5 },
      { id: '4', contenu: 'bruit de fond', pertinence: 0.3 },
      { id: '5', contenu: 'autre idée', pertinence: 0.7 },
      { id: '6', contenu: 'élément ancien', pertinence: 0.6, age: 10000 }
    ];

    const focus = attentionFocus(items, 4);
    
    if (focus.length > 5) {
      throw new Error('Capacité maximale dépassée');
    }
    
    if (focus.length === 0) {
      throw new Error('Aucun élément dans le focus');
    }

    this.log(`✓ Focus attentionnel: ${focus.length}/${items.length} éléments`);
    focus.forEach((item, i) => {
      this.log(`  ${i + 1}. ${item.contenu} (pertinence: ${item.pertinence})`);
    });

    // Test interférence
    const itemsSimilaires = [
      { id: 'a', contenu: 'concept A', pertinence: 0.8 },
      { id: 'b', contenu: 'concept A similaire', pertinence: 0.75 },
      { id: 'c', contenu: 'concept B différent', pertinence: 0.7 }
    ];

    const focusInterference = attentionFocus(itemsSimilaires, 3);
    this.log('✓ Interférence gérée correctement');
  }

  // Tests Theory of Mind
  private async testTheoryOfMind(): Promise<void> {
    this.log('Test inférence état mental utilisateur...');
    
    const message1 = "Je pense que la philosophie est importante, mais je ne suis pas sûr de comprendre Spinoza.";
    const state1 = inferUserState(message1, null);
    
    if (!state1.croyances || state1.croyances.length === 0) {
      throw new Error('Croyances non détectées');
    }
    
    this.log(`✓ Croyances détectées: ${state1.croyances.length}`);
    state1.croyances.forEach(c => {
      this.log(`  - "${c.contenu}" (confiance: ${c.confiance.toFixed(2)})`);
    });

    if (!state1.intentions || state1.intentions.length === 0) {
      throw new Error('Intentions non détectées');
    }
    
    this.log(`✓ Intentions détectées: ${state1.intentions.join(', ')}`);
    this.log(`✓ État émotionnel: valence=${state1.etatEmotionnel.valence.toFixed(2)}, arousal=${state1.etatEmotionnel.arousal.toFixed(2)}`);

    // Test mise à jour état
    const message2 = "Merci, ça va mieux maintenant!";
    const state2 = inferUserState(message2, state1);
    
    if (state2.etatEmotionnel.valence <= state1.etatEmotionnel.valence) {
      throw new Error('Valence devrait augmenter avec message positif');
    }
    this.log('✓ Mise à jour état émotionnel OK');
  }

  // Tests Spontaneity
  private async testSpontaneity(): Promise<void> {
    this.log('Test détection spontanéité...');
    
    const context = {
      dernierMessageUtilisateur: Date.now() - 10000,
      dernierMessageSysteme: Date.now() - 15000,
      engagementUtilisateur: 0.7,
      sujetsRecents: ['philosophie', 'conscience']
    };

    const mentalState: UserMentalState = {
      croyances: [{ contenu: "L'utilisateur cherche à comprendre", confiance: 0.8 }],
      intentions: ['seeking_info'],
      etatEmotionnel: { valence: 0.3, arousal: 0.5, stabilite: 0.6 },
      confiance: 0.6,
      engagement: 0.7
    };

    const spontaneity = detectSpontaneity(context, mentalState);
    
    this.log(`✓ Spontanéité évaluée:`);
    this.log(`  Peut intervenir: ${spontaneity.peutIntervenir}`);
    this.log(`  Type suggéré: ${spontaneity.typeSuggere || 'aucun'}`);
    this.log(`  Délai recommandé: ${spontaneity.delaiRecommande}ms`);

    // Test avec faible engagement
    context.engagementUtilisateur = 0.2;
    const spontaneityLow = detectSpontaneity(context, mentalState);
    
    if (spontaneityLow.peutIntervenir && spontaneityLow.delaiRecommande < 30000) {
      this.log('⚠️ Attention: intervention peut-être trop fréquente avec faible engagement');
    } else {
      this.log('✓ Inhibition correcte avec faible engagement');
    }
  }

  // Tests Guardrail Validator
  private async testGuardrail(): Promise<void> {
    this.log('Test validation citations...');
    
    const souvenirsDisponibles: Souvenir[] = [
      {
        id: 'mem1',
        contenu: "Nous avons discuté de Spinoza hier",
        valence: 0.6,
        arousal: 0.4,
        timestamp: Date.now() - 86400000,
        tags: ['philosophie', 'Spinoza'],
        type: 'episodique'
      }
    ];

    // Test 1: Citation valide
    this.log('Test citation valide...');
    const responseValide = "Comme nous en avons discuté hier à propos de Spinoza...";
    const validation1 = await validateCitations(responseValide, souvenirsDisponibles);
    
    if (!validation1.valide) {
      this.log(`⚠️ Faux positif: ${validation1.raison}`);
    } else {
      this.log('✓ Citation valide acceptée');
    }

    // Test 2: Hallucination détectée
    this.log('Test détection hallucination...');
    const responseHallucination = "Tu te rappelles quand nous avons parlé de Descartes la semaine dernière sous la pluie?";
    const validation2 = await validateCitations(responseHallucination, souvenirsDisponibles);
    
    if (validation2.valide) {
      throw new Error('Hallucination non détectée');
    }
    this.log(`✓ Hallucination détectée: ${validation2.raison}`);

    // Test 3: Pas de citation (OK)
    this.log('Test réponse sans citation...');
    const responseSansCitation = "La philosophie de Spinoza est fascinante.";
    const validation3 = await validateCitations(responseSansCitation, souvenirsDisponibles);
    
    if (!validation3.valide) {
      throw new Error('Réponse générale incorrectement rejetée');
    }
    this.log('✓ Réponse sans citation acceptée');
  }

  // Tests Sleep/Wake Cycle
  private async testSleepWakeCycle(): Promise<void> {
    this.log('Test cycle veille/sommeil...');
    
    const system = this.engine as any;
    
    // Simuler passage en mode sommeil
    this.log('Simulation passage en mode sommeil...');
    system.etatSommeil = true;
    
    // Vérifier que les paramètres changent
    const tauxPromotionVeille = system.tauxPromotionVecteurGraphe;
    system.hormonesUpdate(); // Force update
    
    if (!system.etatSommeil) {
      throw new Error('État sommeil non activé');
    }
    
    this.log('✓ Mode sommeil activé');
    this.log(`  Taux promotion: ${system.tauxPromotionVecteurGraphe.toFixed(3)}`);
    this.log(`  Decay rate: ${system.decayRate.toFixed(3)}`);

    // Retour à l'état veille
    system.etatSommeil = false;
    system.hormonesUpdate();
    this.log('✓ Retour mode veille');
  }

  // Tests Memory Types
  private async testMemoryTypes(): Promise<void> {
    this.log('Test séparation mémoires...');
    
    const system = this.engine as any;
    
    // Ajouter souvenir épisodique
    const souvenirEpisodique: Souvenir = {
      id: 'epi1',
      contenu: "Hier j'ai mangé une pomme",
      valence: 0.5,
      arousal: 0.3,
      timestamp: Date.now(),
      tags: ['nourriture'],
      type: 'episodique'
    };

    // Ajouter souvenir sémantique
    const souvenirSemantique: Souvenir = {
      id: 'sem1',
      contenu: "Les pommes sont des fruits",
      valence: 0.0,
      arousal: 0.1,
      timestamp: Date.now(),
      tags: ['nourriture', 'fait'],
      type: 'sémantique'
    };

    system.ajouterSouvenir(souvenirEpisodique);
    system.ajouterSouvenir(souvenirSemantique);
    
    this.log('✓ Souvenirs ajoutés');
    
    // Tester récupération séparée
    const episodiques = system.getSouvenirsParType('episodique');
    const semantiques = system.getSouvenirsParType('sémantique');
    
    if (episodiques.length === 0) {
      throw new Error('Mémoire épisodique vide');
    }
    if (semantiques.length === 0) {
      throw new Error('Mémoire sémantique vide');
    }
    
    this.log(`✓ Mémoire épisodique: ${episodiques.length} souvenirs`);
    this.log(`✓ Mémoire sémantique: ${semantiques.length} souvenirs`);
  }

  // Tests Habits
  private async testHabits(): Promise<void> {
    this.log('Test système d\'habitudes...');
    
    const system = this.engine as any;
    
    // Simuler répétition d'action
    for (let i = 0; i < 5; i++) {
      system.enregistrerAction('saluer', 'Bonjour!');
    }
    
    const habitudes = system.getHabitudes();
    
    if (habitudes.length === 0) {
      throw new Error('Aucune habitude détectée');
    }
    
    const habitudeSalutation = habitudes.find((h: any) => h.trigger === 'saluer');
    
    if (!habitudeSalutation) {
      throw new Error('Habitude de salutation non créée');
    }
    
    this.log(`✓ Habitudes détectées: ${habitudes.length}`);
    this.log(`  Habitude dominante: "${habitudeSalutation.trigger}" (force: ${habitudeSalutation.force.toFixed(2)})`);
  }

  // Run all tests
  public async runAllTests(): Promise<DebugResult[]> {
    this.log('🚀 Démarrage suite de tests complète');
    this.results = [];
    this.globalLogs = [];

    const tests = [
      { name: 'VectorSearch', fn: () => this.testVectorSearch() },
      { name: 'GraphPondration', fn: () => this.testGraphPondration() },
      { name: 'Hormones', fn: () => this.testHormones() },
      { name: 'Attention', fn: () => this.testAttention() },
      { name: 'TheoryOfMind', fn: () => this.testTheoryOfMind() },
      { name: 'Spontaneity', fn: () => this.testSpontaneity() },
      { name: 'Guardrail', fn: () => this.testGuardrail() },
      { name: 'SleepWakeCycle', fn: () => this.testSleepWakeCycle() },
      { name: 'MemoryTypes', fn: () => this.testMemoryTypes() },
      { name: 'Habits', fn: () => this.testHabits() }
    ];

    for (const test of tests) {
      await this.runTest(test.name, test.fn);
    }

    // Résumé
    const passed = this.results.filter(r => r.status === 'PASS').length;
    const failed = this.results.filter(r => r.status === 'FAIL').length;
    const warnings = this.results.filter(r => r.status === 'WARN').length;

    this.log('📊 Résultats des tests:');
    this.log(`  ✅ Passés: ${passed}`);
    this.log(`  ❌ Échoués: ${failed}`);
    this.log(`  ⚠️  Avertissements: ${warnings}`);
    this.log(`  📈 Total: ${this.results.length}`);

    if (failed > 0) {
      this.log('⚠️  Certains tests ont échoué. Vérifiez les logs ci-dessus.');
    } else {
      this.log('🎉 Tous les tests sont passés avec succès!');
    }

    return this.results;
  }

  // Get full debug log
  public getFullLog(): string {
    return this.globalLogs.join('\n');
  }

  // Get results summary
  public getResultsSummary(): {
    total: number;
    passed: number;
    failed: number;
    warnings: number;
    results: DebugResult[];
  } {
    return {
      total: this.results.length,
      passed: this.results.filter(r => r.status === 'PASS').length,
      failed: this.results.filter(r => r.status === 'FAIL').length,
      warnings: this.results.filter(r => r.status === 'WARN').length,
      results: this.results
    };
  }
}

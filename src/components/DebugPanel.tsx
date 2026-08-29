import { useState } from "react";
import { useSystem } from "../engine/system";
import { DebugSuite, DebugResult } from "../engine/debugSuite";
import { Btn, Panel, Tag } from "./ui";

export default function DebugPanel({ delay }: { delay: number }) {
  const system = useSystem();
  const [results, setResults] = useState<DebugResult[] | null>(null);
  const [running, setRunning] = useState(false);
  const [expandedTest, setExpandedTest] = useState<string | null>(null);
  const [showLogs, setShowLogs] = useState(false);

  const runDebug = async () => {
    setRunning(true);
    setResults(null);
    setShowLogs(false);
    
    try {
      // Créer une instance de DebugSuite avec le système actuel
      // Note: on passe un objet mocké car useSystem retourne un état React
      const debugSuite = new (window as any).DebugSuite(system);
      const debugResults = await debugSuite.runAllTests();
      setResults(debugResults);
    } catch (e) {
      console.error("Erreur pendant le debug:", e);
    } finally {
      setRunning(false);
    }
  };

  const getSummary = () => {
    if (!results) return { total: 0, passed: 0, failed: 0, warnings: 0 };
    return {
      total: results.length,
      passed: results.filter(r => r.status === 'PASS').length,
      failed: results.filter(r => r.status === 'FAIL').length,
      warnings: results.filter(r => r.status === 'WARN').length,
    };
  };

  const summary = getSummary();
  const allPassed = summary.failed === 0 && summary.total > 0;

  return (
    <div className="grid gap-3">
      {/* Panel principal */}
      <Panel
        title="Debug Complet - Tests Fonctions"
        file="debugSuite.ts"
        delay={delay}
        right={
          <>
            {results && (
              <Tag tone={allPassed ? "pos" : summary.failed > 0 ? "neg" : "neu"}>
                {summary.passed}/{summary.total} tests{summary.warnings > 0 ? ` (${summary.warnings} ⚠️)` : ''}
              </Tag>
            )}
            <Btn onClick={runDebug} variant="solid" disabled={running} className="!py-1 !text-[11.5px]">
              {running ? "exécution..." : results ? "⟳ relancer debug" : "▶ lancer debug complet"}
            </Btn>
          </>
        }
      >
        <div className="px-4 py-4">
          {!results && !running && (
            <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-2.5">
              {[
                { name: 'VectorSearch', desc: 'Encodage & similarité' },
                { name: 'GraphPondration', desc: 'Noeuds & connexions' },
                { name: 'Hormones', desc: 'Dopamine & cortisol' },
                { name: 'Attention', desc: 'Focus & interférence' },
                { name: 'TheoryOfMind', desc: 'Croyances & intentions' },
                { name: 'Spontaneity', desc: 'Interventions auto' },
                { name: 'Guardrail', desc: 'Validation citations' },
                { name: 'SleepWake', desc: 'Cycle veille/sommeil' },
                { name: 'MemoryTypes', desc: 'Épisodique vs sémantique' },
                { name: 'Habits', desc: 'Mémoire procédurale' }
              ].map((module, i) => (
                <div 
                  key={module.name} 
                  className="anim-in border border-[var(--line)] bg-[var(--ink2)] px-3 py-2.5 flex flex-col gap-1" 
                  style={{ animationDelay: `${delay + i * 70}ms` }}
                >
                  <div className="flex items-center gap-2">
                    <span className="w-1.5 h-1.5 rounded-full bg-[var(--line2)] shrink-0" />
                    <span className="mono text-[11.5px] text-[var(--mut)]">{module.name}</span>
                  </div>
                  <span className="mono text-[9.5px] text-[var(--dim)] ml-3.5">{module.desc}</span>
                </div>
              ))}
            </div>
          )}

          {running && (
            <div className="flex flex-col items-center gap-4 py-8">
              <div className="flex gap-1">
                {[0, 1, 2, 3, 4].map((i) => (
                  <span 
                    key={i} 
                    className="typing-dot inline-block w-2 h-2 rounded-full bg-[var(--neu)] animate-bounce" 
                    style={{ animationDelay: `${i * 150}ms` }}
                  />
                ))}
              </div>
              <div className="space-y-2 text-center">
                <p className="mono text-[12px] text-[var(--neu)] font-semibold">Exécution des tests en cours...</p>
                <p className="mono text-[10.5px] text-[var(--dim)]">Chaque fonction est testée individuellement</p>
              </div>
              <div className="w-full max-w-md bg-[var(--ink2)] rounded-full h-1.5 overflow-hidden mt-2">
                <div className="h-full bg-[var(--neu)] animate-pulse" style={{ width: '60%' }} />
              </div>
            </div>
          )}

          {results && (
            <div className="space-y-3 anim-in">
              {/* Résumé global */}
              <div className={`border rounded-lg p-3 mb-4 ${
                allPassed 
                  ? 'border-[var(--pos)]/30 bg-[var(--pos)]/5' 
                  : summary.failed > 0 
                    ? 'border-[var(--neg)]/30 bg-[var(--neg)]/5' 
                    : 'border-[var(--neu)]/30 bg-[var(--neu)]/5'
              }`}>
                <div className="flex items-center justify-between flex-wrap gap-2">
                  <div className="flex items-center gap-3">
                    <span className={`text-2xl ${allPassed ? '' : summary.failed > 0 ? 'text-[var(--neg)]' : 'text-[var(--neu)]'}`}>
                      {allPassed ? '🎉' : summary.failed > 0 ? '⚠️' : '✅'}
                    </span>
                    <div>
                      <p className="font-display text-[13px] font-bold uppercase tracking-[0.08em]">
                        {allPassed ? 'Tous les tests passés' : summary.failed > 0 ? 'Certains tests ont échoué' : 'Tests complétés'}
                      </p>
                      <p className="mono text-[10.5px] text-[var(--dim)] mt-0.5">
                        {summary.total} tests · {summary.passed} réussis · {summary.failed} échoués · {summary.warnings} avertissements
                      </p>
                    </div>
                  </div>
                  <button
                    onClick={() => setShowLogs(!showLogs)}
                    className="mono text-[10.5px] px-3 py-1.5 border border-[var(--line)] bg-[var(--ink2)] hover:bg-[var(--ink2)]/70 rounded transition-colors"
                  >
                    {showLogs ? 'masquer logs' : 'voir logs complets'}
                  </button>
                </div>
              </div>

              {/* Détails par test */}
              <div className="space-y-2">
                {results.map((result, idx) => (
                  <div 
                    key={result.testName}
                    className={`border rounded-lg overflow-hidden transition-all ${
                      result.status === 'PASS' 
                        ? 'border-[var(--pos)]/20 bg-[var(--pos)]/5' 
                        : result.status === 'FAIL'
                          ? 'border-[var(--neg)]/30 bg-[var(--neg)]/5'
                          : 'border-[var(--neu)]/20 bg-[var(--neu)]/5'
                    }`}
                  >
                    {/* En-tête du test */}
                    <button
                      onClick={() => setExpandedTest(expandedTest === result.testName ? null : result.testName)}
                      className="w-full px-3 py-2.5 flex items-center justify-between hover:bg-[var(--ink2)]/50 transition-colors"
                    >
                      <div className="flex items-center gap-2.5">
                        <span className={`mono text-[11px] font-semibold ${
                          result.status === 'PASS' ? 'text-[var(--pos)]' : 
                          result.status === 'FAIL' ? 'text-[var(--neg)]' : 'text-[var(--neu)]'
                        }`}>
                          {result.status === 'PASS' ? '✓' : result.status === 'FAIL' ? '✗' : '⚠️'}
                        </span>
                        <span className="font-display text-[11.5px] font-bold uppercase tracking-[0.06em] text-[var(--text)]">
                          {result.testName}
                        </span>
                        <span className="mono text-[9.5px] text-[var(--dim)]">
                          {result.duration.toFixed(1)}ms
                        </span>
                      </div>
                      <span className={`mono text-[9.5px] px-2 py-0.5 rounded ${
                        result.status === 'PASS' ? 'bg-[var(--pos)]/20 text-[var(--pos)]' : 
                        result.status === 'FAIL' ? 'bg-[var(--neg)]/20 text-[var(--neg)]' : 
                        'bg-[var(--neu)]/20 text-[var(--neu)]'
                      }`}>
                        {result.status}
                      </span>
                    </button>

                    {/* Détails expandables */}
                    {expandedTest === result.testName && (
                      <div className="border-t border-[var(--line)]/50 px-3 py-2.5 bg-[var(--ink2)]/30">
                        {result.error && (
                          <div className="mb-2 p-2 bg-[var(--neg)]/10 border border-[var(--neg)]/20 rounded">
                            <p className="mono text-[10.5px] text-[var(--neg)]">{result.error}</p>
                          </div>
                        )}
                        
                        {result.logs.length > 0 && (
                          <div className="space-y-1">
                            <p className="mono text-[9.5px] text-[var(--dim)] uppercase tracking-[0.08em] mb-1">Logs:</p>
                            <div className="max-h-48 overflow-y-auto space-y-0.5">
                              {result.logs.map((log, i) => (
                                <p key={i} className="mono text-[10px] text-[var(--mut)] truncate">
                                  {log}
                                </p>
                              ))}
                            </div>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                ))}
              </div>

              {/* Logs complets */}
              {showLogs && (
                <div className="mt-4 border border-[var(--line)] bg-[var(--ink2)] rounded-lg p-3">
                  <div className="flex items-center justify-between mb-2">
                    <p className="mono text-[10.5px] text-[var(--dim)] uppercase tracking-[0.08em]">Logs globaux du debug</p>
                    <button
                      onClick={() => {
                        const logs = results.flatMap(r => r.logs).join('\n');
                        navigator.clipboard.writeText(logs);
                      }}
                      className="mono text-[9.5px] px-2 py-1 border border-[var(--line)] bg-[var(--ink)] hover:bg-[var(--ink2)] rounded transition-colors"
                    >
                      copier
                    </button>
                  </div>
                  <div className="max-h-64 overflow-y-auto bg-[var(--ink)] rounded p-2 font-mono text-[9.5px] text-[var(--mut)]">
                    {results.flatMap(r => r.logs).map((log, i) => (
                      <div key={i} className="py-0.5 border-b border-[var(--line)]/30 last:border-0">
                        {log}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Footer */}
              <p className="mono text-[10.5px] text-[var(--dim)] border-t border-[var(--line)]/60 pt-3 mt-4">
                Debug exécuté à {new Date().toLocaleTimeString('fr-FR')} · 
                {allPassed ? ' Système opérationnel' : summary.failed > 0 ? ' Vérifiez les erreurs ci-dessus' : ' Certains tests nécessitent attention'}
              </p>
            </div>
          )}
        </div>
      </Panel>
    </div>
  );
}

// ── guardrail/validator.ts : Pipeline de validation à 2 agents ───────────────
// Vérifie que les souvenirs cités par le LLM existent réellement dans le RAG
// avant d'afficher la réponse. Utilise un petit modèle rapide pour la validation.

import type { Souvenir } from "../types";

export interface ValidationConfig {
  enabled: boolean;
  provider: "simule" | "ollama" | "none";
  model?: string; // pour ollama, ex: "gemma2:2b"
  endpoint?: string; // pour ollama
  timeoutMs: number;
  maxLatencyAcceptable: number; // latence max acceptable en ms
}

export interface ValidationResult {
  valid: boolean;
  citedSouvenirs: string[];
  invalidCitations: string[];
  correctedText?: string;
  latencyMs: number;
  providerUsed: "simule" | "ollama" | "none";
}

const DEFAULT_CONFIG: ValidationConfig = {
  enabled: false,
  provider: "simule",
  timeoutMs: 3000,
  maxLatencyAcceptable: 1500,
};

/**
 * Extrait les citations potentielles de souvenirs du texte généré
 * Patterns: "tu m'as dit...", "je me souviens...", "la dernière fois...", etc.
 */
function extractCitations(text: string): string[] {
  const citations: string[] = [];
  
  // Pattern 1: citations directes entre guillemets après des marqueurs temporels
  const patterns = [
    /(?:tu m'as (?:dit|parlé|raconté|expliqué|confié|montré)[^:]*):\s*[«"]([^»"]+)[»"]/gi,
    /(?:je me souviens|(?:la )?dernière fois|rappelle-toi|rappel-toi|souviens-toi)[^:]*:\s*[«"]([^»"]+)[»"]/gi,
    /(?:comme tu (?:l'|la |le )?(?:as |avais )?dit|comme (?:tu |vous )?(?:me |nous )?l'?as? (?:dit|expliqué))[^:]*:\s*[«"]([^»"]+)[»"]/gi,
    /(?:lorsque tu (?:m'as |t'[a] |t'avais )[^(?:dit|parlé|raconté)]+)/gi,
    /"[^"]{10,200}"/g, // citations génériques entre guillemets (10-200 chars)
    /[«][^»]{10,200}[»]/g, // citations françaises
  ];
  
  for (const pattern of patterns) {
    let match;
    while ((match = pattern.exec(text)) !== null) {
      const citation = match[1] || match[0].replace(/[«»"]/g, '').trim();
      if (citation.length > 8 && !citations.includes(citation)) {
        citations.push(citation);
      }
    }
  }
  
  return citations.slice(0, 5); // max 5 citations
}

/**
 * Vérifie si une citation correspond à un souvenir existant (similarité textuelle simple)
 */
function checkCitationExists(citation: string, souvenirs: Souvenir[]): { exists: boolean; match?: Souvenir } {
  const citationNorm = citation.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim();
  const words = citationNorm.split(/\s+/).filter(w => w.length > 3);
  
  for (const s of souvenirs) {
    const souvenirNorm = s.texte.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
    
    // Vérification exacte (substring)
    if (souvenirNorm.includes(citationNorm) || citationNorm.includes(souvenirNorm)) {
      return { exists: true, match: s };
    }
    
    // Vérification par mots-clés significatifs (au moins 60% des mots importants)
    if (words.length >= 3) {
      const matches = words.filter(w => souvenirNorm.includes(w)).length;
      if (matches / words.length >= 0.6) {
        return { exists: true, match: s };
      }
    }
  }
  
  return { exists: false };
}

/**
 * Version simulée ultra-rapide (pas de latence)
 * Utilise une heuristique simple pour valider les citations
 */
function validateSimulated(text: string, souvenirs: Souvenir[], config: ValidationConfig): ValidationResult {
  const start = Date.now();
  const citations = extractCitations(text);
  const invalidCitations: string[] = [];
  const validCitations: string[] = [];
  
  for (const citation of citations) {
    const result = checkCitationExists(citation, souvenirs);
    if (result.exists) {
      validCitations.push(citation);
    } else {
      invalidCitations.push(citation);
    }
  }
  
  const latencyMs = Date.now() - start;
  
  // Correction simple : supprimer les citations invalides
  let correctedText = text;
  if (invalidCitations.length > 0) {
    for (const invalid of invalidCitations) {
      // Remplacer la citation invalide par une formulation générique
      const escaped = invalid.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const patterns = [
        new RegExp(`[«"]${escaped}[»"]`, 'g'),
        new RegExp(`: ${escaped}`, 'g'),
      ];
      for (const p of patterns) {
        correctedText = correctedText.replace(p, "[souvenir non vérifié]");
      }
    }
  }
  
  return {
    valid: invalidCitations.length === 0,
    citedSouvenirs: validCitations,
    invalidCitations,
    correctedText: invalidCitations.length > 0 ? correctedText : undefined,
    latencyMs,
    providerUsed: "simule",
  };
}

/**
 * Version avec petit modèle Ollama (ex: Gemma 2B)
 * Envoie le texte et les souvenirs au modèle pour validation
 */
async function validateWithOllama(
  text: string,
  souvenirs: Souvenir[],
  config: ValidationConfig
): Promise<ValidationResult> {
  const start = Date.now();
  const citations = extractCitations(text);
  
  if (!config.endpoint || !config.model) {
    return {
      valid: true,
      citedSouvenirs: citations,
      invalidCitations: [],
      latencyMs: 0,
      providerUsed: "none",
    };
  }
  
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), config.timeoutMs);
  
  try {
    // Construire le prompt de validation
    const souvenirsList = souvenirs
      .slice(-20) // derniers 20 souvenirs pour ne pas saturer
      .map((s, i) => `[${i + 1}] "${s.texte}"`)
      .join("\n");
    
    const prompt = `Tu es un validateur de citations. Ta tâche est de vérifier si les citations de souvenirs dans le texte suivant correspondent réellement aux souvenirs fournis.

SOUVENIRS DISPONIBLES:
${souvenirsList || "AUCUN SOUVENIR"}

TEXTE À VALIDER:
"${text}"

CITATIONS TROUVÉES:
${citations.length > 0 ? citations.map((c, i) => `[${i + 1}] "${c}"`).join("\n") : "AUCUNE CITATION"}

Réponds UNIQUEMENT avec ce format JSON:
{
  "valid": true/false,
  "invalid_citations": ["citation1", "citation2"],
  "corrected_text": "texte corrigé sans les citations invalides"
}

Règles:
- Une citation est valide si elle correspond (exactement ou partiellement) à un souvenir disponible
- Si aucune citation, valid=true
- Si citations invalides, les remplacer par "[souvenir non vérifié]"`;

    const response = await fetch(`${config.endpoint.replace(/\/$/, "")}/api/generate`, {
      method: "POST",
      signal: controller.signal,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model: config.model,
        prompt: prompt,
        stream: false,
        options: { temperature: 0.1, num_predict: 300 },
      }),
    });
    
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }
    
    const data = await response.json();
    const content = data.response || "";
    
    // Parser la réponse JSON
    let result: { valid: boolean; invalid_citations?: string[]; corrected_text?: string } = { valid: true };
    try {
      const jsonMatch = content.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        result = JSON.parse(jsonMatch[0]);
      }
    } catch {
      // Fallback sur validation simulée en cas d'erreur de parsing
      return validateSimulated(text, souvenirs, config);
    }
    
    const latencyMs = Date.now() - start;
    
    return {
      valid: result.valid,
      citedSouvenirs: citations.filter(c => !result.invalid_citations?.includes(c)),
      invalidCitations: result.invalid_citations || [],
      correctedText: result.corrected_text,
      latencyMs,
      providerUsed: "ollama",
    };
  } catch (error) {
    clearTimeout(timeout);
    // Fallback sur validation simulée en cas d'erreur
    return validateSimulated(text, souvenirs, config);
  } finally {
    clearTimeout(timeout);
  }
}

/**
 * Fonction principale de validation
 */
export async function validateResponse(
  text: string,
  souvenirs: Souvenir[],
  config: ValidationConfig = DEFAULT_CONFIG
): Promise<ValidationResult> {
  if (!config.enabled) {
    return {
      valid: true,
      citedSouvenirs: [],
      invalidCitations: [],
      latencyMs: 0,
      providerUsed: "none",
    };
  }
  
  if (config.provider === "ollama") {
    return validateWithOllama(text, souvenirs, config);
  }
  
  return validateSimulated(text, souvenirs, config);
}

export function getValidationConfig(): ValidationConfig {
  return DEFAULT_CONFIG;
}

export function validationSummary(config: ValidationConfig): string {
  if (!config.enabled) return "désactivé";
  return `${config.provider}${config.model ? ` (${config.model})` : ""} · max ${config.maxLatencyAcceptable}ms`;
}

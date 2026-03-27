/**
 * Text Classifier Service
 * Runs MobileBERT inference for textual scam intent detection
 * 
 * Detects semantic patterns: urgency, financial requests, coercion
 */

import { TensorflowModel } from 'react-native-fast-tflite';
import {
  TextAnalysisResult,
  ScamPattern,
  ScamPatternType,
  DEFAULT_MODEL_CONFIG
} from './types';
import { getTextModel, loadTextModel } from './ModelLoaderService';
import { encodeForModel, detectHomoglyphs, normalizeForTokenization } from './TextTokenizer';

// Risk score thresholds
const LOW_RISK_THRESHOLD = 0.3;
const MEDIUM_RISK_THRESHOLD = 0.6;
const HIGH_RISK_THRESHOLD = 0.8;

/**
 * Pattern detection rules for heuristic analysis
 * Used alongside ML model for robust detection
 */
const SCAM_PATTERNS: Array<{
  type: ScamPatternType;
  patterns: RegExp[];
  weight: number;
}> = [
  {
    type: ScamPatternType.URGENCY,
    patterns: [
      /\b(urgent|immediately|asap|right now|within \d+ (hour|minute)|act fast|limited time|expires? (today|soon|in \d+))\b/i,
      /\b(hurry|don't wait|last chance|final notice|immediate action)\b/i,
      /!{2,}/g, // Multiple exclamation marks
    ],
    weight: 0.3,
  },
  {
    type: ScamPatternType.FINANCIAL_REQUEST,
    patterns: [
      /\b(wire transfer|send money|bank account|routing number|payment|bitcoin|crypto|gift card)\b/i,
      /\b(fees?|tax|pay|amount|\$\d+|\d+ dollars?|funds?)\b/i,
      /\b(western union|moneygram|zelle|venmo|cash app|paypal)\b/i,
    ],
    weight: 0.4,
  },
  {
    type: ScamPatternType.COERCION,
    patterns: [
      /\b(arrested|jail|police|lawsuit|legal action|court|warrant)\b/i,
      /\b(suspended|terminated|deleted|disabled|blocked|banned)\b/i,
      /\b(failure to|unless you|or else|consequences)\b/i,
    ],
    weight: 0.35,
  },
  {
    type: ScamPatternType.IMPERSONATION,
    patterns: [
      /\b(irs|social security|medicare|fbi|doj|department of|government|official)\b/i,
      /\b(apple|google|microsoft|amazon|facebook|meta|netflix|paypal|bank of|wells fargo|chase)\b/i,
      /\b(customer service|support team|security team|fraud department)\b/i,
    ],
    weight: 0.35,
  },
  {
    type: ScamPatternType.SUSPICIOUS_LINK,
    patterns: [
      /https?:\/\/[^\s]+/gi, // Any URL
      /\b(click here|click below|click this link|tap to|verify at)\b/i,
      /bit\.ly|tinyurl|goo\.gl|t\.co|shorturl/i, // URL shorteners
    ],
    weight: 0.25,
  },
  {
    type: ScamPatternType.PERSONAL_INFO_REQUEST,
    patterns: [
      /\b(ssn|social security number|date of birth|dob|mother'?s? maiden|password|pin|cvv)\b/i,
      /\b(verify your|confirm your|update your) (identity|account|information|details)\b/i,
      /\b(credit card|debit card|account number|login credential)\b/i,
    ],
    weight: 0.4,
  },
  {
    type: ScamPatternType.TOO_GOOD_TO_BE_TRUE,
    patterns: [
      /\b(congratulations|you('ve)? won|winner|selected|lucky)\b/i,
      /\b(prize|reward|lottery|jackpot|inheritance|million|billion)\b/i,
      /\b(free|no cost|guaranteed|100%|risk.?free)\b/i,
    ],
    weight: 0.35,
  },
  {
    type: ScamPatternType.HOMOGLYPH_ATTACK,
    patterns: [], // Handled separately
    weight: 0.5,
  },
];

/**
 * Detect scam patterns using rule-based heuristics
 */
export function detectPatterns(text: string): ScamPattern[] {
  const patterns: ScamPattern[] = [];
  const normalizedText = normalizeForTokenization(text);
  
  // Check for homoglyph attacks
  if (detectHomoglyphs(text)) {
    patterns.push({
      type: ScamPatternType.HOMOGLYPH_ATTACK,
      confidence: 0.9,
      matchedText: 'Suspicious Unicode characters detected',
    });
  }
  
  // Check each pattern category
  for (const category of SCAM_PATTERNS) {
    if (category.type === ScamPatternType.HOMOGLYPH_ATTACK) continue;
    
    let matchCount = 0;
    const matchedTexts: string[] = [];
    
    for (const pattern of category.patterns) {
      const matches = normalizedText.match(pattern);
      if (matches) {
        matchCount += matches.length;
        matchedTexts.push(...matches.slice(0, 3)); // Keep first 3 matches
      }
    }
    
    if (matchCount > 0) {
      // Confidence based on number of matches
      const confidence = Math.min(0.95, 0.3 + matchCount * 0.15);
      
      patterns.push({
        type: category.type,
        confidence,
        matchedText: matchedTexts.join(', '),
      });
    }
  }
  
  return patterns;
}

/**
 * Calculate heuristic risk score from detected patterns
 */
export function calculateHeuristicScore(patterns: ScamPattern[]): number {
  if (patterns.length === 0) return 0;
  
  // Find weights for each pattern type
  const patternWeights = new Map(
    SCAM_PATTERNS.map(p => [p.type, p.weight])
  );
  
  // Calculate weighted sum
  let totalWeight = 0;
  let weightedSum = 0;
  
  for (const pattern of patterns) {
    const weight = patternWeights.get(pattern.type) || 0.2;
    weightedSum += pattern.confidence * weight;
    totalWeight += weight;
  }
  
  // Normalize and apply diminishing returns for multiple patterns
  const baseScore = totalWeight > 0 ? weightedSum / totalWeight : 0;
  const patternBonus = Math.min(0.3, patterns.length * 0.05); // Bonus for multiple patterns
  
  return Math.min(1.0, baseScore + patternBonus);
}

/**
 * Softmax helper for converting logits to probabilities
 */
function softmax(logits: number[]): number[] {
  const maxLogit = Math.max(...logits);
  const exps = logits.map(l => Math.exp(l - maxLogit)); // subtract max for numerical stability
  const sumExps = exps.reduce((a, b) => a + b, 0);
  return exps.map(e => e / sumExps);
}

/**
 * Run text classification with ML model
 *
 * V3 Model: MobileBERT TFLite
 * - Inputs: input_ids [1, 128] int32 + attention_mask [1, 128] int32
 * - Output: [1, 2] logits → softmax → [safe_prob, scam_prob]
 */
export async function classifyWithModel(text: string): Promise<number> {
  try {
    let model = getTextModel();
    if (!model) {
      console.log('[TextClassifier] Model not loaded, loading now...');
      model = await loadTextModel();
    }

    // Tokenize and encode (returns both inputIds and attentionMask)
    const { inputIds, attentionMask, tokenCount } = encodeForModel(text);

    // Debug: Log first 20 token IDs to verify tokenization
    const first20Ids = Array.from(inputIds.slice(0, 20));
    console.log('[TextClassifier] Token IDs (first 20):', first20Ids);
    console.log('[TextClassifier] Token count:', tokenCount);

    // Log model input/output tensor info for debugging
    console.log('[TextClassifier] Model inputs:', JSON.stringify(model.inputs));
    console.log('[TextClassifier] Model outputs:', JSON.stringify(model.outputs));

    // Build typed array matching the model's expected input type (int32)
    const inputIdsTyped = new Int32Array(inputIds);

    // Build input array matching model.inputs length
    // TFLite model may have 1 input (input_ids only) or 2 (input_ids + attention_mask)
    const inputArrays: Int32Array[] = [inputIdsTyped];
    if (model.inputs.length >= 2) {
      const attentionMaskTyped = new Int32Array(attentionMask);
      inputArrays.push(attentionMaskTyped);
    }

    // Run TFLite inference — inputs are positional (matching model.inputs order)
    console.log(`[TextClassifier] Running TFLite model inference (${inputArrays.length} input(s))...`);
    const outputs = await model.run(inputArrays);

    // Read output from the first output tensor
    const resultArray = outputs[0] as Float32Array;
    console.log(`[TextClassifier] Raw output (${resultArray.length} values): [${Array.from(resultArray).map(v => Number(v).toFixed(4)).join(', ')}]`);

    if (resultArray.length >= 2) {
      // Two-class output: apply softmax to get scam probability
      const logits = [Number(resultArray[0]), Number(resultArray[1])];
      const probs = softmax(logits);
      const scamProb = probs[1]; // Index 1 = SCAM class

      console.log(`[TextClassifier] TFLite logits: [${logits[0].toFixed(3)}, ${logits[1].toFixed(3)}]`);
      console.log(`[TextClassifier] TFLite probs: safe=${probs[0].toFixed(4)}, scam=${probs[1].toFixed(4)}`);

      return Math.max(0, Math.min(1, scamProb)); // Clamp to 0-1
    } else {
      // Single-output: direct sigmoid/risk score
      const riskScore = Number(resultArray[0]) || 0;
      console.log(`[TextClassifier] Single-output score: ${riskScore.toFixed(4)}`);
      return Math.max(0, Math.min(1, riskScore));
    }
  } catch (error) {
    console.error('[TextClassifier] Model inference failed:', error);
    return -1; // Indicate failure
  }
}

/**
 * Run full text classification
 * Combines ML model results with heuristic pattern detection
 */
export async function classify(text: string): Promise<TextAnalysisResult> {
  const startTime = Date.now();
  
  if (!text || text.trim().length === 0) {
    return {
      riskScore: 0,
      extractedText: '',
      detectedPatterns: [],
      latencyMs: Date.now() - startTime,
    };
  }
  
  console.log(`[TextClassifier] Analyzing text (${text.length} chars)...`);
  
  // Run pattern detection (fast, heuristic-based)
  const patterns = detectPatterns(text);
  const heuristicScore = calculateHeuristicScore(patterns);
  
  console.log(`[TextClassifier] Heuristic score: ${(heuristicScore * 100).toFixed(1)}%`);
  console.log(`[TextClassifier] Detected ${patterns.length} patterns`);
  
  // Run ML model inference
  const modelScore = await classifyWithModel(text);
  
  if (modelScore < 0) {
    // Model failed - this is an error condition, not a fallback
    throw new Error('Text model inference failed - model may not be loaded');
  }
  
  // Combine scores (weighted average)
  // ML model weighted higher as it captures semantic meaning
  const combinedScore = modelScore * 0.6 + heuristicScore * 0.4;
  
  const latencyMs = Date.now() - startTime;
  
  console.log(`[TextClassifier] Model score: ${(modelScore * 100).toFixed(1)}%`);
  console.log(`[TextClassifier] Combined score: ${(combinedScore * 100).toFixed(1)}% in ${latencyMs}ms`);
  
  return {
    riskScore: combinedScore,
    extractedText: text,
    detectedPatterns: patterns,
    latencyMs,
  };
}

/**
 * Quick check if text contains obvious scam indicators
 * Useful for early rejection without full analysis
 */
export function quickScamCheck(text: string): boolean {
  const lowerText = text.toLowerCase();
  
  // High-confidence scam phrases
  const obviousScamPhrases = [
    'send money immediately',
    'wire transfer now',
    'you have won',
    'nigerian prince',
    'claim your prize',
    'irs warrant',
    'arrest warrant',
    'suspended your account',
    'verify immediately or',
    'bitcoin investment guaranteed',
  ];
  
  return obviousScamPhrases.some(phrase => lowerText.includes(phrase));
}

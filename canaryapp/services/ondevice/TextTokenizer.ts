/**
 * Text Tokenizer Service
 * Implements WordPiece tokenization for MobileBERT/BERT models
 * Phase 1: The Digital Lab
 * 
 * This is a lightweight JavaScript implementation suitable for mobile
 * For sequences under 512 tokens, JS performance is acceptable
 */

import { DEFAULT_MODEL_CONFIG } from './types';

// Special tokens
const PAD_TOKEN = '[PAD]';
const UNK_TOKEN = '[UNK]';
const CLS_TOKEN = '[CLS]';
const SEP_TOKEN = '[SEP]';

const PAD_ID = 0;
const UNK_ID = 100;
const CLS_ID = 101;
const SEP_ID = 102;

// Common vocabulary subset for scam detection
// In production, load the full vocab.txt from assets
// This is a minimal vocab for Phase 1 testing
const BASIC_VOCAB: Map<string, number> = new Map([
  [PAD_TOKEN, PAD_ID],
  [UNK_TOKEN, UNK_ID],
  [CLS_TOKEN, CLS_ID],
  [SEP_TOKEN, SEP_ID],
  // Common words for scam detection
  ['urgent', 103],
  ['immediately', 104],
  ['account', 105],
  ['suspended', 106],
  ['verify', 107],
  ['click', 108],
  ['link', 109],
  ['password', 110],
  ['bank', 111],
  ['money', 112],
  ['transfer', 113],
  ['wire', 114],
  ['prize', 115],
  ['winner', 116],
  ['congratulations', 117],
  ['lottery', 118],
  ['free', 119],
  ['offer', 120],
  ['limited', 121],
  ['time', 122],
  ['act', 123],
  ['now', 124],
  ['expire', 125],
  ['confirm', 126],
  ['security', 127],
  ['alert', 128],
  ['warning', 129],
  ['suspended', 130],
  ['locked', 131],
  ['login', 132],
  ['credential', 133],
  ['update', 134],
  ['information', 135],
  ['personal', 136],
  ['social', 137],
  ['ssn', 138],
  ['credit', 139],
  ['card', 140],
  ['payment', 141],
  ['invoice', 142],
  ['due', 143],
  ['overdue', 144],
  ['tax', 145],
  ['irs', 146],
  ['government', 147],
  ['legal', 148],
  ['action', 149],
  ['arrest', 150],
  ['police', 151],
  ['lawsuit', 152],
  ['gift', 153],
  ['reward', 154],
  ['claim', 155],
  ['selected', 156],
  ['exclusive', 157],
  ['deal', 158],
  ['discount', 159],
  ['bitcoin', 160],
  ['crypto', 161],
  ['investment', 162],
  ['profit', 163],
  ['guaranteed', 164],
  ['return', 165],
  ['inherit', 166],
  ['prince', 167],
  ['nigeria', 168],
  ['million', 169],
  ['dollars', 170],
]);

// Full vocabulary will be loaded dynamically
let fullVocab: Map<string, number> | null = null;

/**
 * Load vocabulary from vocab.txt file
 * For Phase 1, we use a basic vocabulary
 */
export async function loadVocabulary(vocabPath?: string): Promise<void> {
  // In Phase 1, use basic vocab
  // In production, load from vocabPath
  fullVocab = BASIC_VOCAB;
  console.log(`[Tokenizer] Loaded vocabulary with ${fullVocab.size} tokens`);
}

/**
 * Get the current vocabulary
 */
function getVocab(): Map<string, number> {
  return fullVocab || BASIC_VOCAB;
}

/**
 * Normalize text for tokenization
 * Handles Unicode normalization and homoglyph detection
 */
export function normalizeForTokenization(text: string): string {
  // Convert to lowercase
  let normalized = text.toLowerCase();
  
  // Normalize Unicode (NFC form)
  normalized = normalized.normalize('NFC');
  
  // Handle common homoglyph attacks (Cyrillic characters that look like Latin)
  const homoglyphMap: Record<string, string> = {
    'а': 'a', // Cyrillic а -> Latin a
    'е': 'e', // Cyrillic е -> Latin e
    'о': 'o', // Cyrillic о -> Latin o
    'р': 'p', // Cyrillic р -> Latin p
    'с': 'c', // Cyrillic с -> Latin c
    'у': 'y', // Cyrillic у -> Latin y
    'х': 'x', // Cyrillic х -> Latin x
    'ѕ': 's', // Cyrillic ѕ -> Latin s
    'і': 'i', // Cyrillic і -> Latin i
    'ј': 'j', // Cyrillic ј -> Latin j
    // Greek homoglyphs
    'α': 'a',
    'ο': 'o',
    'ρ': 'p',
  };
  
  for (const [homoglyph, replacement] of Object.entries(homoglyphMap)) {
    normalized = normalized.replace(new RegExp(homoglyph, 'g'), replacement);
  }
  
  // Remove excessive whitespace
  normalized = normalized.replace(/\s+/g, ' ').trim();
  
  return normalized;
}

/**
 * Detect potential homoglyph attacks in text
 * Returns true if suspicious Unicode characters are found
 */
export function detectHomoglyphs(text: string): boolean {
  // Check for Cyrillic characters in otherwise Latin text
  const cyrillicPattern = /[\u0400-\u04FF]/;
  const greekPattern = /[\u0370-\u03FF]/;
  const latinPattern = /[a-zA-Z]/;
  
  const hasCyrillic = cyrillicPattern.test(text);
  const hasGreek = greekPattern.test(text);
  const hasLatin = latinPattern.test(text);
  
  // Suspicious if mixed scripts
  return (hasCyrillic || hasGreek) && hasLatin;
}

/**
 * Basic word tokenization
 */
function basicTokenize(text: string): string[] {
  // Split on whitespace and punctuation while keeping punctuation as separate tokens
  return text
    .split(/(\s+|[.,!?;:'"()\[\]{}])/g)
    .filter(token => token.trim().length > 0);
}

/**
 * WordPiece tokenization
 * Breaks unknown words into subword units
 */
function wordPieceTokenize(word: string): string[] {
  const vocab = getVocab();
  
  // Check if word is in vocabulary
  if (vocab.has(word)) {
    return [word];
  }
  
  // Try to break into subwords
  const tokens: string[] = [];
  let start = 0;
  
  while (start < word.length) {
    let end = word.length;
    let foundSubword = false;
    
    while (start < end) {
      const substr = start === 0 ? word.slice(start, end) : `##${word.slice(start, end)}`;
      
      if (vocab.has(substr)) {
        tokens.push(substr);
        foundSubword = true;
        break;
      }
      end -= 1;
    }
    
    if (!foundSubword) {
      // If no subword found, use UNK
      tokens.push(UNK_TOKEN);
      start += 1;
    } else {
      start = end;
    }
  }
  
  return tokens;
}

/**
 * Full tokenization pipeline
 */
export function tokenize(text: string): string[] {
  const normalized = normalizeForTokenization(text);
  const basicTokens = basicTokenize(normalized);
  
  const tokens: string[] = [CLS_TOKEN];
  
  for (const word of basicTokens) {
    const subwords = wordPieceTokenize(word);
    tokens.push(...subwords);
  }
  
  tokens.push(SEP_TOKEN);
  
  return tokens;
}

/**
 * Convert tokens to token IDs
 */
export function tokensToIds(tokens: string[]): number[] {
  const vocab = getVocab();
  
  return tokens.map(token => {
    const id = vocab.get(token);
    return id !== undefined ? id : UNK_ID;
  });
}

/**
 * Tokenize and convert to model input format
 * Returns padded/truncated tensor-ready input
 */
export function encodeForModel(
  text: string,
  maxLength: number = DEFAULT_MODEL_CONFIG.maxSequenceLength
): {
  inputIds: Int32Array;
  attentionMask: Int32Array;
  tokenCount: number;
} {
  const tokens = tokenize(text);
  const inputIds = new Int32Array(maxLength);
  const attentionMask = new Int32Array(maxLength);
  
  // Fill with padding
  inputIds.fill(PAD_ID);
  attentionMask.fill(0);
  
  // Truncate if necessary
  const truncatedTokens = tokens.slice(0, maxLength);
  const ids = tokensToIds(truncatedTokens);
  
  // Copy token IDs
  for (let i = 0; i < ids.length; i++) {
    inputIds[i] = ids[i];
    attentionMask[i] = 1;
  }
  
  return {
    inputIds,
    attentionMask,
    tokenCount: truncatedTokens.length,
  };
}

/**
 * Batch encode multiple texts
 */
export function batchEncode(
  texts: string[],
  maxLength: number = DEFAULT_MODEL_CONFIG.maxSequenceLength
): {
  inputIds: Int32Array[];
  attentionMasks: Int32Array[];
  tokenCounts: number[];
} {
  const results = texts.map(text => encodeForModel(text, maxLength));
  
  return {
    inputIds: results.map(r => r.inputIds),
    attentionMasks: results.map(r => r.attentionMask),
    tokenCounts: results.map(r => r.tokenCount),
  };
}

// Initialize vocabulary on module load
loadVocabulary();

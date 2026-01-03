/**
 * Text Tokenizer Service
 * Implements WordPiece tokenization for MobileBERT model
 * 
 * This tokenizer loads the full vocab.txt (30,522 tokens) from bundled assets
 * and performs proper WordPiece tokenization compatible with MobileBERT.
 * 
 * @see assets/models/vocab.txt - Full vocabulary file
 * @see assets/models/README.md - Model specifications
 */

import { Asset } from 'expo-asset';
import * as FileSystem from 'expo-file-system/legacy';
import { DEFAULT_MODEL_CONFIG } from './types';

// Pre-require the vocab asset at module load time
// This must be a static require for Metro bundler to include the file
let vocabAssetModule: number | null = null;
try {
  vocabAssetModule = require('../../assets/models/vocab.txt');
} catch (e) {
  console.warn('[Tokenizer] Static require for vocab.txt failed, will try alternative loading');
}

// Special tokens (standard BERT vocabulary positions)
const PAD_TOKEN = '[PAD]';
const UNK_TOKEN = '[UNK]';
const CLS_TOKEN = '[CLS]';
const SEP_TOKEN = '[SEP]';
const MASK_TOKEN = '[MASK]';

const PAD_ID = 0;
const UNK_ID = 100;
const CLS_ID = 101;
const SEP_ID = 102;
const MASK_ID = 103;

// Vocabulary state
let vocabulary: Map<string, number> | null = null;
let reverseVocabulary: Map<number, string> | null = null;
let isVocabLoading = false;
let vocabLoadPromise: Promise<void> | null = null;

/**
 * Load vocabulary from bundled vocab.txt asset
 * This loads the full 30,522 token MobileBERT vocabulary
 */
export async function loadVocabulary(): Promise<void> {
  // Return if already loaded with full vocabulary
  if (vocabulary && vocabulary.size > 1000) {
    console.log('[Tokenizer] Vocabulary already loaded');
    return;
  }

  // Wait for existing load if in progress
  if (isVocabLoading && vocabLoadPromise) {
    console.log('[Tokenizer] Waiting for vocabulary load in progress...');
    return vocabLoadPromise;
  }

  isVocabLoading = true;
  
  vocabLoadPromise = (async () => {
    try {
      console.log('[Tokenizer] Loading vocabulary from bundled assets...');
      
      // Use the pre-required module if available, otherwise try dynamic require
      const assetModule = vocabAssetModule ?? require('../../assets/models/vocab.txt');
      
      console.log('[Tokenizer] Asset module loaded:', typeof assetModule);
      
      // Load vocab.txt from bundled assets
      const asset = Asset.fromModule(assetModule);
      
      console.log('[Tokenizer] Asset created, downloading...');
      console.log('[Tokenizer] Asset info:', { 
        name: asset.name, 
        type: asset.type,
        uri: asset.uri,
        localUri: asset.localUri 
      });
      
      await asset.downloadAsync();
      
      if (!asset.localUri) {
        throw new Error('Failed to resolve vocab.txt asset URI after download');
      }
      
      console.log('[Tokenizer] Asset downloaded to:', asset.localUri);
      
      // Read the vocabulary file
      const vocabContent = await FileSystem.readAsStringAsync(asset.localUri);
      console.log('[Tokenizer] Read vocab file, length:', vocabContent.length);
      
      const lines = vocabContent.split('\n');
      
      // Build vocabulary maps
      vocabulary = new Map();
      reverseVocabulary = new Map();
      
      for (let i = 0; i < lines.length; i++) {
        const token = lines[i].trim();
        if (token.length > 0) {
          vocabulary.set(token, i);
          reverseVocabulary.set(i, token);
        }
      }
      
      console.log(`[Tokenizer] ✓ Loaded vocabulary with ${vocabulary.size} tokens`);
      
      // Verify special tokens are present
      if (!vocabulary.has(CLS_TOKEN) || !vocabulary.has(SEP_TOKEN)) {
        console.warn('[Tokenizer] Warning: Special tokens may be missing from vocabulary');
      } else {
        console.log('[Tokenizer] ✓ Special tokens verified: [CLS], [SEP], [PAD], [UNK]');
      }
      
      // Debug: Check a few key scam-related tokens
      const testTokens = ['congratulations', 'urgent', 'irs', 'won', 'prize'];
      const foundTokens = testTokens.filter(t => vocabulary!.has(t));
      console.log(`[Tokenizer] Key tokens check: ${foundTokens.length}/${testTokens.length} found`);
      
    } catch (error) {
      console.error('[Tokenizer] Failed to load vocabulary:', error);
      console.error('[Tokenizer] Error details:', JSON.stringify(error, null, 2));
      // Initialize with fallback minimal vocabulary for basic operation
      console.warn('[Tokenizer] ⚠️ Using FALLBACK vocabulary - model accuracy will be severely degraded!');
      initializeFallbackVocabulary();
    } finally {
      isVocabLoading = false;
      vocabLoadPromise = null;
    }
  })();
  
  return vocabLoadPromise;
}

/**
 * Initialize fallback vocabulary if vocab.txt fails to load
 * This provides basic functionality but with reduced accuracy
 */
function initializeFallbackVocabulary(): void {
  console.warn('[Tokenizer] Using fallback vocabulary - reduced accuracy');
  
  const fallbackVocab = new Map<string, number>([
    [PAD_TOKEN, PAD_ID],
    [UNK_TOKEN, UNK_ID],
    [CLS_TOKEN, CLS_ID],
    [SEP_TOKEN, SEP_ID],
    [MASK_TOKEN, MASK_ID],
  ]);
  
  // Add basic ASCII characters and common tokens
  let idx = 104;
  
  // Lowercase letters
  for (let c = 97; c <= 122; c++) {
    fallbackVocab.set(String.fromCharCode(c), idx++);
  }
  
  // Digits
  for (let d = 0; d <= 9; d++) {
    fallbackVocab.set(String(d), idx++);
  }
  
  // Common punctuation
  ['.', ',', '!', '?', ':', ';', '-', '_', '(', ')', '[', ']', '{', '}', '"', "'", '/', '\\', '@', '#', '$', '%', '&', '*', '+', '='].forEach(p => {
    fallbackVocab.set(p, idx++);
  });
  
  vocabulary = fallbackVocab;
  reverseVocabulary = new Map();
  vocabulary.forEach((id, token) => reverseVocabulary!.set(id, token));
}

/**
 * Get vocabulary synchronously (for use after initial load)
 */
function getVocab(): Map<string, number> {
  if (!vocabulary) {
    console.warn('[Tokenizer] Vocabulary not loaded, using fallback');
    initializeFallbackVocabulary();
  }
  return vocabulary!;
}

/**
 * Check if vocabulary is loaded with full vocab
 */
export function isVocabularyLoaded(): boolean {
  return vocabulary !== null && vocabulary.size > 1000;
}

/**
 * Get vocabulary size
 */
export function getVocabularySize(): number {
  return vocabulary?.size || 0;
}

/**
 * Normalize text for tokenization
 * Handles Unicode normalization and homoglyph detection
 */
export function normalizeForTokenization(text: string): string {
  // Convert to lowercase (MobileBERT uncased model)
  let normalized = text.toLowerCase();
  
  // Normalize Unicode (NFC form)
  normalized = normalized.normalize('NFC');
  
  // Handle common homoglyph attacks (Cyrillic/Greek chars that look like Latin)
  const homoglyphMap: Record<string, string> = {
    // Cyrillic homoglyphs
    'а': 'a', 'е': 'e', 'о': 'o', 'р': 'p', 'с': 'c',
    'у': 'y', 'х': 'x', 'ѕ': 's', 'і': 'i', 'ј': 'j',
    'ԁ': 'd', 'һ': 'h', 'ԝ': 'w', 'ʏ': 'y',
    // Greek homoglyphs
    'α': 'a', 'ο': 'o', 'ρ': 'p', 'τ': 't', 'ν': 'v',
    // Zero-width characters (remove completely)
    '\u200b': '', '\u200c': '', '\u200d': '', '\ufeff': '',
  };
  
  for (const [homoglyph, replacement] of Object.entries(homoglyphMap)) {
    normalized = normalized.replace(new RegExp(homoglyph, 'g'), replacement);
  }
  
  // Normalize whitespace
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
  
  // Check for zero-width characters
  const hasZeroWidth = /[\u200b\u200c\u200d\ufeff]/.test(text);
  
  // Suspicious if mixed scripts or zero-width chars
  return ((hasCyrillic || hasGreek) && hasLatin) || hasZeroWidth;
}

/**
 * Basic whitespace tokenization
 * Splits on whitespace and separates punctuation
 */
function whitespaceTokenize(text: string): string[] {
  const tokens: string[] = [];
  
  // Split on whitespace first
  const words = text.split(/\s+/);
  
  for (const word of words) {
    if (word.length === 0) continue;
    
    // Separate punctuation from words
    let current = '';
    for (const char of word) {
      if (/[.,!?;:'"()\[\]{}<>@#$%^&*+=\-_/\\|`~]/.test(char)) {
        if (current.length > 0) {
          tokens.push(current);
          current = '';
        }
        tokens.push(char);
      } else {
        current += char;
      }
    }
    if (current.length > 0) {
      tokens.push(current);
    }
  }
  
  return tokens;
}

/**
 * WordPiece tokenization
 * Breaks unknown words into subword units using ## prefix
 */
function wordPieceTokenize(word: string): string[] {
  const vocab = getVocab();
  
  // Check if whole word is in vocabulary
  if (vocab.has(word)) {
    return [word];
  }
  
  const tokens: string[] = [];
  let start = 0;
  
  while (start < word.length) {
    let end = word.length;
    let foundSubword = false;
    
    // Try to find longest matching subword
    while (start < end) {
      let substr = word.slice(start, end);
      
      // Add ## prefix for continuation subwords
      if (start > 0) {
        substr = '##' + substr;
      }
      
      if (vocab.has(substr)) {
        tokens.push(substr);
        foundSubword = true;
        start = end;
        break;
      }
      
      end -= 1;
    }
    
    // If no subword found, mark as unknown and advance
    if (!foundSubword) {
      // Only add [UNK] once per unknown character sequence
      if (tokens.length === 0 || tokens[tokens.length - 1] !== UNK_TOKEN) {
        tokens.push(UNK_TOKEN);
      }
      start += 1;
    }
  }
  
  return tokens;
}

/**
 * Full tokenization pipeline
 * Returns array of tokens with [CLS] and [SEP] markers
 */
export function tokenize(text: string): string[] {
  const normalized = normalizeForTokenization(text);
  const words = whitespaceTokenize(normalized);
  
  const tokens: string[] = [CLS_TOKEN];
  
  for (const word of words) {
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
 * Convert token IDs back to tokens (for debugging)
 */
export function idsToTokens(ids: number[]): string[] {
  if (!reverseVocabulary) {
    return ids.map(() => UNK_TOKEN);
  }
  
  return ids.map(id => reverseVocabulary!.get(id) || UNK_TOKEN);
}

/**
 * Tokenize and encode text for model input
 * Returns padded/truncated Int32Array ready for TFLite inference
 * 
 * @param text - Input text to encode
 * @param maxLength - Maximum sequence length (default 128 per model spec)
 * @returns Object with inputIds tensor and metadata
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
  
  // Initialize with padding
  inputIds.fill(PAD_ID);
  attentionMask.fill(0);
  
  // Truncate if necessary (keep [CLS] at start and [SEP] at end)
  let truncatedTokens: string[];
  if (tokens.length > maxLength) {
    // Keep first (maxLength-1) tokens and add [SEP] at end
    truncatedTokens = [...tokens.slice(0, maxLength - 1), SEP_TOKEN];
  } else {
    truncatedTokens = tokens;
  }
  
  // Convert to IDs
  const ids = tokensToIds(truncatedTokens);
  
  // Copy token IDs and set attention mask
  for (let i = 0; i < ids.length; i++) {
    inputIds[i] = ids[i];
    attentionMask[i] = 1; // 1 for real tokens, 0 for padding
  }
  
  return {
    inputIds,
    attentionMask,
    tokenCount: truncatedTokens.length,
  };
}

/**
 * Batch encode multiple texts (for future batch inference)
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

/**
 * Debug helper: show tokenization breakdown
 */
export function debugTokenize(text: string): void {
  console.log('[Tokenizer Debug]');
  console.log(`  Original: "${text}"`);
  console.log(`  Normalized: "${normalizeForTokenization(text)}"`);
  
  const tokens = tokenize(text);
  console.log(`  Tokens (${tokens.length}): ${tokens.join(' | ')}`);
  
  const ids = tokensToIds(tokens);
  console.log(`  IDs: [${ids.join(', ')}]`);
  
  if (detectHomoglyphs(text)) {
    console.log('  ⚠️ Homoglyph attack detected!');
  }
}

// Note: Vocabulary is loaded lazily when first needed
// Call loadVocabulary() during app initialization for faster first inference

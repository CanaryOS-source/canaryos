/**
 * Dump JS TextTokenizer output for 20 test strings as a JSON fixture.
 *
 * This script replicates the tokenization logic from TextTokenizer.ts
 * without Expo/RN dependencies so it can run under ts-node.
 * The output JSON fixture is used by the Kotlin BertTokenizerTest to
 * validate cross-platform parity.
 *
 * Usage:
 *   npx ts-node scripts/dump-tokenizer-output.ts > \
 *     modules/canary-shield/android/src/test/resources/tokenizer_expected.json
 */

import * as fs from "fs";
import * as path from "path";

// ── Constants matching TextTokenizer.ts ──────────────────────────────

const PAD_ID = 0;
const UNK_ID = 100;
const CLS_ID = 101;
const SEP_ID = 102;

const CLS_TOKEN = "[CLS]";
const SEP_TOKEN = "[SEP]";
const UNK_TOKEN = "[UNK]";

const MAX_SEQ_LENGTH = 128;

// ── Load vocabulary ──────────────────────────────────────────────────

const vocabPath = path.resolve(__dirname, "../assets/models/vocab.txt");
const vocabContent = fs.readFileSync(vocabPath, "utf-8");
const lines = vocabContent.split("\n");

const vocabulary = new Map<string, number>();
for (let i = 0; i < lines.length; i++) {
  const token = lines[i].trim();
  if (token.length > 0) {
    vocabulary.set(token, i);
  }
}

// ── Tokenization functions (copied from TextTokenizer.ts) ────────────

function normalizeForTokenization(text: string): string {
  let normalized = text.toLowerCase();
  normalized = normalized.normalize("NFC");

  const homoglyphMap: Record<string, string> = {
    "\u0430": "a", "\u0435": "e", "\u043E": "o", "\u0440": "p", "\u0441": "c",
    "\u0443": "y", "\u0445": "x", "\u0455": "s", "\u0456": "i", "\u0458": "j",
    "\u0501": "d", "\u04BB": "h", "\u051D": "w", "\u028F": "y",
    "\u03B1": "a", "\u03BF": "o", "\u03C1": "p", "\u03C4": "t", "\u03BD": "v",
    "\u200b": "", "\u200c": "", "\u200d": "", "\ufeff": "",
  };

  for (const [homoglyph, replacement] of Object.entries(homoglyphMap)) {
    normalized = normalized.replace(new RegExp(homoglyph, "g"), replacement);
  }

  normalized = normalized.replace(/\s+/g, " ").trim();
  return normalized;
}

function whitespaceTokenize(text: string): string[] {
  const tokens: string[] = [];
  const words = text.split(/\s+/);

  for (const word of words) {
    if (word.length === 0) continue;
    let current = "";
    for (const char of word) {
      if (/[.,!?;:'"()\[\]{}<>@#$%^&*+=\-_/\\|`~]/.test(char)) {
        if (current.length > 0) {
          tokens.push(current);
          current = "";
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

function wordPieceTokenize(word: string): string[] {
  if (vocabulary.has(word)) {
    return [word];
  }

  const tokens: string[] = [];
  let start = 0;

  while (start < word.length) {
    let end = word.length;
    let foundSubword = false;

    while (start < end) {
      let substr = word.slice(start, end);
      if (start > 0) {
        substr = "##" + substr;
      }

      if (vocabulary.has(substr)) {
        tokens.push(substr);
        foundSubword = true;
        start = end;
        break;
      }
      end -= 1;
    }

    if (!foundSubword) {
      if (tokens.length === 0 || tokens[tokens.length - 1] !== UNK_TOKEN) {
        tokens.push(UNK_TOKEN);
      }
      start += 1;
    }
  }

  return tokens;
}

function tokenize(text: string): string[] {
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

function tokensToIds(tokens: string[]): number[] {
  return tokens.map((token) => {
    const id = vocabulary.get(token);
    return id !== undefined ? id : UNK_ID;
  });
}

function encodeForModel(text: string): { inputIds: number[]; attentionMask: number[] } {
  const tokens = tokenize(text);
  const inputIds = new Array(MAX_SEQ_LENGTH).fill(PAD_ID);
  const attentionMask = new Array(MAX_SEQ_LENGTH).fill(0);

  let truncatedTokens: string[];
  if (tokens.length > MAX_SEQ_LENGTH) {
    truncatedTokens = [...tokens.slice(0, MAX_SEQ_LENGTH - 1), SEP_TOKEN];
  } else {
    truncatedTokens = tokens;
  }

  const ids = tokensToIds(truncatedTokens);
  for (let i = 0; i < ids.length; i++) {
    inputIds[i] = ids[i];
    attentionMask[i] = 1;
  }

  return { inputIds, attentionMask };
}

// ── Test strings ─────────────────────────────────────────────────────

const TEST_STRINGS: string[] = [
  // Short
  "hello",
  // Normal sentence
  "Your meeting is at 3pm tomorrow",
  // Scam example
  "You've won $10,000! Click here to claim your prize now",
  // Long text (should truncate)
  "This is a very long text that is designed to exceed the maximum token limit of 128 tokens when tokenized with WordPiece. " +
    "We need to ensure that truncation works correctly and the last token is always SEP. " +
    "Adding more words to make this text really long: the quick brown fox jumps over the lazy dog. " +
    "Cryptocurrency investment opportunity with guaranteed 500% returns in just 30 days. " +
    "Send your Bitcoin to this wallet address immediately to secure your position in this exclusive program.",
  // Empty string
  "",
  // Special characters only
  "!@#$%^&*()",
  // Numbers only
  "1234567890",
  // Unicode text
  "caf\u00e9 na\u00efve r\u00e9sum\u00e9",
  // Homoglyph: Cyrillic 'a' mixed with Latin
  "\u0430pple b\u0430nking",
  // Homoglyph: multiple Cyrillic chars
  "p\u0430yp\u0430l s\u0435curity \u0430lert",
  // Zero-width characters
  "fr\u200bee\u200b money",
  // All punctuation edge case
  "...,,,!!!???",
  // Real scam: urgent action
  "URGENT: Your account has been compromised. Verify your identity now at secure-login.com",
  // Real scam: IRS impersonation
  "IRS Notice: You owe $5,432 in back taxes. Pay immediately to avoid arrest. Call 1-800-555-0199",
  // Safe: casual conversation
  "Hey, want to grab lunch at noon? I was thinking about that new Thai place",
  // Safe: technical
  "The API endpoint returns a JSON response with status code 200",
  // Mixed case and punctuation
  "Hello, World! This is a Test... with MIXED-case.",
  // URL-like content
  "Visit https://example.com/login?user=admin&token=abc123",
  // Emoji (should be treated as unknown tokens)
  "Great deal \ud83d\udcb0 click now \ud83d\ude80",
  // Single character
  "a",
];

// ── Generate fixture ─────────────────────────────────────────────────

interface TestCase {
  text: string;
  inputIds: number[];
  attentionMask: number[];
}

const fixture: TestCase[] = TEST_STRINGS.map((text) => {
  const result = encodeForModel(text);
  return {
    text,
    inputIds: result.inputIds,
    attentionMask: result.attentionMask,
  };
});

// Output to stdout as formatted JSON
process.stdout.write(JSON.stringify(fixture, null, 2) + "\n");

/**
 * Fusion Engine
 * Combines visual and text analysis scores into final risk assessment
 * Phase 1: The Digital Lab
 * 
 * Uses a weighted heuristic approach:
 * Score_Final = max(Score_Visual, Score_Text)
 * 
 * This "OR" logic means if EITHER the screen looks suspicious
 * OR the text is suspicious, we flag it.
 */

import {
  OnDeviceAnalysisResult,
  VisualAnalysisResult,
  TextAnalysisResult,
  VisualCategory,
  ScamPatternType,
  DEFAULT_MODEL_CONFIG,
} from './types';
import { getVisualRiskScore } from './VisualClassifierService';

// Risk level thresholds
const LOW_THRESHOLD = 0.3;
const MEDIUM_THRESHOLD = 0.5;
const HIGH_THRESHOLD = 0.7;
const CRITICAL_THRESHOLD = 0.85;

/**
 * Generate explanation based on analysis results
 */
function generateExplanation(
  visualResult: VisualAnalysisResult | null,
  textResult: TextAnalysisResult | null,
  fusedScore: number
): string {
  const explanations: string[] = [];
  
  if (fusedScore < LOW_THRESHOLD) {
    explanations.push('This content appears to be safe based on our analysis.');
  } else if (fusedScore < MEDIUM_THRESHOLD) {
    explanations.push('This content has some characteristics that warrant caution.');
  } else if (fusedScore < HIGH_THRESHOLD) {
    explanations.push('This content shows several warning signs commonly associated with scams.');
  } else if (fusedScore < CRITICAL_THRESHOLD) {
    explanations.push('This content displays multiple high-risk indicators of a potential scam.');
  } else {
    explanations.push('WARNING: This content has extremely high-risk characteristics of a scam. Exercise extreme caution.');
  }
  
  // Add visual analysis explanation
  if (visualResult && visualResult.confidence > 0.3) {
    switch (visualResult.category) {
      case VisualCategory.LOGIN:
        explanations.push('The image appears to contain login or authentication elements, which could indicate a phishing attempt.');
        break;
      case VisualCategory.WARNING:
        explanations.push('Visual elements in this image suggest urgency or warning, a common tactic in scams.');
        break;
      case VisualCategory.CRITICAL:
        explanations.push('The visual layout closely resembles known scam patterns.');
        break;
    }
  }
  
  // Add text analysis explanation
  if (textResult && textResult.detectedPatterns.length > 0) {
    const patternTypes = textResult.detectedPatterns.map(p => p.type);
    
    if (patternTypes.includes(ScamPatternType.URGENCY)) {
      explanations.push('The text contains urgency language designed to pressure quick action.');
    }
    if (patternTypes.includes(ScamPatternType.FINANCIAL_REQUEST)) {
      explanations.push('Financial transaction requests were detected, which is a red flag.');
    }
    if (patternTypes.includes(ScamPatternType.COERCION)) {
      explanations.push('Threatening or coercive language was found, a hallmark of scam messages.');
    }
    if (patternTypes.includes(ScamPatternType.IMPERSONATION)) {
      explanations.push('The content may be impersonating a trusted organization or company.');
    }
    if (patternTypes.includes(ScamPatternType.HOMOGLYPH_ATTACK)) {
      explanations.push('Suspicious Unicode characters detected that may be used to disguise malicious content.');
    }
  }
  
  return explanations.join(' ');
}

/**
 * Generate red flags list from analysis results
 */
function generateRedFlags(
  visualResult: VisualAnalysisResult | null,
  textResult: TextAnalysisResult | null
): string[] {
  const redFlags: string[] = [];
  
  // Visual red flags
  if (visualResult) {
    if (visualResult.category === VisualCategory.LOGIN && visualResult.confidence > 0.5) {
      redFlags.push('Contains login/password fields');
    }
    if (visualResult.category === VisualCategory.WARNING && visualResult.confidence > 0.5) {
      redFlags.push('Urgent visual warning elements');
    }
    if (visualResult.category === VisualCategory.CRITICAL && visualResult.confidence > 0.5) {
      redFlags.push('Layout matches known scam patterns');
    }
  }
  
  // Text red flags
  if (textResult) {
    for (const pattern of textResult.detectedPatterns) {
      switch (pattern.type) {
        case ScamPatternType.URGENCY:
          redFlags.push(`Urgency language: "${pattern.matchedText}"`);
          break;
        case ScamPatternType.FINANCIAL_REQUEST:
          redFlags.push(`Financial request: "${pattern.matchedText}"`);
          break;
        case ScamPatternType.COERCION:
          redFlags.push(`Threatening language: "${pattern.matchedText}"`);
          break;
        case ScamPatternType.IMPERSONATION:
          redFlags.push(`Possible impersonation: "${pattern.matchedText}"`);
          break;
        case ScamPatternType.SUSPICIOUS_LINK:
          redFlags.push('Contains suspicious links');
          break;
        case ScamPatternType.PERSONAL_INFO_REQUEST:
          redFlags.push(`Requests personal info: "${pattern.matchedText}"`);
          break;
        case ScamPatternType.TOO_GOOD_TO_BE_TRUE:
          redFlags.push(`Too good to be true: "${pattern.matchedText}"`);
          break;
        case ScamPatternType.HOMOGLYPH_ATTACK:
          redFlags.push('Uses deceptive Unicode characters');
          break;
      }
    }
  }
  
  // Deduplicate and limit
  return [...new Set(redFlags)].slice(0, 5);
}

/**
 * Generate safety tips based on risk level and detected patterns
 */
function generateSafetyTips(
  fusedScore: number,
  textResult: TextAnalysisResult | null
): string[] {
  const tips: string[] = [];
  
  // General tips based on risk level
  if (fusedScore > MEDIUM_THRESHOLD) {
    tips.push('Do not click any links in this message.');
    tips.push('Do not provide personal or financial information.');
    tips.push('Verify the sender through official channels.');
  }
  
  // Specific tips based on detected patterns
  if (textResult) {
    const patternTypes = new Set(textResult.detectedPatterns.map(p => p.type));
    
    if (patternTypes.has(ScamPatternType.FINANCIAL_REQUEST)) {
      tips.push('Never send money to someone you don\'t know personally.');
      tips.push('Legitimate organizations will never ask for payment via gift cards or wire transfer.');
    }
    
    if (patternTypes.has(ScamPatternType.URGENCY)) {
      tips.push('Take your time - scammers create false urgency to prevent careful thinking.');
    }
    
    if (patternTypes.has(ScamPatternType.IMPERSONATION)) {
      tips.push('Contact the organization directly using their official website or phone number.');
    }
    
    if (patternTypes.has(ScamPatternType.COERCION)) {
      tips.push('Government agencies do not threaten arrest via text or email.');
    }
    
    if (patternTypes.has(ScamPatternType.TOO_GOOD_TO_BE_TRUE)) {
      tips.push('If it sounds too good to be true, it probably is.');
    }
  }
  
  // Always include if high risk
  if (fusedScore > HIGH_THRESHOLD) {
    tips.push('Report this to the FTC at reportfraud.ftc.gov');
    tips.push('Block and delete this message.');
  }
  
  // Deduplicate and limit
  return [...new Set(tips)].slice(0, 5);
}

/**
 * Determine risk level from fused score
 */
function getRiskLevel(score: number): 'low' | 'medium' | 'high' | 'critical' {
  if (score < LOW_THRESHOLD) return 'low';
  if (score < MEDIUM_THRESHOLD) return 'medium';
  if (score < HIGH_THRESHOLD) return 'high';
  return 'critical';
}

/**
 * Fuse visual and text analysis results into final assessment
 * 
 * Phase 1 Strategy: MAX fusion
 * If EITHER visual OR text analysis detects a scam, flag it
 */
export function fuseResults(
  visualResult: VisualAnalysisResult | null,
  textResult: TextAnalysisResult | null
): OnDeviceAnalysisResult {
  const startTime = Date.now();
  
  // Calculate individual scores
  const visualScore = visualResult ? getVisualRiskScore(visualResult) : 0;
  const textScore = textResult ? textResult.riskScore : 0;
  
  // Phase 1: MAX fusion strategy
  // Flag if either component detects risk
  const fusedScore = Math.max(visualScore, textScore);
  
  // Determine if it's a scam
  const isScam = fusedScore > MEDIUM_THRESHOLD;
  
  // Calculate overall confidence
  // Higher when both components agree
  let confidence: number;
  if (visualResult && textResult) {
    // Both available - confidence is higher when they agree
    const agreement = 1 - Math.abs(visualScore - textScore);
    confidence = Math.max(
      visualResult.confidence,
      textResult.riskScore > 0.5 ? 0.8 : 0.5
    ) * (0.5 + 0.5 * agreement);
  } else if (visualResult) {
    confidence = visualResult.confidence * 0.7; // Single source = lower confidence
  } else if (textResult) {
    confidence = textResult.riskScore > 0.5 ? 0.75 : 0.5;
  } else {
    confidence = 0;
  }
  
  // Generate human-readable results
  const explanation = generateExplanation(visualResult, textResult, fusedScore);
  const redFlags = generateRedFlags(visualResult, textResult);
  const safetyTips = generateSafetyTips(fusedScore, textResult);
  
  // Calculate total latency
  const totalLatencyMs = 
    (visualResult?.latencyMs || 0) + 
    (textResult?.latencyMs || 0) + 
    (Date.now() - startTime);
  
  console.log(`[FusionEngine] Fused result: ${(fusedScore * 100).toFixed(1)}% risk`);
  console.log(`[FusionEngine] Visual: ${(visualScore * 100).toFixed(1)}%, Text: ${(textScore * 100).toFixed(1)}%`);
  
  return {
    isScam,
    confidence,
    riskLevel: getRiskLevel(fusedScore),
    
    visualScore,
    textScore,
    fusedScore,
    
    visualAnalysis: visualResult,
    textAnalysis: textResult,
    
    explanation,
    redFlags,
    safetyTips,
    
    totalLatencyMs,
    modelVersions: {
      visual: DEFAULT_MODEL_CONFIG.visualModel.version,
      text: DEFAULT_MODEL_CONFIG.textModel.version,
    },
    
    analysisTimestamp: Date.now(),
    isOnDevice: true,
  };
}

/**
 * Fuse with weighted combination (alternative strategy)
 * Useful when we want both signals to contribute proportionally
 */
export function fuseResultsWeighted(
  visualResult: VisualAnalysisResult | null,
  textResult: TextAnalysisResult | null,
  visualWeight: number = 0.4,
  textWeight: number = 0.6
): OnDeviceAnalysisResult {
  const visualScore = visualResult ? getVisualRiskScore(visualResult) : 0;
  const textScore = textResult ? textResult.riskScore : 0;
  
  // Normalize weights if only one source is available
  let effectiveVisualWeight = visualWeight;
  let effectiveTextWeight = textWeight;
  
  if (!visualResult) {
    effectiveVisualWeight = 0;
    effectiveTextWeight = 1;
  } else if (!textResult) {
    effectiveVisualWeight = 1;
    effectiveTextWeight = 0;
  }
  
  // Weighted average
  const fusedScore = 
    visualScore * effectiveVisualWeight + 
    textScore * effectiveTextWeight;
  
  // Use the same result generation logic
  return {
    ...fuseResults(visualResult, textResult),
    fusedScore,
    isScam: fusedScore > MEDIUM_THRESHOLD,
    riskLevel: getRiskLevel(fusedScore),
  };
}

/**
 * Quick fusion for real-time scenarios
 * Uses only the faster component if available
 */
export function fuseResultsQuick(
  visualResult: VisualAnalysisResult | null,
  textResult: TextAnalysisResult | null
): { isScam: boolean; score: number } {
  const visualScore = visualResult ? getVisualRiskScore(visualResult) : 0;
  const textScore = textResult ? textResult.riskScore : 0;
  
  const score = Math.max(visualScore, textScore);
  
  return {
    isScam: score > MEDIUM_THRESHOLD,
    score,
  };
}

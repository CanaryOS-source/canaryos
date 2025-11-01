import { createGoogleGenerativeAI } from '@ai-sdk/google';
import { generateObject, generateText } from 'ai';
import { z } from 'zod';
import Constants from 'expo-constants';

// Zod schema for structured output
const scamAnalysisSchema = z.object({
  isScam: z.boolean().describe('Whether the content appears to be a scam'),
  confidence: z.number().min(0).max(100).describe('Confidence level (0-100)'),
  explanation: z.string().describe('Detailed explanation of the analysis'),
  redFlags: z.array(z.string()).describe('List of warning signs detected'),
  safetyTips: z.array(z.string()).describe('Safety recommendations for the user'),
});

export type ScamAnalysisResult = z.infer<typeof scamAnalysisSchema>;

/**
 * Analyzes an image to determine if it contains potential scam content
 * @param imageBase64 - Base64 encoded image string
 * @returns ScamAnalysisResult with detailed analysis
 */
export async function analyzeImageForScam(
  imageBase64: string
): Promise<ScamAnalysisResult> {
  try {
    const apiKey = Constants.expoConfig?.extra?.googleApiKey || process.env.GOOGLE_GENERATIVE_AI_API_KEY;
    
    if (!apiKey) {
      throw new Error('Google Generative AI API key not configured. Please set GOOGLE_GENERATIVE_AI_API_KEY in your environment.');
    }

    const generativeAI = createGoogleGenerativeAI({
      apiKey: apiKey
    });

    const model = generativeAI('gemini-2.5-flash');

    const systemPrompt = `You are an expert scam detector AI for Canary OS. Analyze images for potential scams including:
- Phishing attempts (fake login pages, impersonation)
- Fraudulent payment requests
- Fake prize/lottery notifications
- Romance scams
- Tech support scams
- Investment/crypto scams
- Social engineering attempts

Don't immediately assume scam or not scam, especially when its not obvious. Always do background research on the sender and the content, and whether or not its from a reputable company with an official email, phone number or some other contact information.

Be thorough but concise. Focus on actionable insights.`;

    const { object } = await generateObject({
      model,
      schema: scamAnalysisSchema,
      messages: [
        {
          role: 'system',
          content: systemPrompt,
        },
        {
          role: 'user',
          content: [
            {
              type: 'text',
              text: 'Analyze this image for potential scam content.',
            },
            {
              type: 'image',
              image: imageBase64,
            },
          ],
        },
      ],
    });

    return object;
  } catch (error) {
    console.error('Error analyzing image:', error);
    throw error;
  }
}

/**
 * Analyzes text or URL to determine if it contains potential scam content
 * Uses Google Search grounding and URL context for real-time information
 * @param query - Text or URL to analyze
 * @returns ScamAnalysisResult with detailed analysis
 */
export async function analyzeTextForScam(
  query: string
): Promise<ScamAnalysisResult> {
  try {
    const apiKey = Constants.expoConfig?.extra?.googleApiKey || process.env.GOOGLE_GENERATIVE_AI_API_KEY;
    
    if (!apiKey) {
      throw new Error('Google Generative AI API key not configured. Please set GOOGLE_GENERATIVE_AI_API_KEY in your environment.');
    }

    const generativeAI = createGoogleGenerativeAI({
      apiKey: apiKey
    });

    const model = generativeAI('gemini-2.5-flash');

    const systemPrompt = `You are an expert scam detector AI for Canary OS. Analyze text, links, and websites for potential scams including:
- Phishing websites and fake domains
- Fraudulent payment requests
- Fake prize/lottery notifications
- Romance scams
- Tech support scams
- Investment/crypto scams
- Social engineering attempts
- Suspicious URLs and domains
- Fake e-commerce sites
- Impersonation of legitimate companies

Use Google Search to verify:
- Domain reputation and age
- Company legitimacy
- User reviews and complaints
- Official website comparisons
- Known scam reports
- SSL certificate validity

For specific programs or services that charge significant money, rely heavily on what real users say about it rather than what they say about themselves.

If a website is likely a scam, make sure to set isScam to true because people may not read the analysis or warning signs and just see "appears safe".

Be thorough but concise. Focus on actionable insights.

IMPORTANT: You MUST respond with ONLY valid JSON in this exact format (no markdown, no code blocks, no additional text):
{
  "isScam": boolean,
  "confidence": number (0-100),
  "explanation": "string",
  "redFlags": ["string"],
  "safetyTips": ["string"]
}`;

    const { text } = await generateText({
      model,
      tools: {
        google_search: generativeAI.tools.googleSearch({}),
      },
      system: systemPrompt,
      prompt: `Analyze this for potential scam content. Use Google Search to verify information and check for reports or warnings. If a URL is provided, also fetch its content: ${query}`,
    });

    console.log(text);

    // Parse the JSON response
    const cleanedText = text.trim().replace(/```json\n?/g, '').replace(/```\n?/g, '');
    const object = JSON.parse(cleanedText) as ScamAnalysisResult;

    return object;
  } catch (error) {
    console.error('Error analyzing text:', error);
    throw error;
  }
}

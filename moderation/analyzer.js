import axios from 'axios';
import { config } from '../utils/config.js';
import logger from '../utils/logger.js';
import { MODERATION_PROMPT, buildPrompt } from './prompt.js';
import { PROHIBITED_WORDS } from './prohibited.js'; // Will create later
import LRU from 'lru-cache';

const RATE_LIMIT = new LRU({
  max: 10000,
  ttl: 1000 * 60 * 5, // 5 minutes
  updateAgeOnGet: true,
});

// Palabras prohibidas directas (bypass AI)
const DIRECT_BAN_WORDS = [
  'puta', 'puto', 'zorra', 'maricon', 'joto', 'culo', 'verga', 'pene',
  'coño', 'vagina', 'follar', 'coger', 'mamar', 'chingar'
  // Add more domain-specific
];

export async function preFilter(text) {
  const cleanText = (text || '').toLowerCase();
  
  // Direct ban words
  for (const word of DIRECT_BAN_WORDS) {
    if (cleanText.includes(word)) {
      return {
        label: 'VIOLATION',
        reason: 'insulto_directo',
        confidence: 100
      };
    }
  }

  // Spam patterns
  const spamPatterns = [
    /http[s]?:\/\/[^\s]+/gi, // Links
    /^(.)\1{5,}$/gm, // Repeated chars
    /(\b\w+\b)\s+\1{2,}/gi // Repeated words
  ];

  for (const pattern of spamPatterns) {
    if (pattern.test(cleanText)) {
      return {
        label: 'VIOLATION',
        reason: 'spam_evidente',
        confidence: 95
      };
    }
  }

  return null; // Pass to AI
}

export async function analyzeText(phone, text) {
  // Rate limit TTL: 1 analysis per 3 seconds
  const now = Date.now();
  const lastAnalysis = RATE_LIMIT.get(phone) || 0;
  
  if (now - lastAnalysis < 3000) {
    logger.debug(`⏳ Rate limited ${phone}`);
    return null;
  }
  
  RATE_LIMIT.set(phone, now);

  // Pre-filter first
  const preResult = await preFilter(text);
  if (preResult) {
    return preResult;
  }

  try {
    const prompt = buildPrompt(text);
    const response = await axios.post(`${config.ollama.url}/api/generate`, {
      model: config.ollama.model,
      prompt,
      stream: false,
      options: {
        temperature: 0.1,
        top_p: 0.9
      }
    }, { timeout: 15000 });

    const aiResponse = response.data.response.trim();
    
    // Parse JSON response
    try {
      const result = JSON.parse(aiResponse);
      
      // Validate response format
      if (result.label && ['SAFE', 'VIOLATION'].includes(result.label) && 
          typeof result.confidence === 'number' && 
          result.reason) {
        logger.info(`AI Analysis ${phone}: ${result.label} (${result.confidence}%)`);
        return result;
      }
    } catch (parseError) {
      logger.warn('AI response parse failed:', aiResponse);
    }

    // Fallback
    return { label: 'SAFE', reason: null, confidence: 0 };
  } catch (error) {
    logger.error('AI analysis failed:', error.message);
    return { label: 'SAFE', reason: null, confidence: 0 };
  }
}

export function isWhitelisted(phone) {
  return config.whitelist.includes(phone);
}


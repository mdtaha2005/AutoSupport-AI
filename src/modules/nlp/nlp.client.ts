import { env } from '../../config/env.js';
import { logger } from '../../config/logger.js';

export interface NlpEntity {
  type: string;
  value: string;
  text: string;
  start: number;
  end: number;
  confidence: number;
}

export interface NlpProcessResponse {
  ticket_id?: string;
  category: {
    label: 'PAYMENT' | 'REFUND' | 'DELIVERY' | 'ACCOUNT' | 'TECHNICAL' | 'PRODUCT' | 'OTHER';
    confidence: number;
    probabilities: Record<string, number>;
  };
  intent: {
    label: string;
    confidence: number;
  };
  priority: {
    label: 'LOW' | 'MEDIUM' | 'HIGH' | 'URGENT';
    confidence: number;
    reason: string;
  };
  sentiment: {
    label: 'POSITIVE' | 'NEUTRAL' | 'NEGATIVE';
    score: number;
    urgency_detected: boolean;
    urgency_keywords: string[];
  };
  entities: NlpEntity[];
  human_review: {
    needs_review: boolean;
    reason?: string | null;
  };
  normalized_text: string;
  processed_at: string;
}

export interface EmbedResponse {
  embedding: number[];
  dimension: number;
  model: string;
}

export interface BatchEmbedResponse {
  embeddings: number[][];
  dimension: number;
  model: string;
  count: number;
}

export class NlpClient {
  private baseUrl: string;

  constructor(baseUrl = env.NLP_SERVICE_URL) {
    this.baseUrl = baseUrl.replace(/\/+$/, '');
  }

  async getEmbedding(text: string): Promise<number[]> {
    if (env.NODE_ENV === 'test') {
      return this.generateDeterministicEmbedding(text);
    }

    const url = `${this.baseUrl}/api/v1/nlp/embed`;
    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Accept: 'application/json',
        },
        body: JSON.stringify({ text }),
        signal: AbortSignal.timeout(6000),
      });

      if (response.ok) {
        const data = (await response.json()) as EmbedResponse;
        if (data.embedding && data.embedding.length > 0) {
          return data.embedding;
        }
      }
    } catch {
      logger.debug(`NLP embed endpoint unreachable at ${url}, using deterministic fallback.`);
    }
    return this.generateDeterministicEmbedding(text);
  }

  async getBatchEmbeddings(texts: string[]): Promise<number[][]> {
    if (env.NODE_ENV === 'test') {
      return texts.map((t) => this.generateDeterministicEmbedding(t));
    }

    const url = `${this.baseUrl}/api/v1/nlp/embed-batch`;
    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Accept: 'application/json',
        },
        body: JSON.stringify({ texts }),
        signal: AbortSignal.timeout(10000),
      });

      if (response.ok) {
        const data = (await response.json()) as BatchEmbedResponse;
        if (data.embeddings && data.embeddings.length === texts.length) {
          return data.embeddings;
        }
      }
    } catch {
      logger.debug(`NLP embed-batch endpoint unreachable at ${url}, using deterministic fallback.`);
    }
    return texts.map((t) => this.generateDeterministicEmbedding(t));
  }

  /**
   * Deterministic 384-dimensional unit vector generator for tests & offline fallback.
   */
  generateDeterministicEmbedding(text: string, dimension = 384): number[] {
    const clean = text.trim().toLowerCase();
    if (!clean) {
      return new Array(dimension).fill(0);
    }

    const vector = new Array(dimension).fill(0);
    const words = clean.split(/\s+/);

    for (const word of words) {
      // Simple 32-bit FNV-1a hash
      let hash = 2166136261;
      for (let i = 0; i < word.length; i++) {
        hash ^= word.charCodeAt(i);
        hash = Math.imul(hash, 16777619);
      }

      // Linear Congruential Generator (LCG)
      let state = hash >>> 0;
      for (let d = 0; d < dimension; d++) {
        state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
        const rand = (state / 4294967296) * 2 - 1; // [-1, 1]
        vector[d] += rand;
      }
    }

    // L2 Normalize to unit length
    let sumSq = 0;
    for (let d = 0; d < dimension; d++) {
      sumSq += vector[d] * vector[d];
    }
    const norm = Math.sqrt(sumSq);
    if (norm > 1e-6) {
      for (let d = 0; d < dimension; d++) {
        vector[d] = vector[d] / norm;
      }
    }

    return vector;
  }

  async processTicket(ticketId: string, title: string, description: string): Promise<NlpProcessResponse | null> {
    const url = `${this.baseUrl}/api/v1/nlp/process`;
    try {
      logger.debug(`Calling NLP microservice at ${url} for ticket ${ticketId}`);

      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Accept: 'application/json',
        },
        body: JSON.stringify({
          ticket_id: ticketId,
          title,
          description,
        }),
        signal: AbortSignal.timeout(6000), // 6 second timeout
      });

      if (!response.ok) {
        const errorText = await response.text();
        logger.error(`NLP Microservice returned HTTP ${response.status}: ${errorText}`);
        return null;
      }

      const data = (await response.json()) as NlpProcessResponse;
      return data;
    } catch (error) {
      logger.warn(`Failed to connect to NLP Microservice at ${url}: ${(error as Error).message}`);
      return null;
    }
  }

  async healthCheck(): Promise<boolean> {
    try {
      const response = await fetch(`${this.baseUrl}/api/v1/nlp/health`, {
        signal: AbortSignal.timeout(3000),
      });
      return response.ok;
    } catch {
      return false;
    }
  }
}

export const nlpClient = new NlpClient();

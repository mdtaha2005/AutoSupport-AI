import { prisma } from '../../config/prisma.js';
import { logger } from '../../config/logger.js';
import { nlpClient } from '../nlp/nlp.client.js';
import { SEARCH_CONFIG } from './search.config.js';
import { SearchQueryInput } from './search.types.js';
import { fullTextSearchService } from './fulltext-search.service.js';

export interface SemanticCandidate {
  ticket: any;
  rawScore: number;       // raw cosine similarity [-1.0, 1.0]
  normalizedScore: number;  // normalized similarity in [0.0, 1.0]
}

export class SemanticSearchService {
  /**
   * Execute semantic vector search using Sentence Transformers embeddings
   * and pgvector cosine similarity.
   */
  async searchSemantic(input: SearchQueryInput): Promise<SemanticCandidate[]> {
    const { query } = input;
    const cleanQuery = query ? query.trim() : '';

    if (!cleanQuery) {
      return [];
    }

    // 1. Generate dense 384-dimensional query vector
    const queryVector = await nlpClient.getEmbedding(cleanQuery);
    if (!queryVector || queryVector.length === 0) {
      logger.warn('Failed to obtain query embedding vector');
      return [];
    }

    // 2. Build where filter matching active facets
    const where = fullTextSearchService.buildPrismaWhereClause(input);

    // 3. Retrieve tickets matching active facets with embeddings
    const tickets = await prisma.ticket.findMany({
      where,
      include: {
        department: { select: { id: true, name: true } },
        assignedAgent: { select: { id: true, name: true, email: true } },
        customer: { select: { id: true, name: true, email: true } },
        nlpAnalysis: { select: { intent: true, sentiment: true, sentimentScore: true } },
        embedding: true,
      },
    });

    if (tickets.length === 0) {
      return [];
    }

    const scoredCandidates: Array<{
      ticket: any;
      rawScore: number;
    }> = [];

    for (const ticket of tickets) {
      let docVector = ticket.embedding?.vector;

      // If document vector is missing, compute and save it lazily
      if (!docVector || docVector.length === 0) {
        const textToEmbed = `${ticket.title} ${ticket.description}`.slice(0, 1000);
        docVector = await nlpClient.getEmbedding(textToEmbed);

        // Save for future fast lookups
        await prisma.ticketEmbedding.upsert({
          where: { ticketId: ticket.id },
          create: {
            ticketId: ticket.id,
            vector: docVector,
            model: 'all-MiniLM-L6-v2',
            dimension: docVector.length,
          },
          update: {
            vector: docVector,
            updatedAt: new Date(),
          },
        }).catch((err) => {
          logger.debug(`Could not save lazy embedding for ticket ${ticket.id}: ${err.message}`);
        });
      }

      // Compute Cosine Similarity (Dot product on unit-normalized vectors)
      const similarity = this.computeCosineSimilarity(queryVector, docVector);

      // Only consider positive semantic alignments
      if (similarity > 0.05) {
        scoredCandidates.push({
          ticket,
          rawScore: similarity,
        });
      }
    }

    if (scoredCandidates.length === 0) {
      return [];
    }

    // Min-Max or standard [0, 1] normalization
    let maxSim = -Infinity;
    let minSim = Infinity;
    for (const item of scoredCandidates) {
      if (item.rawScore > maxSim) maxSim = item.rawScore;
      if (item.rawScore < minSim) minSim = item.rawScore;
    }

    const range = maxSim - minSim;

    return scoredCandidates
      .map((item) => ({
        ticket: item.ticket,
        rawScore: item.rawScore,
        // Scale to [0.0, 1.0]
        normalizedScore: range > 0.001
          ? (item.rawScore - minSim) / range
          : Math.max(0, Math.min(1, (item.rawScore + 1) / 2)),
      }))
      .sort((a, b) => b.normalizedScore - a.normalizedScore);
  }

  /**
   * Dot product cosine similarity on unit vectors.
   */
  computeCosineSimilarity(vecA: number[], vecB: number[]): number {
    if (!vecA || !vecB || vecA.length !== vecB.length || vecA.length === 0) {
      return 0.0;
    }

    let dotProduct = 0.0;
    let normA = 0.0;
    let normB = 0.0;

    for (let i = 0; i < vecA.length; i++) {
      const a = vecA[i];
      const b = vecB[i];
      dotProduct += a * b;
      normA += a * a;
      normB += b * b;
    }

    if (normA < 1e-6 || normB < 1e-6) {
      return 0.0;
    }

    return dotProduct / (Math.sqrt(normA) * Math.sqrt(normB));
  }
}

export const semanticSearchService = new SemanticSearchService();

import { Prisma, TicketStatus, TicketPriority, TicketCategory } from '@prisma/client';
import { prisma } from '../../config/prisma.js';
import { logger } from '../../config/logger.js';
import { SEARCH_CONFIG } from './search.config.js';
import { SearchQueryInput } from './search.types.js';

export interface LexicalCandidate {
  ticket: any;
  rawScore: number;
  normalizedScore: number;
  matchedCommentsCount: number;
}

export class FullTextSearchService {
  /**
   * Execute full-text lexical search across ticket title, description, and comments
   * respecting any active facet filters.
   */
  async searchLexical(input: SearchQueryInput): Promise<LexicalCandidate[]> {
    const { query } = input;
    const cleanQuery = query ? query.trim().toLowerCase() : '';

    if (!cleanQuery) {
      return [];
    }

    // Build base Prisma filter matching all facet criteria
    const where = this.buildPrismaWhereClause(input);

    // Fetch candidate tickets matching filters with comments and relations
    const candidates = await prisma.ticket.findMany({
      where,
      include: {
        department: { select: { id: true, name: true } },
        assignedAgent: { select: { id: true, name: true, email: true } },
        customer: { select: { id: true, name: true, email: true } },
        comments: { select: { id: true, content: true, isInternal: true } },
        nlpAnalysis: { select: { intent: true, sentiment: true, sentimentScore: true } },
      },
    });

    if (candidates.length === 0) {
      return [];
    }

    const queryTerms = cleanQuery
      .replace(/[^\w\s]/g, ' ')
      .split(/\s+/)
      .filter((term) => term.length > 1);

    if (queryTerms.length === 0) {
      return [];
    }

    // Score candidates lexically
    const scoredCandidates: Array<{
      ticket: any;
      rawScore: number;
      matchedCommentsCount: number;
    }> = [];

    for (const ticket of candidates) {
      const titleLower = (ticket.title || '').toLowerCase();
      const descLower = (ticket.description || '').toLowerCase();
      const comments = ticket.comments || [];

      let rawScore = 0;
      let matchedCommentsCount = 0;

      // Exact phrase match bonuses
      if (titleLower.includes(cleanQuery)) {
        rawScore += 5.0 * SEARCH_CONFIG.WEIGHTS.TITLE;
      }
      if (descLower.includes(cleanQuery)) {
        rawScore += 3.0 * SEARCH_CONFIG.WEIGHTS.DESCRIPTION;
      }

      // Term-by-term TF weighting
      for (const term of queryTerms) {
        // Title term matching
        const titleOccurrences = (titleLower.match(new RegExp(`\\b${term}`, 'g')) || []).length;
        rawScore += titleOccurrences * 2.0 * SEARCH_CONFIG.WEIGHTS.TITLE;

        // Description term matching
        const descOccurrences = (descLower.match(new RegExp(`\\b${term}`, 'g')) || []).length;
        rawScore += descOccurrences * 1.0 * SEARCH_CONFIG.WEIGHTS.DESCRIPTION;

        // Comment term matching
        let commentHitsForTerm = 0;
        for (const comment of comments) {
          const contentLower = (comment.content || '').toLowerCase();
          const commentOccurrences = (contentLower.match(new RegExp(`\\b${term}`, 'g')) || []).length;
          if (commentOccurrences > 0) {
            commentHitsForTerm += commentOccurrences;
            matchedCommentsCount++;
          }
        }
        rawScore += commentHitsForTerm * 0.5 * SEARCH_CONFIG.WEIGHTS.COMMENTS;
      }

      if (rawScore > 0) {
        scoredCandidates.push({
          ticket,
          rawScore,
          matchedCommentsCount,
        });
      }
    }

    if (scoredCandidates.length === 0) {
      return [];
    }

    // Min-Max Normalization to [0.0, 1.0]
    let maxScore = 0;
    let minScore = Infinity;
    for (const item of scoredCandidates) {
      if (item.rawScore > maxScore) maxScore = item.rawScore;
      if (item.rawScore < minScore) minScore = item.rawScore;
    }

    const range = maxScore - minScore;

    return scoredCandidates
      .map((item) => ({
        ticket: item.ticket,
        rawScore: item.rawScore,
        normalizedScore: range > 0 ? (item.rawScore - minScore) / range : 1.0,
        matchedCommentsCount: item.matchedCommentsCount,
      }))
      .sort((a, b) => b.normalizedScore - a.normalizedScore);
  }

  /**
   * Helper to construct Prisma WhereInput from active search filters
   */
  buildPrismaWhereClause(input: SearchQueryInput): Prisma.TicketWhereInput {
    const where: Prisma.TicketWhereInput = {};

    if (input.status) {
      if (Array.isArray(input.status)) {
        where.status = { in: input.status };
      } else {
        where.status = input.status;
      }
    }

    if (input.priority) {
      if (Array.isArray(input.priority)) {
        where.priority = { in: input.priority };
      } else {
        where.priority = input.priority;
      }
    }

    if (input.category) {
      if (Array.isArray(input.category)) {
        where.category = { in: input.category };
      } else {
        where.category = input.category;
      }
    }

    if (input.departmentId) {
      where.departmentId = input.departmentId;
    }

    if (input.assignedAgentId) {
      where.assignedAgentId = input.assignedAgentId;
    }

    if (input.needsHumanReview !== undefined) {
      where.needsHumanReview = input.needsHumanReview;
    }

    if (input.startDate || input.endDate) {
      where.createdAt = {};
      if (input.startDate) {
        where.createdAt.gte = new Date(input.startDate);
      }
      if (input.endDate) {
        where.createdAt.lte = new Date(input.endDate);
      }
    }

    return where;
  }
}

export const fullTextSearchService = new FullTextSearchService();

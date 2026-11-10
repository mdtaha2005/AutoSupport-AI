import { performance } from 'perf_hooks';
import { prisma } from '../../config/prisma.js';
import { logger } from '../../config/logger.js';
import { SEARCH_CONFIG } from './search.config.js';
import {
  SearchQueryInput,
  SearchResultItem,
  PaginatedSearchResults,
  SearchMode,
} from './search.types.js';
import { fullTextSearchService, LexicalCandidate } from './fulltext-search.service.js';
import { semanticSearchService, SemanticCandidate } from './semantic-search.service.js';

export class HybridSearchService {
  /**
   * Execute hybrid retrieval combining lexical and semantic search.
   */
  async search(input: SearchQueryInput): Promise<PaginatedSearchResults> {
    const startTime = performance.now();
    const mode: SearchMode = input.mode || 'hybrid';
    const alpha = input.alpha !== undefined
      ? Math.max(0.0, Math.min(1.0, input.alpha))
      : SEARCH_CONFIG.DEFAULT_ALPHA;

    const page = Math.max(1, input.page || SEARCH_CONFIG.DEFAULT_PAGE);
    const limit = Math.min(
      SEARCH_CONFIG.MAX_LIMIT,
      Math.max(1, input.limit || SEARCH_CONFIG.DEFAULT_LIMIT)
    );

    // If query is empty or whitespace, return filtered tickets directly
    if (!input.query || input.query.trim().length === 0) {
      const where = fullTextSearchService.buildPrismaWhereClause(input);
      const orderBy = input.sortBy && input.sortBy !== 'relevance'
        ? { [input.sortBy]: input.sortOrder || 'desc' }
        : { createdAt: (input.sortOrder || 'desc') as 'asc' | 'desc' };

      const [total, tickets] = await Promise.all([
        prisma.ticket.count({ where }),
        prisma.ticket.findMany({
          where,
          skip: (page - 1) * limit,
          take: limit,
          orderBy,
          include: {
            department: { select: { id: true, name: true } },
            assignedAgent: { select: { id: true, name: true, email: true } },
            customer: { select: { id: true, name: true, email: true } },
            nlpAnalysis: { select: { intent: true, sentiment: true, sentimentScore: true } },
          },
        }),
      ]);

      const items: SearchResultItem[] = tickets.map((t) => ({
        id: t.id,
        ticketNumber: t.ticketNumber,
        title: t.title,
        description: t.description,
        status: t.status,
        priority: t.priority,
        category: t.category,
        needsHumanReview: t.needsHumanReview,
        department: t.department ? { id: t.department.id, name: t.department.name } : null,
        assignedAgent: t.assignedAgent ? { id: t.assignedAgent.id, name: t.assignedAgent.name, email: t.assignedAgent.email } : null,
        customer: t.customer ? { id: t.customer.id, name: t.customer.name, email: t.customer.email } : null,
        nlpAnalysis: t.nlpAnalysis ? { intent: t.nlpAnalysis.intent, sentiment: t.nlpAnalysis.sentiment, sentimentScore: t.nlpAnalysis.sentimentScore } : null,
        scores: {
          lexicalScore: 1.0,
          semanticScore: 1.0,
          hybridScore: 1.0,
          matchedCommentsCount: 0,
        },
        createdAt: t.createdAt,
        updatedAt: t.updatedAt,
      }));

      const executionTimeMs = performance.now() - startTime;
      logger.debug(`Search executed in ${executionTimeMs.toFixed(2)}ms: mode=${mode}, query="", matches=${items.length}, page=${page}/${Math.ceil(total / limit) || 1}`);

      return {
        items,
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit) || 1,
        executionTimeMs,
        mode,
        alpha,
      };
    }

    let lexicalResults: LexicalCandidate[] = [];
    let semanticResults: SemanticCandidate[] = [];

    // 1. Dispatch queries based on mode
    if (mode === 'lexical') {
      lexicalResults = await fullTextSearchService.searchLexical(input);
    } else if (mode === 'semantic') {
      semanticResults = await semanticSearchService.searchSemantic(input);
    } else {
      // For 'hybrid' and 'rrf', run both pipelines concurrently
      const [lex, sem] = await Promise.all([
        fullTextSearchService.searchLexical(input),
        semanticSearchService.searchSemantic(input),
      ]);
      lexicalResults = lex;
      semanticResults = sem;
    }

    // 2. Build index maps
    const lexicalMap = new Map<string, { candidate: LexicalCandidate; rank: number }>();
    lexicalResults.forEach((item, index) => {
      lexicalMap.set(item.ticket.id, { candidate: item, rank: index + 1 });
    });

    const semanticMap = new Map<string, { candidate: SemanticCandidate; rank: number }>();
    semanticResults.forEach((item, index) => {
      semanticMap.set(item.ticket.id, { candidate: item, rank: index + 1 });
    });

    // 3. Union of all candidate ticket IDs
    const allTicketIds = new Set<string>([
      ...Array.from(lexicalMap.keys()),
      ...Array.from(semanticMap.keys()),
    ]);

    const mergedItems: SearchResultItem[] = [];

    for (const ticketId of allTicketIds) {
      const lexEntry = lexicalMap.get(ticketId);
      const semEntry = semanticMap.get(ticketId);

      const ticket = lexEntry?.candidate.ticket || semEntry?.candidate.ticket;
      if (!ticket) continue;

      const normLexical = lexEntry ? lexEntry.candidate.normalizedScore : 0.0;
      const rawLexical = lexEntry ? lexEntry.candidate.rawScore : 0.0;
      const normSemantic = semEntry ? semEntry.candidate.normalizedScore : 0.0;
      const rawSemantic = semEntry ? semEntry.candidate.rawScore : 0.0;

      let combinedScore = 0.0;

      if (mode === 'rrf') {
        // Reciprocal Rank Fusion
        const k = SEARCH_CONFIG.RRF_K;
        const rrfLex = lexEntry ? alpha / (k + lexEntry.rank) : 0.0;
        const rrfSem = semEntry ? (1.0 - alpha) / (k + semEntry.rank) : 0.0;
        combinedScore = rrfLex + rrfSem;
      } else if (mode === 'lexical') {
        combinedScore = normLexical;
      } else if (mode === 'semantic') {
        combinedScore = normSemantic;
      } else {
        // Linear Weighted Combination: alpha * Lexical + (1 - alpha) * Semantic
        combinedScore = alpha * normLexical + (1.0 - alpha) * normSemantic;
      }

      mergedItems.push({
        id: ticket.id,
        ticketNumber: ticket.ticketNumber,
        title: ticket.title,
        description: ticket.description,
        status: ticket.status,
        priority: ticket.priority,
        category: ticket.category || null,
        needsHumanReview: ticket.needsHumanReview || false,
        department: ticket.department
          ? { id: ticket.department.id, name: ticket.department.name }
          : null,
        assignedAgent: ticket.assignedAgent
          ? {
              id: ticket.assignedAgent.id,
              name: ticket.assignedAgent.name,
              email: ticket.assignedAgent.email,
            }
          : null,
        customer: ticket.customer
          ? {
              id: ticket.customer.id,
              name: ticket.customer.name,
              email: ticket.customer.email,
            }
          : null,
        nlpAnalysis: ticket.nlpAnalysis
          ? {
              intent: ticket.nlpAnalysis.intent,
              sentiment: ticket.nlpAnalysis.sentiment,
              sentimentScore: ticket.nlpAnalysis.sentimentScore,
            }
          : null,
        scores: {
          lexicalScore: Number(rawLexical.toFixed(4)),
          semanticScore: Number(rawSemantic.toFixed(4)),
          hybridScore: Number(combinedScore.toFixed(4)),
          matchedCommentsCount: lexEntry?.candidate.matchedCommentsCount || 0,
        },
        createdAt: ticket.createdAt,
        updatedAt: ticket.updatedAt,
      });
    }

    // 4. Sort results
    const sortBy = input.sortBy || 'relevance';
    const sortOrder = input.sortOrder || 'desc';

    mergedItems.sort((a, b) => {
      if (sortBy === 'relevance') {
        return sortOrder === 'asc'
          ? a.scores.hybridScore - b.scores.hybridScore
          : b.scores.hybridScore - a.scores.hybridScore;
      }
      if (sortBy === 'createdAt') {
        const timeA = new Date(a.createdAt).getTime();
        const timeB = new Date(b.createdAt).getTime();
        return sortOrder === 'asc' ? timeA - timeB : timeB - timeA;
      }
      if (sortBy === 'priority') {
        const priorityWeight: Record<string, number> = {
          URGENT: 4,
          HIGH: 3,
          MEDIUM: 2,
          LOW: 1,
        };
        const pA = priorityWeight[a.priority] || 0;
        const pB = priorityWeight[b.priority] || 0;
        return sortOrder === 'asc' ? pA - pB : pB - pA;
      }
      return 0;
    });

    // 5. Paginate
    const total = mergedItems.length;
    const totalPages = Math.ceil(total / limit) || 1;
    const offset = (page - 1) * limit;
    const paginatedItems = mergedItems.slice(offset, offset + limit);

    const executionTimeMs = Number((performance.now() - startTime).toFixed(2));

    logger.debug(
      `Search executed in ${executionTimeMs}ms: mode=${mode}, query="${input.query}", matches=${total}, page=${page}/${totalPages}`
    );

    return {
      items: paginatedItems,
      total,
      page,
      limit,
      totalPages,
      executionTimeMs,
      mode,
      alpha,
    };
  }
}

export const hybridSearchService = new HybridSearchService();

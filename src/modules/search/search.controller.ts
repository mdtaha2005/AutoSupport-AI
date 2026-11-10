import { Request, Response, NextFunction } from 'express';
import { TicketCategory, TicketPriority, TicketStatus } from '@prisma/client';
import { hybridSearchService } from './hybrid-search.service.js';
import { semanticSearchService } from './semantic-search.service.js';
import { facetedFilterService } from './faceted-filter.service.js';
import { relevanceEvaluator } from './relevance-evaluator.js';
import { SearchQueryInput, SearchMode } from './search.types.js';
import { sendSuccess } from '../../utils/response.js';

export class SearchController {
  private parseSearchQuery(req: Request): SearchQueryInput {
    const q = (req.query.q || req.query.query || '') as string;
    const mode = (req.query.mode as SearchMode) || 'hybrid';
    const alpha = req.query.alpha ? parseFloat(req.query.alpha as string) : undefined;

    const page = req.query.page ? parseInt(req.query.page as string, 10) : undefined;
    const limit = req.query.limit ? parseInt(req.query.limit as string, 10) : undefined;
    const sortBy = req.query.sortBy as 'relevance' | 'createdAt' | 'priority' | 'status' | undefined;
    const sortOrder = req.query.sortOrder as 'asc' | 'desc' | undefined;

    // Filter parsers
    const parseArrayOrSingle = <T>(val: unknown): T | T[] | undefined => {
      if (!val) return undefined;
      if (Array.isArray(val)) return val as T[];
      if (typeof val === 'string' && val.includes(',')) return val.split(',').map((s) => s.trim()) as T[];
      return val as T;
    };

    const status = parseArrayOrSingle<TicketStatus>(req.query.status);
    const priority = parseArrayOrSingle<TicketPriority>(req.query.priority);
    const category = parseArrayOrSingle<TicketCategory>(req.query.category);

    return {
      query: q,
      mode,
      alpha,
      status,
      priority,
      category,
      departmentId: req.query.departmentId as string | undefined,
      assignedAgentId: req.query.assignedAgentId as string | undefined,
      intent: req.query.intent as string | undefined,
      sentiment: req.query.sentiment as string | undefined,
      needsHumanReview: req.query.needsHumanReview !== undefined
        ? req.query.needsHumanReview === 'true'
        : undefined,
      startDate: req.query.startDate as string | undefined,
      endDate: req.query.endDate as string | undefined,
      page,
      limit,
      sortBy,
      sortOrder,
    };
  }

  async search(req: Request, res: Response, next: NextFunction) {
    try {
      const input = this.parseSearchQuery(req);
      const results = await hybridSearchService.search(input);
      return sendSuccess(res, results, 'Search results retrieved successfully');
    } catch (error) {
      next(error);
    }
  }

  async getFacets(req: Request, res: Response, next: NextFunction) {
    try {
      const input = this.parseSearchQuery(req);
      const facets = await facetedFilterService.getDynamicFacets(input);
      return sendSuccess(res, facets, 'Dynamic facet counts retrieved successfully');
    } catch (error) {
      next(error);
    }
  }

  async semanticSearch(req: Request, res: Response, next: NextFunction) {
    try {
      const input: SearchQueryInput = {
        ...req.body,
        query: req.body.query || req.body.q || '',
        mode: 'semantic',
      };
      const results = await hybridSearchService.search(input);
      return sendSuccess(res, results, 'Semantic vector search completed successfully');
    } catch (error) {
      next(error);
    }
  }

  async evaluateRelevance(req: Request, res: Response, next: NextFunction) {
    try {
      const queries = req.body?.queries || [
        {
          query: 'refund double charge payment failed',
          expectedTicketIds: [],
        },
        {
          query: 'package delivery delay shipment tracking',
          expectedTicketIds: [],
        },
        {
          query: 'password reset login 2fa account locked',
          expectedTicketIds: [],
        },
      ];

      const report = await relevanceEvaluator.evaluate(queries);
      return sendSuccess(res, report, 'Relevance evaluation completed');
    } catch (error) {
      next(error);
    }
  }
}

export const searchController = new SearchController();

import { TicketCategory, TicketPriority, TicketStatus } from '@prisma/client';
import { prisma } from '../../config/prisma.js';
import {
  DynamicFacetCounts,
  FacetItem,
  EntityFacetItem,
  SearchQueryInput,
} from './search.types.js';
import { fullTextSearchService } from './fulltext-search.service.js';

export class FacetedFilterService {
  /**
   * Dynamically inspects the database to generate available facet values and their counts,
   * strictly respecting any currently active search terms and filters.
   */
  async getDynamicFacets(input: SearchQueryInput): Promise<DynamicFacetCounts> {
    const where = fullTextSearchService.buildPrismaWhereClause(input);

    // If a text query is present, we must restrict candidates to tickets matching the query
    let candidateIds: string[] | null = null;
    if (input.query && input.query.trim().length > 0) {
      const lexicalMatches = await fullTextSearchService.searchLexical(input);
      candidateIds = lexicalMatches.map((m) => m.ticket.id);
    }

    if (candidateIds !== null) {
      where.id = { in: candidateIds };
    }

    // Retrieve matching tickets with required relations
    const matchingTickets = await prisma.ticket.findMany({
      where,
      include: {
        department: { select: { id: true, name: true } },
        assignedAgent: { select: { id: true, name: true } },
        nlpAnalysis: { select: { intent: true, sentiment: true } },
      },
    });

    const totalMatching = matchingTickets.length;

    // Accumulators for dynamic metadata counts
    const categoryMap = new Map<TicketCategory, number>();
    const intentMap = new Map<string, number>();
    const priorityMap = new Map<TicketPriority, number>();
    const sentimentMap = new Map<string, number>();
    const departmentMap = new Map<string, { name: string; count: number }>();
    const agentMap = new Map<string, { name: string; count: number }>();
    const statusMap = new Map<TicketStatus, number>();

    const now = Date.now();
    const oneDayMs = 24 * 60 * 60 * 1000;
    const sevenDaysMs = 7 * oneDayMs;
    const thirtyDaysMs = 30 * oneDayMs;

    const dateRanges = {
      today: 0,
      thisWeek: 0,
      thisMonth: 0,
      older: 0,
    };

    for (const ticket of matchingTickets) {
      // 1. Categories
      if (ticket.category) {
        categoryMap.set(ticket.category, (categoryMap.get(ticket.category) || 0) + 1);
      }

      // 2. Intents (from NLP analysis)
      if (ticket.nlpAnalysis?.intent) {
        const intent = ticket.nlpAnalysis.intent;
        intentMap.set(intent, (intentMap.get(intent) || 0) + 1);
      }

      // 3. Priorities
      if (ticket.priority) {
        priorityMap.set(ticket.priority, (priorityMap.get(ticket.priority) || 0) + 1);
      }

      // 4. Sentiments
      if (ticket.nlpAnalysis?.sentiment) {
        const sentiment = ticket.nlpAnalysis.sentiment;
        sentimentMap.set(sentiment, (sentimentMap.get(sentiment) || 0) + 1);
      }

      // 5. Departments (Dynamically discovered from indexed records)
      if (ticket.department) {
        const existing = departmentMap.get(ticket.department.id);
        if (existing) {
          existing.count += 1;
        } else {
          departmentMap.set(ticket.department.id, {
            name: ticket.department.name,
            count: 1,
          });
        }
      }

      // 6. Assigned Agents (Dynamically discovered from indexed records)
      if (ticket.assignedAgent) {
        const existing = agentMap.get(ticket.assignedAgent.id);
        if (existing) {
          existing.count += 1;
        } else {
          agentMap.set(ticket.assignedAgent.id, {
            name: ticket.assignedAgent.name,
            count: 1,
          });
        }
      }

      // 7. Statuses
      if (ticket.status) {
        statusMap.set(ticket.status, (statusMap.get(ticket.status) || 0) + 1);
      }

      // 8. Date Range Histograms
      const ageMs = now - new Date(ticket.createdAt).getTime();
      if (ageMs <= oneDayMs) {
        dateRanges.today += 1;
      } else if (ageMs <= sevenDaysMs) {
        dateRanges.thisWeek += 1;
      } else if (ageMs <= thirtyDaysMs) {
        dateRanges.thisMonth += 1;
      } else {
        dateRanges.older += 1;
      }
    }

    // Convert accumulated maps into sorted facet arrays
    const categories: FacetItem<TicketCategory>[] = Array.from(categoryMap.entries())
      .map(([value, count]) => ({ value, count }))
      .sort((a, b) => b.count - a.count);

    const intents: FacetItem<string>[] = Array.from(intentMap.entries())
      .map(([value, count]) => ({ value, count }))
      .sort((a, b) => b.count - a.count);

    const priorities: FacetItem<TicketPriority>[] = Array.from(priorityMap.entries())
      .map(([value, count]) => ({ value, count }))
      .sort((a, b) => b.count - a.count);

    const sentiments: FacetItem<string>[] = Array.from(sentimentMap.entries())
      .map(([value, count]) => ({ value, count }))
      .sort((a, b) => b.count - a.count);

    const departments: EntityFacetItem[] = Array.from(departmentMap.entries())
      .map(([id, info]) => ({ id, name: info.name, count: info.count }))
      .sort((a, b) => b.count - a.count);

    const assignedAgents: EntityFacetItem[] = Array.from(agentMap.entries())
      .map(([id, info]) => ({ id, name: info.name, count: info.count }))
      .sort((a, b) => b.count - a.count);

    const statuses: FacetItem<TicketStatus>[] = Array.from(statusMap.entries())
      .map(([value, count]) => ({ value, count }))
      .sort((a, b) => b.count - a.count);

    return {
      categories,
      intents,
      priorities,
      sentiments,
      departments,
      assignedAgents,
      statuses,
      dateRanges,
      totalMatching,
    };
  }
}

export const facetedFilterService = new FacetedFilterService();

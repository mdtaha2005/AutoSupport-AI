import { TicketStatus, TicketPriority, TicketCategory } from '@prisma/client';

export type SearchMode = 'hybrid' | 'lexical' | 'semantic' | 'rrf';

export interface SearchQueryInput {
  query: string;
  mode?: SearchMode;
  alpha?: number; // 0.0 (pure semantic) to 1.0 (pure lexical), default 0.50
  status?: TicketStatus | TicketStatus[];
  priority?: TicketPriority | TicketPriority[];
  category?: TicketCategory | TicketCategory[];
  intent?: string;
  sentiment?: string;
  departmentId?: string;
  assignedAgentId?: string;
  needsHumanReview?: boolean;
  startDate?: string | Date;
  endDate?: string | Date;
  page?: number;
  limit?: number;
  sortBy?: 'relevance' | 'createdAt' | 'priority' | 'status';
  sortOrder?: 'asc' | 'desc';
}

export interface SearchResultItem {
  id: string;
  ticketNumber: number;
  title: string;
  description: string;
  status: TicketStatus;
  priority: TicketPriority;
  category: TicketCategory | null;
  needsHumanReview: boolean;
  department: {
    id: string;
    name: string;
  } | null;
  assignedAgent: {
    id: string;
    name: string;
    email: string;
  } | null;
  customer: {
    id: string;
    name: string;
    email: string;
  } | null;
  nlpAnalysis?: {
    intent: string;
    sentiment: string;
    sentimentScore: number;
  } | null;
  scores: {
    lexicalScore: number;
    semanticScore: number;
    hybridScore: number;
    matchedCommentsCount?: number;
  };
  createdAt: Date;
  updatedAt: Date;
}

export interface PaginatedSearchResults {
  items: SearchResultItem[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
  executionTimeMs: number;
  mode: SearchMode;
  alpha: number;
}

export interface FacetItem<T = string> {
  value: T;
  label?: string;
  count: number;
}

export interface EntityFacetItem {
  id: string;
  name: string;
  count: number;
}

export interface DynamicFacetCounts {
  categories: FacetItem<TicketCategory>[];
  intents: FacetItem<string>[];
  priorities: FacetItem<TicketPriority>[];
  sentiments: FacetItem<string>[];
  departments: EntityFacetItem[];
  assignedAgents: EntityFacetItem[];
  statuses: FacetItem<TicketStatus>[];
  dateRanges: {
    today: number;
    thisWeek: number;
    thisMonth: number;
    older: number;
  };
  totalMatching: number;
}

export interface RelevanceMetricResult {
  precisionAtK: Record<number, number>;
  recallAtK: Record<number, number>;
  ndcgAtK: Record<number, number>;
  meanAveragePrecision: number;
  evaluatedQueriesCount: number;
  details: Array<{
    query: string;
    expectedCount: number;
    retrievedCount: number;
    pAt3: number;
    pAt5: number;
    pAt10: number;
    rAt3: number;
    rAt5: number;
    rAt10: number;
    ndcgAt3: number;
    ndcgAt5: number;
    ndcgAt10: number;
  }>;
}

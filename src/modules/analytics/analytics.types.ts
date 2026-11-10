import { TicketCategory, TicketPriority, TicketStatus } from '@prisma/client';

export interface AnalyticsFilterInput {
  startDate?: string | Date;
  endDate?: string | Date;
  departmentId?: string;
}

export interface VolumeTimeSeriesPoint {
  date: string;
  created: number;
  resolved: number;
  closed: number;
}

export interface TicketVolumeMetrics {
  interval: 'hour' | 'day' | 'week' | 'month';
  timeSeries: VolumeTimeSeriesPoint[];
  totalCreated: number;
  totalResolved: number;
  totalClosed: number;
}

export interface CategoryDistributionItem {
  category: TicketCategory | 'UNCLASSIFIED';
  count: number;
  percentage: number;
}

export interface IntentDistributionItem {
  intent: string;
  count: number;
  percentage: number;
}

export interface CategoryDistributionMetrics {
  totalAnalyzed: number;
  categories: CategoryDistributionItem[];
  topIntents: IntentDistributionItem[];
}

export interface ResolutionGroupMetric {
  count: number;
  avgHours: number;
  minHours: number;
  maxHours: number;
}

export interface ResolutionTimeMetrics {
  overallAverageHours: number;
  overallMedianHours: number;
  totalResolvedSample: number;
  byPriority: Record<string, ResolutionGroupMetric>;
  byCategory: Record<string, ResolutionGroupMetric>;
  byDepartment: Record<string, ResolutionGroupMetric>;
}

export interface AgentWorkloadItem {
  agentId: string;
  name: string;
  email: string;
  departmentId: string | null;
  departmentName: string | null;
  currentWorkload: number;
  maxWorkload: number;
  utilizationPercentage: number;
  status: string;
}

export interface AgentWorkloadMetrics {
  totalAgents: number;
  activeAgents: number; // ONLINE or BUSY
  overallAverageWorkload: number;
  overallAverageCapacity: number;
  fleetUtilizationRate: number; // Total current workload / Total max workload * 100
  agents: AgentWorkloadItem[];
}

export interface AssignmentDistributionMetrics {
  totalAssignedTickets: number;
  automatedCount: number;
  automatedPercentage: number;
  manualCount: number;
  manualPercentage: number;
  reassignmentCount: number;
  escalationCount: number;
  byDepartment: Array<{
    departmentId: string;
    departmentName: string;
    count: number;
    percentage: number;
  }>;
}

export interface EscalationMetrics {
  totalTickets: number;
  escalatedCount: number;
  escalationRatePercentage: number;
  byEscalationLevel: Record<number, number>;
  byDepartment: Array<{
    departmentId: string;
    departmentName: string;
    escalatedCount: number;
  }>;
}

export interface StatusDistributionMetrics {
  total: number;
  openBacklog: number; // OPEN + IN_PROGRESS + PENDING_CUSTOMER
  resolvedCount: number;
  closedCount: number;
  byStatus: Record<TicketStatus, { count: number; percentage: number }>;
}

export interface AnalyticsOverviewMetrics {
  totalTickets: number;
  openBacklog: number;
  resolvedTickets: number;
  averageResolutionHours: number;
  escalationRatePercentage: number;
  fleetUtilizationRate: number;
  topCategory: string | null;
}

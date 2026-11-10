import { TicketStatus, TicketPriority, TicketCategory, Prisma } from '@prisma/client';
import { prisma } from '../../config/prisma.js';
import {
  AnalyticsFilterInput,
  AnalyticsOverviewMetrics,
  TicketVolumeMetrics,
  VolumeTimeSeriesPoint,
  CategoryDistributionMetrics,
  ResolutionTimeMetrics,
  ResolutionGroupMetric,
  AgentWorkloadMetrics,
  AssignmentDistributionMetrics,
  EscalationMetrics,
  StatusDistributionMetrics,
} from './analytics.types.js';

export class AnalyticsService {
  /**
   * Helper to build base date and department filters
   */
  private buildBaseWhere(filters: AnalyticsFilterInput): Prisma.TicketWhereInput {
    const where: Prisma.TicketWhereInput = {};

    if (filters.departmentId) {
      where.departmentId = filters.departmentId;
    }

    if (filters.startDate || filters.endDate) {
      where.createdAt = {};
      if (filters.startDate) {
        where.createdAt.gte = new Date(filters.startDate);
      }
      if (filters.endDate) {
        where.createdAt.lte = new Date(filters.endDate);
      }
    }

    return where;
  }

  /**
   * High-level Executive Overview Metrics
   */
  async getOverview(filters: AnalyticsFilterInput): Promise<AnalyticsOverviewMetrics> {
    const where = this.buildBaseWhere(filters);

    const [tickets, agentWorkload, resolutionMetrics] = await Promise.all([
      prisma.ticket.findMany({
        where,
        select: {
          id: true,
          status: true,
          category: true,
          escalationLevel: true,
          routingStatus: true,
        },
      }),
      this.getAgentWorkload(filters.departmentId),
      this.getResolutionTime(filters),
    ]);

    const totalTickets = tickets.length;
    let openBacklog = 0;
    let resolvedTickets = 0;
    let escalatedTickets = 0;
    const categoryCounts: Record<string, number> = {};

    for (const t of tickets) {
      if (
        t.status === TicketStatus.OPEN ||
        t.status === TicketStatus.IN_PROGRESS ||
        t.status === TicketStatus.PENDING_CUSTOMER
      ) {
        openBacklog++;
      } else if (t.status === TicketStatus.RESOLVED || t.status === TicketStatus.CLOSED) {
        resolvedTickets++;
      }

      if (t.escalationLevel > 0 || t.routingStatus === 'ESCALATED') {
        escalatedTickets++;
      }

      if (t.category) {
        categoryCounts[t.category] = (categoryCounts[t.category] || 0) + 1;
      }
    }

    let topCategory: string | null = null;
    let maxCatCount = 0;
    for (const [cat, count] of Object.entries(categoryCounts)) {
      if (count > maxCatCount) {
        maxCatCount = count;
        topCategory = cat;
      }
    }

    const escalationRatePercentage = totalTickets > 0
      ? Number(((escalatedTickets / totalTickets) * 100).toFixed(2))
      : 0;

    return {
      totalTickets,
      openBacklog,
      resolvedTickets,
      averageResolutionHours: resolutionMetrics.overallAverageHours,
      escalationRatePercentage,
      fleetUtilizationRate: agentWorkload.fleetUtilizationRate,
      topCategory,
    };
  }

  /**
   * Time-Series Ticket Volume (Hourly, Daily, Weekly, Monthly)
   */
  async getTicketVolume(
    filters: AnalyticsFilterInput,
    interval: 'hour' | 'day' | 'week' | 'month' = 'day'
  ): Promise<TicketVolumeMetrics> {
    const where = this.buildBaseWhere(filters);

    const tickets = await prisma.ticket.findMany({
      where,
      select: {
        createdAt: true,
        resolvedAt: true,
        closedAt: true,
      },
    });

    const seriesMap = new Map<string, VolumeTimeSeriesPoint>();

    const formatBucketKey = (d: Date): string => {
      const year = d.getUTCFullYear();
      const month = String(d.getUTCMonth() + 1).padStart(2, '0');
      const day = String(d.getUTCDate()).padStart(2, '0');
      const hour = String(d.getUTCHours()).padStart(2, '0');

      if (interval === 'hour') return `${year}-${month}-${day} ${hour}:00`;
      if (interval === 'month') return `${year}-${month}`;
      if (interval === 'week') {
        // Approximate week key
        const firstDayOfYear = new Date(Date.UTC(year, 0, 1));
        const pastDaysOfYear = (d.getTime() - firstDayOfYear.getTime()) / 86400000;
        const weekNum = Math.ceil((pastDaysOfYear + firstDayOfYear.getUTCDay() + 1) / 7);
        return `${year}-W${String(weekNum).padStart(2, '0')}`;
      }
      return `${year}-${month}-${day}`; // default 'day'
    };

    let totalCreated = 0;
    let totalResolved = 0;
    let totalClosed = 0;

    for (const t of tickets) {
      totalCreated++;
      const createdKey = formatBucketKey(new Date(t.createdAt));
      if (!seriesMap.has(createdKey)) {
        seriesMap.set(createdKey, { date: createdKey, created: 0, resolved: 0, closed: 0 });
      }
      seriesMap.get(createdKey)!.created++;

      if (t.resolvedAt) {
        totalResolved++;
        const resolvedKey = formatBucketKey(new Date(t.resolvedAt));
        if (!seriesMap.has(resolvedKey)) {
          seriesMap.set(resolvedKey, { date: resolvedKey, created: 0, resolved: 0, closed: 0 });
        }
        seriesMap.get(resolvedKey)!.resolved++;
      }

      if (t.closedAt) {
        totalClosed++;
        const closedKey = formatBucketKey(new Date(t.closedAt));
        if (!seriesMap.has(closedKey)) {
          seriesMap.set(closedKey, { date: closedKey, created: 0, resolved: 0, closed: 0 });
        }
        seriesMap.get(closedKey)!.closed++;
      }
    }

    const timeSeries = Array.from(seriesMap.values()).sort((a, b) =>
      a.date.localeCompare(b.date)
    );

    return {
      interval,
      timeSeries,
      totalCreated,
      totalResolved,
      totalClosed,
    };
  }

  /**
   * Category and Intent Distribution with percentages
   */
  async getCategoryDistribution(
    filters: AnalyticsFilterInput
  ): Promise<CategoryDistributionMetrics> {
    const where = this.buildBaseWhere(filters);

    const tickets = await prisma.ticket.findMany({
      where,
      select: {
        category: true,
        nlpAnalysis: { select: { intent: true } },
      },
    });

    const total = tickets.length;
    const catMap = new Map<string, number>();
    const intentMap = new Map<string, number>();

    for (const t of tickets) {
      const cat = t.category || 'UNCLASSIFIED';
      catMap.set(cat, (catMap.get(cat) || 0) + 1);

      if (t.nlpAnalysis?.intent) {
        intentMap.set(t.nlpAnalysis.intent, (intentMap.get(t.nlpAnalysis.intent) || 0) + 1);
      }
    }

    const categories = Array.from(catMap.entries())
      .map(([category, count]) => ({
        category: category as TicketCategory | 'UNCLASSIFIED',
        count,
        percentage: total > 0 ? Number(((count / total) * 100).toFixed(2)) : 0,
      }))
      .sort((a, b) => b.count - a.count);

    const topIntents = Array.from(intentMap.entries())
      .map(([intent, count]) => ({
        intent,
        count,
        percentage: total > 0 ? Number(((count / total) * 100).toFixed(2)) : 0,
      }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 15);

    return {
      totalAnalyzed: total,
      categories,
      topIntents,
    };
  }

  /**
   * Mean Time to Resolution (MTTR) broken down by priority, category, department
   */
  async getResolutionTime(filters: AnalyticsFilterInput): Promise<ResolutionTimeMetrics> {
    const where = this.buildBaseWhere(filters);
    where.resolvedAt = { not: null };

    const resolvedTickets = await prisma.ticket.findMany({
      where,
      select: {
        createdAt: true,
        resolvedAt: true,
        priority: true,
        category: true,
        department: { select: { name: true } },
      },
    });

    if (resolvedTickets.length === 0) {
      return {
        overallAverageHours: 0,
        overallMedianHours: 0,
        totalResolvedSample: 0,
        byPriority: {},
        byCategory: {},
        byDepartment: {},
      };
    }

    const allDurations: number[] = [];
    const priorityDurations = new Map<string, number[]>();
    const categoryDurations = new Map<string, number[]>();
    const departmentDurations = new Map<string, number[]>();

    for (const t of resolvedTickets) {
      if (!t.resolvedAt) continue;
      const hours = (new Date(t.resolvedAt).getTime() - new Date(t.createdAt).getTime()) / 3600000;
      const positiveHours = Math.max(0, hours);

      allDurations.push(positiveHours);

      // Priority grouping
      const pKey = t.priority;
      if (!priorityDurations.has(pKey)) priorityDurations.set(pKey, []);
      priorityDurations.get(pKey)!.push(positiveHours);

      // Category grouping
      const cKey = t.category || 'UNCLASSIFIED';
      if (!categoryDurations.has(cKey)) categoryDurations.set(cKey, []);
      categoryDurations.get(cKey)!.push(positiveHours);

      // Department grouping
      const dKey = t.department?.name || 'Unassigned';
      if (!departmentDurations.has(dKey)) departmentDurations.set(dKey, []);
      departmentDurations.get(dKey)!.push(positiveHours);
    }

    const computeGroupMetric = (durations: number[]): ResolutionGroupMetric => {
      if (durations.length === 0) return { count: 0, avgHours: 0, minHours: 0, maxHours: 0 };
      const sum = durations.reduce((a, b) => a + b, 0);
      return {
        count: durations.length,
        avgHours: Number((sum / durations.length).toFixed(2)),
        minHours: Number(Math.min(...durations).toFixed(2)),
        maxHours: Number(Math.max(...durations).toFixed(2)),
      };
    };

    allDurations.sort((a, b) => a - b);
    const overallSum = allDurations.reduce((a, b) => a + b, 0);
    const overallAverageHours = Number((overallSum / allDurations.length).toFixed(2));
    const mid = Math.floor(allDurations.length / 2);
    const overallMedianHours = Number(
      (allDurations.length % 2 !== 0
        ? allDurations[mid]
        : (allDurations[mid - 1] + allDurations[mid]) / 2
      ).toFixed(2)
    );

    const byPriority: Record<string, ResolutionGroupMetric> = {};
    for (const [k, v] of priorityDurations.entries()) {
      byPriority[k] = computeGroupMetric(v);
    }

    const byCategory: Record<string, ResolutionGroupMetric> = {};
    for (const [k, v] of categoryDurations.entries()) {
      byCategory[k] = computeGroupMetric(v);
    }

    const byDepartment: Record<string, ResolutionGroupMetric> = {};
    for (const [k, v] of departmentDurations.entries()) {
      byDepartment[k] = computeGroupMetric(v);
    }

    return {
      overallAverageHours,
      overallMedianHours,
      totalResolvedSample: allDurations.length,
      byPriority,
      byCategory,
      byDepartment,
    };
  }

  /**
   * Agent Workload, Capacity Utilization, and Distribution
   */
  async getAgentWorkload(departmentId?: string): Promise<AgentWorkloadMetrics> {
    const where: Prisma.AgentProfileWhereInput = {};
    if (departmentId) {
      where.departmentId = departmentId;
    }

    const profiles = await prisma.agentProfile.findMany({
      where,
      include: {
        user: { select: { id: true, name: true, email: true } },
        department: { select: { id: true, name: true } },
      },
    });

    const totalAgents = profiles.length;
    let activeAgents = 0;
    let sumWorkload = 0;
    let sumMaxWorkload = 0;

    const agents = profiles.map((p) => {
      if (p.availabilityStatus === 'AVAILABLE' || p.availabilityStatus === 'BUSY') {
        activeAgents++;
      }
      sumWorkload += p.currentWorkload;
      sumMaxWorkload += p.maxWorkload;

      const util = p.maxWorkload > 0
        ? Number(((p.currentWorkload / p.maxWorkload) * 100).toFixed(1))
        : 0;

      return {
        agentId: p.userId,
        name: p.user.name,
        email: p.user.email,
        departmentId: p.departmentId,
        departmentName: p.department?.name || null,
        currentWorkload: p.currentWorkload,
        maxWorkload: p.maxWorkload,
        utilizationPercentage: util,
        status: p.availabilityStatus,
      };
    });

    const fleetUtilizationRate = sumMaxWorkload > 0
      ? Number(((sumWorkload / sumMaxWorkload) * 100).toFixed(2))
      : 0;

    const overallAverageWorkload = totalAgents > 0
      ? Number((sumWorkload / totalAgents).toFixed(2))
      : 0;

    const overallAverageCapacity = totalAgents > 0
      ? Number((sumMaxWorkload / totalAgents).toFixed(2))
      : 0;

    return {
      totalAgents,
      activeAgents,
      overallAverageWorkload,
      overallAverageCapacity,
      fleetUtilizationRate,
      agents,
    };
  }

  /**
   * Assignment Distribution: Automated vs Manual vs Reassignments
   */
  async getAssignmentDistribution(
    filters: AnalyticsFilterInput
  ): Promise<AssignmentDistributionMetrics> {
    const where = this.buildBaseWhere(filters);
    where.assignedAgentId = { not: null };

    const [assignedTickets, histories] = await Promise.all([
      prisma.ticket.findMany({
        where,
        select: {
          id: true,
          isManuallyAssigned: true,
          departmentId: true,
          department: { select: { id: true, name: true } },
        },
      }),
      prisma.ticketAssignmentHistory.findMany({
        select: { assignmentType: true },
      }),
    ]);

    const totalAssignedTickets = assignedTickets.length;
    let manualCount = 0;
    let automatedCount = 0;
    const deptCountMap = new Map<string, { name: string; count: number }>();

    for (const t of assignedTickets) {
      if (t.isManuallyAssigned) {
        manualCount++;
      } else {
        automatedCount++;
      }

      if (t.department) {
        const existing = deptCountMap.get(t.department.id);
        if (existing) {
          existing.count++;
        } else {
          deptCountMap.set(t.department.id, { name: t.department.name, count: 1 });
        }
      }
    }

    let reassignmentCount = 0;
    let escalationCount = 0;
    for (const h of histories) {
      if (h.assignmentType === 'REASSIGNMENT') reassignmentCount++;
      if (h.assignmentType === 'ESCALATION') escalationCount++;
    }

    const byDepartment = Array.from(deptCountMap.entries()).map(([deptId, val]) => ({
      departmentId: deptId,
      departmentName: val.name,
      count: val.count,
      percentage: totalAssignedTickets > 0
        ? Number(((val.count / totalAssignedTickets) * 100).toFixed(2))
        : 0,
    }));

    return {
      totalAssignedTickets,
      automatedCount,
      automatedPercentage: totalAssignedTickets > 0
        ? Number(((automatedCount / totalAssignedTickets) * 100).toFixed(2))
        : 0,
      manualCount,
      manualPercentage: totalAssignedTickets > 0
        ? Number(((manualCount / totalAssignedTickets) * 100).toFixed(2))
        : 0,
      reassignmentCount,
      escalationCount,
      byDepartment,
    };
  }

  /**
   * Escalation Metrics and Rates
   */
  async getEscalationMetrics(filters: AnalyticsFilterInput): Promise<EscalationMetrics> {
    const where = this.buildBaseWhere(filters);

    const tickets = await prisma.ticket.findMany({
      where,
      select: {
        escalationLevel: true,
        routingStatus: true,
        departmentId: true,
        department: { select: { id: true, name: true } },
      },
    });

    const totalTickets = tickets.length;
    let escalatedCount = 0;
    const byEscalationLevel: Record<number, number> = {};
    const deptEscalationMap = new Map<string, { name: string; count: number }>();

    for (const t of tickets) {
      const isEscalated = t.escalationLevel > 0 || t.routingStatus === 'ESCALATED';
      if (isEscalated) {
        escalatedCount++;
        const lvl = t.escalationLevel || 1;
        byEscalationLevel[lvl] = (byEscalationLevel[lvl] || 0) + 1;

        const deptId = t.departmentId || 'unassigned';
        const deptName = t.department?.name || 'Unassigned';
        const existing = deptEscalationMap.get(deptId);
        if (existing) {
          existing.count++;
        } else {
          deptEscalationMap.set(deptId, { name: deptName, count: 1 });
        }
      }
    }

    const byDepartment = Array.from(deptEscalationMap.entries()).map(([departmentId, val]) => ({
      departmentId,
      departmentName: val.name,
      escalatedCount: val.count,
    }));

    return {
      totalTickets,
      escalatedCount,
      escalationRatePercentage: totalTickets > 0
        ? Number(((escalatedCount / totalTickets) * 100).toFixed(2))
        : 0,
      byEscalationLevel,
      byDepartment,
    };
  }

  /**
   * Ticket Status Distribution and Backlog
   */
  async getStatusDistribution(filters: AnalyticsFilterInput): Promise<StatusDistributionMetrics> {
    const where = this.buildBaseWhere(filters);

    const tickets = await prisma.ticket.findMany({
      where,
      select: { status: true },
    });

    const total = tickets.length;
    const countMap: Record<TicketStatus, number> = {
      OPEN: 0,
      IN_PROGRESS: 0,
      PENDING_CUSTOMER: 0,
      RESOLVED: 0,
      CLOSED: 0,
    };

    for (const t of tickets) {
      if (countMap[t.status] !== undefined) {
        countMap[t.status]++;
      }
    }

    const openBacklog = countMap.OPEN + countMap.IN_PROGRESS + countMap.PENDING_CUSTOMER;
    const resolvedCount = countMap.RESOLVED;
    const closedCount = countMap.CLOSED;

    const byStatus: Record<TicketStatus, { count: number; percentage: number }> = {
      OPEN: {
        count: countMap.OPEN,
        percentage: total > 0 ? Number(((countMap.OPEN / total) * 100).toFixed(2)) : 0,
      },
      IN_PROGRESS: {
        count: countMap.IN_PROGRESS,
        percentage: total > 0 ? Number(((countMap.IN_PROGRESS / total) * 100).toFixed(2)) : 0,
      },
      PENDING_CUSTOMER: {
        count: countMap.PENDING_CUSTOMER,
        percentage: total > 0 ? Number(((countMap.PENDING_CUSTOMER / total) * 100).toFixed(2)) : 0,
      },
      RESOLVED: {
        count: countMap.RESOLVED,
        percentage: total > 0 ? Number(((countMap.RESOLVED / total) * 100).toFixed(2)) : 0,
      },
      CLOSED: {
        count: countMap.CLOSED,
        percentage: total > 0 ? Number(((countMap.CLOSED / total) * 100).toFixed(2)) : 0,
      },
    };

    return {
      total,
      openBacklog,
      resolvedCount,
      closedCount,
      byStatus,
    };
  }
}

export const analyticsService = new AnalyticsService();

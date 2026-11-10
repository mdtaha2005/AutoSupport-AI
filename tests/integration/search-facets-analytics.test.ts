import { describe, it, expect, beforeEach, vi } from 'vitest';
import request from 'supertest';
import { UserRole, AvailabilityStatus, TicketPriority, TicketStatus, TicketCategory, RoutingStatus } from '@prisma/client';
import { app } from '../../src/app.js';
import { store, resetStore } from '../helpers/test-db.js';
import { signJwt } from '../../src/utils/jwt.js';

vi.mock('../../src/config/prisma.js', async () => {
  const { mockPrisma } = await import('../helpers/test-db.js');
  return { prisma: mockPrisma };
});

describe('Phase 4: Search Engine, Dynamic Facets & Analytics Integration Tests', () => {
  let adminToken: string;
  let managerToken: string;
  let agentToken: string;
  let customerToken: string;

  let billingDeptId: string;
  let techDeptId: string;
  let agentBobId: string;

  beforeEach(() => {
    resetStore();

    // 1. Setup Users
    const adminUser = {
      id: 'admin-uuid-001',
      email: 'admin@system.com',
      passwordHash: 'hash',
      name: 'System Admin',
      role: UserRole.ADMIN,
      isActive: true,
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    const managerUser = {
      id: 'manager-uuid-002',
      email: 'manager@system.com',
      passwordHash: 'hash',
      name: 'Support Manager',
      role: UserRole.MANAGER,
      isActive: true,
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    const agentUser = {
      id: 'agent-bob-uuid-003',
      email: 'bob@system.com',
      passwordHash: 'hash',
      name: 'Bob Agent',
      role: UserRole.AGENT,
      isActive: true,
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    const customerUser = {
      id: 'customer-uuid-004',
      email: 'alice@customer.com',
      passwordHash: 'hash',
      name: 'Alice Customer',
      role: UserRole.CUSTOMER,
      isActive: true,
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    store.users.push(adminUser, managerUser, agentUser, customerUser);

    adminToken = signJwt({ id: adminUser.id, email: adminUser.email, role: adminUser.role, name: adminUser.name });
    managerToken = signJwt({ id: managerUser.id, email: managerUser.email, role: managerUser.role, name: managerUser.name });
    agentToken = signJwt({ id: agentUser.id, email: agentUser.email, role: agentUser.role, name: agentUser.name });
    customerToken = signJwt({ id: customerUser.id, email: customerUser.email, role: customerUser.role, name: customerUser.name });

    // 2. Setup Departments
    billingDeptId = 'dept-billing-001';
    techDeptId = 'dept-tech-002';
    store.departments.push(
      { id: billingDeptId, name: 'Billing Support', description: 'Payments & Refunds', isActive: true, createdAt: new Date(), updatedAt: new Date() },
      { id: techDeptId, name: 'Technical Support', description: 'Tech & Servers', isActive: true, createdAt: new Date(), updatedAt: new Date() }
    );

    // 3. Setup Agent Profile
    agentBobId = agentUser.id;
    store.agentProfiles.push({
      id: 'profile-bob-001',
      userId: agentBobId,
      departmentId: billingDeptId,
      skills: ['PAYMENT', 'REFUND'],
      availabilityStatus: AvailabilityStatus.AVAILABLE,
      maxWorkload: 5,
      currentWorkload: 2,
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    // 4. Setup Seed Tickets
    const ticket1 = {
      id: 'ticket-001-payment',
      ticketNumber: 4001,
      title: 'Payment failed for invoice INV-998822',
      description: 'Customer credit card was declined multiple times during checkout',
      priority: TicketPriority.HIGH,
      status: TicketStatus.OPEN,
      category: TicketCategory.PAYMENT,
      needsHumanReview: false,
      departmentId: billingDeptId,
      assignedAgentId: agentBobId,
      routingStatus: RoutingStatus.ASSIGNED,
      isManuallyAssigned: false,
      escalationLevel: 0,
      createdAt: new Date(Date.now() - 3600000 * 5), // 5 hours ago
      updatedAt: new Date(),
    };

    const ticket2 = {
      id: 'ticket-002-refund',
      ticketNumber: 4002,
      title: 'Request refund for damaged shipment item',
      description: 'Item arrived broken inside delivery packaging. Need immediate credit refund.',
      priority: TicketPriority.MEDIUM,
      status: TicketStatus.IN_PROGRESS,
      category: TicketCategory.REFUND,
      needsHumanReview: false,
      departmentId: billingDeptId,
      assignedAgentId: agentBobId,
      routingStatus: RoutingStatus.ASSIGNED,
      isManuallyAssigned: false,
      escalationLevel: 0,
      createdAt: new Date(Date.now() - 3600000 * 20), // 20 hours ago
      updatedAt: new Date(),
    };

    const ticket3 = {
      id: 'ticket-003-technical',
      ticketNumber: 4003,
      title: 'Server timeout 500 on API gateway authorization',
      description: 'Microservice returned internal server error 500 when authenticating user tokens',
      priority: TicketPriority.URGENT,
      status: TicketStatus.OPEN,
      category: TicketCategory.TECHNICAL,
      needsHumanReview: true,
      departmentId: techDeptId,
      assignedAgentId: null,
      routingStatus: RoutingStatus.ESCALATED,
      isManuallyAssigned: false,
      escalationLevel: 1,
      createdAt: new Date(Date.now() - 3600000 * 48), // 2 days ago
      updatedAt: new Date(),
    };

    const ticket4 = {
      id: 'ticket-004-delivery',
      ticketNumber: 4004,
      title: 'Package tracking number missing from shipping email',
      description: 'Where is my order? Ordered last week but never received tracking confirmation',
      priority: TicketPriority.LOW,
      status: TicketStatus.RESOLVED,
      category: TicketCategory.DELIVERY,
      needsHumanReview: false,
      departmentId: billingDeptId,
      assignedAgentId: agentBobId,
      routingStatus: RoutingStatus.ASSIGNED,
      isManuallyAssigned: true,
      escalationLevel: 0,
      resolvedAt: new Date(Date.now() - 3600000 * 2),
      createdAt: new Date(Date.now() - 3600000 * 10), // 10 hours ago, resolved 2 hours ago -> MTTR 8h
      updatedAt: new Date(),
    };

    store.tickets.push(ticket1, ticket2, ticket3, ticket4);

    // 5. Setup Ticket Comments (including unique keyword for comment search)
    store.ticketComments.push(
      {
        id: 'comment-001',
        ticketId: ticket1.id,
        authorId: agentBobId,
        content: 'Investigated gateway logs: gateway responded with error code EXPIRED_CVV_TOKEN',
        isInternal: false,
        createdAt: new Date(),
        updatedAt: new Date(),
      }
    );

    // 6. Setup NLP Analyses for dynamic intent/sentiment facets
    store.ticketNlpAnalyses.push(
      {
        id: 'nlp-001',
        ticketId: ticket1.id,
        category: TicketCategory.PAYMENT,
        categoryConfidence: 0.95,
        intent: 'payment_failed',
        intentConfidence: 0.92,
        priorityPredicted: TicketPriority.HIGH,
        priorityConfidence: 0.88,
        sentiment: 'NEGATIVE',
        sentimentScore: -0.65,
        urgencyDetected: false,
        extractedEntities: {},
        needsHumanReview: false,
      },
      {
        id: 'nlp-002',
        ticketId: ticket2.id,
        category: TicketCategory.REFUND,
        categoryConfidence: 0.91,
        intent: 'request_refund',
        intentConfidence: 0.89,
        priorityPredicted: TicketPriority.MEDIUM,
        priorityConfidence: 0.85,
        sentiment: 'NEGATIVE',
        sentimentScore: -0.40,
        urgencyDetected: true,
        extractedEntities: {},
        needsHumanReview: false,
      },
      {
        id: 'nlp-003',
        ticketId: ticket3.id,
        category: TicketCategory.TECHNICAL,
        categoryConfidence: 0.98,
        intent: 'api_error',
        intentConfidence: 0.96,
        priorityPredicted: TicketPriority.URGENT,
        priorityConfidence: 0.94,
        sentiment: 'NEGATIVE',
        sentimentScore: -0.80,
        urgencyDetected: true,
        extractedEntities: {},
        needsHumanReview: true,
      },
      {
        id: 'nlp-004',
        ticketId: ticket4.id,
        category: TicketCategory.DELIVERY,
        categoryConfidence: 0.94,
        intent: 'track_shipment',
        intentConfidence: 0.90,
        priorityPredicted: TicketPriority.LOW,
        priorityConfidence: 0.80,
        sentiment: 'NEUTRAL',
        sentimentScore: 0.05,
        urgencyDetected: false,
        extractedEntities: {},
        needsHumanReview: false,
      }
    );
  });

  describe('1. Search Engine & Hybrid Retrieval Endpoints', () => {
    it('GET /api/v1/search should execute hybrid search with query terms and return scores', async () => {
      const res = await request(app)
        .get('/api/v1/search?q=payment+declined')
        .set('Authorization', `Bearer ${managerToken}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.items).toBeDefined();
      expect(res.body.data.total).toBeGreaterThan(0);

      const topResult = res.body.data.items[0];
      expect(topResult.id).toBe('ticket-001-payment');
      expect(topResult.scores).toBeDefined();
      expect(topResult.scores.hybridScore).toBeGreaterThan(0);
      expect(topResult.scores.lexicalScore).toBeGreaterThan(0);
      expect(res.body.data.executionTimeMs).toBeGreaterThanOrEqual(0);
    });

    it('GET /api/v1/search with mode=lexical should run lexical full-text search', async () => {
      const res = await request(app)
        .get('/api/v1/search?q=invoice&mode=lexical')
        .set('Authorization', `Bearer ${agentToken}`);

      expect(res.status).toBe(200);
      expect(res.body.data.mode).toBe('lexical');
      expect(res.body.data.items.length).toBeGreaterThan(0);
      expect(res.body.data.items[0].id).toBe('ticket-001-payment');
    });

    it('GET /api/v1/search should find tickets matching content in ticket comments', async () => {
      const res = await request(app)
        .get('/api/v1/search?q=EXPIRED_CVV_TOKEN')
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.status).toBe(200);
      expect(res.body.data.total).toBeGreaterThan(0);
      const matched = res.body.data.items.find((it: any) => it.id === 'ticket-001-payment');
      expect(matched).toBeDefined();
      expect(matched.scores.matchedCommentsCount).toBeGreaterThan(0);
    });

    it('GET /api/v1/search with mode=rrf should compute Reciprocal Rank Fusion scores', async () => {
      const res = await request(app)
        .get('/api/v1/search?q=refund+broken&mode=rrf')
        .set('Authorization', `Bearer ${managerToken}`);

      expect(res.status).toBe(200);
      expect(res.body.data.mode).toBe('rrf');
      expect(res.body.data.items.length).toBeGreaterThan(0);
      expect(res.body.data.items[0].id).toBe('ticket-002-refund');
    });

    it('POST /api/v1/search/semantic should perform dense vector semantic search', async () => {
      const res = await request(app)
        .post('/api/v1/search/semantic')
        .set('Authorization', `Bearer ${agentToken}`)
        .send({ query: 'money return damaged order' });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.items).toBeDefined();
    });

    it('GET /api/v1/search/evaluate should compute Precision@K, Recall@K, and NDCG@K report', async () => {
      const res = await request(app)
        .get('/api/v1/search/evaluate')
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.precisionAtK).toBeDefined();
      expect(res.body.data.recallAtK).toBeDefined();
      expect(res.body.data.ndcgAtK).toBeDefined();
      expect(res.body.data.meanAveragePrecision).toBeGreaterThanOrEqual(0);
    });
  });

  describe('2. Dynamic Faceted Filtering Endpoints', () => {
    it('GET /api/v1/search/facets should return dynamic metadata values from indexed tickets', async () => {
      const res = await request(app)
        .get('/api/v1/search/facets')
        .set('Authorization', `Bearer ${managerToken}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      const facets = res.body.data;

      expect(facets.totalMatching).toBe(4);
      expect(facets.categories.length).toBe(4); // PAYMENT, REFUND, TECHNICAL, DELIVERY
      expect(facets.intents.length).toBe(4);    // payment_failed, request_refund, api_error, track_shipment
      expect(facets.departments.length).toBe(2); // Billing Support, Technical Support
      expect(facets.statuses.length).toBe(3);   // OPEN, IN_PROGRESS, RESOLVED
      expect(facets.dateRanges).toBeDefined();
      expect(facets.dateRanges.today).toBeGreaterThan(0);
    });

    it('GET /api/v1/search/facets with active filter should ensure counts strictly respect active filter', async () => {
      // Filter by category=PAYMENT only
      const res = await request(app)
        .get('/api/v1/search/facets?category=PAYMENT')
        .set('Authorization', `Bearer ${managerToken}`);

      expect(res.status).toBe(200);
      const facets = res.body.data;

      // Only the 1 payment ticket should be counted
      expect(facets.totalMatching).toBe(1);
      expect(facets.categories).toEqual([{ value: 'PAYMENT', count: 1 }]);
      expect(facets.intents).toEqual([{ value: 'payment_failed', count: 1 }]);
      expect(facets.priorities).toEqual([{ value: 'HIGH', count: 1 }]);
      expect(facets.statuses).toEqual([{ value: 'OPEN', count: 1 }]);
    });

    it('GET /api/v1/search/facets with status=OPEN should narrow counts to open tickets', async () => {
      const res = await request(app)
        .get('/api/v1/search/facets?status=OPEN')
        .set('Authorization', `Bearer ${agentToken}`);

      expect(res.status).toBe(200);
      const facets = res.body.data;
      // ticket1 (PAYMENT) and ticket3 (TECHNICAL) are OPEN
      expect(facets.totalMatching).toBe(2);
      expect(facets.statuses).toEqual([{ value: 'OPEN', count: 2 }]);
    });
  });

  describe('3. Analytics & BI Reporting Endpoints', () => {
    it('GET /api/v1/analytics/overview should return operational summary metrics', async () => {
      const res = await request(app)
        .get('/api/v1/analytics/overview')
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      const data = res.body.data;

      expect(data.totalTickets).toBe(4);
      expect(data.openBacklog).toBe(3); // 2 OPEN + 1 IN_PROGRESS
      expect(data.resolvedTickets).toBe(1);
      expect(data.escalationRatePercentage).toBe(25); // 1 out of 4 is escalated (25%)
      expect(data.fleetUtilizationRate).toBe(40);     // 2 currentWorkload out of 5 maxWorkload (40%)
    });

    it('GET /api/v1/analytics/volume should return time-series ticket volumes', async () => {
      const res = await request(app)
        .get('/api/v1/analytics/volume?interval=day')
        .set('Authorization', `Bearer ${managerToken}`);

      expect(res.status).toBe(200);
      expect(res.body.data.interval).toBe('day');
      expect(res.body.data.totalCreated).toBe(4);
      expect(res.body.data.totalResolved).toBe(1);
      expect(Array.isArray(res.body.data.timeSeries)).toBe(true);
    });

    it('GET /api/v1/analytics/categories should return category and intent breakdowns', async () => {
      const res = await request(app)
        .get('/api/v1/analytics/categories')
        .set('Authorization', `Bearer ${managerToken}`);

      expect(res.status).toBe(200);
      expect(res.body.data.totalAnalyzed).toBe(4);
      expect(res.body.data.categories.length).toBe(4);
      expect(res.body.data.topIntents.length).toBe(4);
    });

    it('GET /api/v1/analytics/resolution-time should calculate average MTTR and breakdowns', async () => {
      const res = await request(app)
        .get('/api/v1/analytics/resolution-time')
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.status).toBe(200);
      expect(res.body.data.totalResolvedSample).toBe(1);
      expect(res.body.data.overallAverageHours).toBeCloseTo(8.0, 1);
      expect(res.body.data.byPriority.LOW).toBeDefined();
    });

    it('GET /api/v1/analytics/agent-workload should return agent capacity and fleet utilization', async () => {
      const res = await request(app)
        .get('/api/v1/analytics/agent-workload')
        .set('Authorization', `Bearer ${managerToken}`);

      expect(res.status).toBe(200);
      expect(res.body.data.totalAgents).toBe(1);
      expect(res.body.data.fleetUtilizationRate).toBe(40);
      expect(res.body.data.agents[0].name).toBe('Bob Agent');
      expect(res.body.data.agents[0].utilizationPercentage).toBe(40);
    });

    it('GET /api/v1/analytics/assignment-distribution should report automated vs manual ratios', async () => {
      const res = await request(app)
        .get('/api/v1/analytics/assignment-distribution')
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.status).toBe(200);
      expect(res.body.data.totalAssignedTickets).toBe(3); // ticket 1, 2, 4
      expect(res.body.data.manualCount).toBe(1);           // ticket 4 was manual
      expect(res.body.data.automatedCount).toBe(2);        // ticket 1 & 2
    });

    it('GET /api/v1/analytics/escalations should report escalation statistics', async () => {
      const res = await request(app)
        .get('/api/v1/analytics/escalations')
        .set('Authorization', `Bearer ${managerToken}`);

      expect(res.status).toBe(200);
      expect(res.body.data.escalatedCount).toBe(1);
      expect(res.body.data.escalationRatePercentage).toBe(25);
      expect(res.body.data.byEscalationLevel['1']).toBe(1);
    });

    it('GET /api/v1/analytics/status-distribution should return counts by ticket status', async () => {
      const res = await request(app)
        .get('/api/v1/analytics/status-distribution')
        .set('Authorization', `Bearer ${agentToken}`);

      expect(res.status).toBe(200);
      expect(res.body.data.total).toBe(4);
      expect(res.body.data.openBacklog).toBe(3);
      expect(res.body.data.byStatus.OPEN.count).toBe(2);
      expect(res.body.data.byStatus.IN_PROGRESS.count).toBe(1);
      expect(res.body.data.byStatus.RESOLVED.count).toBe(1);
    });
  });

  describe('4. Security, RBAC & Health Check Verification', () => {
    it('GET /api/v1/analytics/overview should forbid CUSTOMER role (403 Forbidden)', async () => {
      const res = await request(app)
        .get('/api/v1/analytics/overview')
        .set('Authorization', `Bearer ${customerToken}`);

      expect(res.status).toBe(403);
      expect(res.body.success).toBe(false);
      expect(res.body.message).toContain('Access denied');
    });

    it('GET /api/v1/search should reject unauthenticated requests (401 Unauthorized)', async () => {
      const res = await request(app).get('/api/v1/search?q=test');
      expect(res.status).toBe(401);
      expect(res.body.success).toBe(false);
    });

    it('GET /health should report system status and dependency health', async () => {
      const res = await request(app).get('/health');
      expect(res.status).toBe(200);
      expect(res.body.status).toBe('healthy');
      expect(res.body.dependencies).toBeDefined();
      expect(res.body.dependencies.database).toBe('connected');
      expect(res.body.dependencies.vectorEngine).toBe('pgvector-hnsw-ready');
    });
  });
});

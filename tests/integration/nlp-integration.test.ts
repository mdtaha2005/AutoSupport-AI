import { describe, it, expect, beforeEach, vi } from 'vitest';
import request from 'supertest';
import { app } from '../../src/app.js';
import { store, resetStore } from '../helpers/test-db.js';
import {
  UserRole,
  TicketPriority,
  TicketStatus,
  ActivityAction,
  TicketCategory,
} from '@prisma/client';
import { signJwt } from '../../src/utils/jwt.js';
import { nlpClient, NlpProcessResponse } from '../../src/modules/nlp/nlp.client.js';
import { nlpService } from '../../src/modules/nlp/nlp.service.js';

vi.mock('../../src/config/prisma.js', async () => {
  const { mockPrisma } = await import('../helpers/test-db.js');
  return { prisma: mockPrisma };
});

describe('Phase 2: NLP Microservice Integration Tests', () => {
  let adminToken: string;
  let managerToken: string;
  let agentToken: string;
  let customerToken: string;

  const adminId = '11111111-aaaa-bbbb-cccc-111111111111';
  const managerId = '22222222-aaaa-bbbb-cccc-222222222222';
  const agentId = '33333333-aaaa-bbbb-cccc-333333333333';
  const customerId = '44444444-aaaa-bbbb-cccc-444444444444';
  const deptId = '55555555-aaaa-bbbb-cccc-555555555555';

  beforeEach(() => {
    resetStore();
    vi.restoreAllMocks();

    adminToken = signJwt({
      id: adminId,
      email: 'admin@system.com',
      role: UserRole.ADMIN,
      name: 'Admin User',
    });

    managerToken = signJwt({
      id: managerId,
      email: 'manager@system.com',
      role: UserRole.MANAGER,
      name: 'Manager User',
    });

    agentToken = signJwt({
      id: agentId,
      email: 'agent@system.com',
      role: UserRole.AGENT,
      name: 'Support Agent',
    });

    customerToken = signJwt({
      id: customerId,
      email: 'customer@client.com',
      role: UserRole.CUSTOMER,
      name: 'Jane Customer',
    });

    // Populate department
    store.departments.push({
      id: deptId,
      name: 'Billing Support',
      description: 'Handles payments and invoices',
      isActive: true,
    });

    // Populate users
    store.users.push(
      { id: adminId, email: 'admin@system.com', name: 'Admin User', role: UserRole.ADMIN, isActive: true },
      { id: managerId, email: 'manager@system.com', name: 'Manager User', role: UserRole.MANAGER, isActive: true },
      { id: agentId, email: 'agent@system.com', name: 'Support Agent', role: UserRole.AGENT, isActive: true },
      { id: customerId, email: 'customer@client.com', name: 'Jane Customer', role: UserRole.CUSTOMER, isActive: true }
    );

    // Agent profile
    store.agentProfiles.push({
      id: 'profile-agent-1',
      userId: agentId,
      departmentId: deptId,
      skills: ['PAYMENT', 'REFUND'],
      availabilityStatus: 'ONLINE',
      maxWorkload: 10,
      currentWorkload: 1,
    });
  });

  describe('1. Automatic NLP Classification on Ticket Creation', () => {
    it('should create ticket, trigger NLP analysis, categorize ticket and persist NLP entities and activity', async () => {
      const mockNlpResult: NlpProcessResponse = {
        category: {
          label: 'PAYMENT',
          confidence: 0.942,
          probabilities: { PAYMENT: 0.942, REFUND: 0.031, OTHER: 0.027 },
        },
        intent: {
          label: 'payment_issue',
          confidence: 0.915,
        },
        priority: {
          label: 'HIGH',
          confidence: 0.88,
          reason: 'High monetary value detected with payment disruption',
        },
        sentiment: {
          label: 'NEGATIVE',
          score: -0.65,
          urgency_detected: true,
          urgency_keywords: ['urgently', 'immediately'],
        },
        entities: [
          { type: 'ORDER_ID', value: 'ORD-98214', text: 'ORD-98214', start: 30, end: 39, confidence: 0.98 },
          { type: 'AMOUNT', value: '149.99', text: '$149.99', start: 44, end: 51, confidence: 0.95 },
        ],
        human_review: {
          needs_review: false,
          reason: null,
        },
        normalized_text: 'double charge on order ord-98214 for 149.99',
        processed_at: new Date().toISOString(),
      };

      const spyProcess = vi.spyOn(nlpClient, 'processTicket').mockResolvedValue(mockNlpResult);

      const rawTitle = 'Double charge on credit card';
      const rawDescription = 'I was charged twice for order ORD-98214 ($149.99). Please refund urgently!';

      const res = await request(app)
        .post('/api/v1/tickets')
        .set('Authorization', `Bearer ${customerToken}`)
        .send({
          title: rawTitle,
          description: rawDescription,
        });

      expect(res.status).toBe(201);
      expect(res.body.success).toBe(true);
      const ticketId = res.body.data.id;

      // Allow background microservice call to complete
      await nlpService.analyzeTicket(ticketId, customerId);

      // Verify ticket in store
      const ticketInStore = store.tickets.find((t) => t.id === ticketId);
      expect(ticketInStore).toBeDefined();
      // Crucial: original message must be completely preserved!
      expect(ticketInStore.title).toBe(rawTitle);
      expect(ticketInStore.description).toBe(rawDescription);

      // Verify inferred category & priority updated from default
      expect(ticketInStore.category).toBe('PAYMENT');
      expect(ticketInStore.priority).toBe('HIGH');
      expect(ticketInStore.needsHumanReview).toBe(false);

      // Verify TicketNlpAnalysis record persisted in store
      const nlpAnalysis = store.ticketNlpAnalyses.find((a) => a.ticketId === ticketId);
      expect(nlpAnalysis).toBeDefined();
      expect(nlpAnalysis.category).toBe('PAYMENT');
      expect(nlpAnalysis.categoryConfidence).toBeCloseTo(0.942, 2);
      expect(nlpAnalysis.intent).toBe('payment_issue');
      expect(nlpAnalysis.priorityPredicted).toBe('HIGH');
      expect(nlpAnalysis.sentiment).toBe('NEGATIVE');
      expect(nlpAnalysis.urgencyDetected).toBe(true);
      expect(nlpAnalysis.extractedEntities).toHaveLength(2);
      expect(nlpAnalysis.needsHumanReview).toBe(false);

      // Verify audit activity logged
      const activity = store.ticketActivities.find(
        (a) => a.ticketId === ticketId && a.action === ActivityAction.NLP_ANALYSIS_COMPLETED
      );
      expect(activity).toBeDefined();
      expect(activity.details.category).toBe('PAYMENT');
      expect(activity.details.sentiment).toBe('NEGATIVE');
      expect(spyProcess).toHaveBeenCalled();
    });
  });

  describe('2. Manual Re-Analysis Endpoint: POST /api/v1/tickets/:id/analyze', () => {
    let testTicketId: string;

    beforeEach(() => {
      testTicketId = '10000000-0000-0000-0000-000000000001';
      store.tickets.push({
        id: testTicketId,
        ticketNumber: 2001,
        title: 'Package arrived with damaged screen',
        description: 'Product arrived damaged. Order #ORD-55442 on 2026-04-12. Please replace product.',
        priority: TicketPriority.MEDIUM,
        status: TicketStatus.OPEN,
        category: 'OTHER',
        needsHumanReview: true,
        customerId: customerId,
        departmentId: deptId,
        assignedAgentId: agentId,
        createdAt: new Date(),
        updatedAt: new Date(),
      });
    });

    it('should allow AGENT or MANAGER to trigger ticket re-analysis on demand', async () => {
      const updatedNlpResult: NlpProcessResponse = {
        category: {
          label: 'PRODUCT',
          confidence: 0.91,
          probabilities: { PRODUCT: 0.91, DELIVERY: 0.05, OTHER: 0.04 },
        },
        intent: {
          label: 'product_defect',
          confidence: 0.88,
        },
        priority: {
          label: 'HIGH',
          confidence: 0.82,
          reason: 'Defective product report',
        },
        sentiment: {
          label: 'NEGATIVE',
          score: -0.4,
          urgency_detected: false,
          urgency_keywords: [],
        },
        entities: [
          { type: 'ORDER_ID', value: 'ORD-55442', text: 'ORD-55442', start: 32, end: 41, confidence: 0.98 },
          { type: 'DATE', value: '2026-04-12', text: '2026-04-12', start: 45, end: 55, confidence: 0.95 },
        ],
        human_review: {
          needs_review: false,
          reason: null,
        },
        normalized_text: 'product arrived damaged order ord-55442 on 2026-04-12 please replace product',
        processed_at: new Date().toISOString(),
      };

      vi.spyOn(nlpClient, 'processTicket').mockResolvedValue(updatedNlpResult);

      const res = await request(app)
        .post(`/api/v1/tickets/${testTicketId}/analyze`)
        .set('Authorization', `Bearer ${agentToken}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.message).toContain('Ticket analyzed with NLP successfully');
      expect(res.body.data.category).toBe('PRODUCT');
      expect(res.body.data.needsHumanReview).toBe(false);
      expect(res.body.data.nlpAnalysis).toBeDefined();
      expect(res.body.data.nlpAnalysis.intent).toBe('product_defect');
      expect(res.body.data.nlpAnalysis.extractedEntities).toHaveLength(2);

      // Verify audit activity
      const activity = store.ticketActivities.find(
        (a) => a.ticketId === testTicketId && a.action === ActivityAction.NLP_ANALYSIS_COMPLETED
      );
      expect(activity).toBeDefined();
    });

    it('should FORBID CUSTOMER role from triggering manual re-analysis (403)', async () => {
      const res = await request(app)
        .post(`/api/v1/tickets/${testTicketId}/analyze`)
        .set('Authorization', `Bearer ${customerToken}`);

      expect(res.status).toBe(403);
    });

    it('should reject unauthenticated request (401)', async () => {
      const res = await request(app)
        .post(`/api/v1/tickets/${testTicketId}/analyze`);

      expect(res.status).toBe(401);
    });

    it('should return 404 for non-existent ticket ID', async () => {
      const res = await request(app)
        .post('/api/v1/tickets/00000000-0000-0000-0000-000000000000/analyze')
        .set('Authorization', `Bearer ${managerToken}`);

      expect(res.status).toBe(404);
    });
  });

  describe('3. Human Review Flagging for Uncertain Predictions', () => {
    it('should set needsHumanReview = true when classification confidence is low (< 0.60)', async () => {
      const ambiguousTicketId = '20000000-0000-0000-0000-000000000002';
      store.tickets.push({
        id: ambiguousTicketId,
        ticketNumber: 2002,
        title: 'Need some information',
        description: 'Can someone help me with my account and the delivery?',
        priority: TicketPriority.LOW,
        status: TicketStatus.OPEN,
        category: 'OTHER',
        needsHumanReview: false,
        customerId: customerId,
        departmentId: null,
        assignedAgentId: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      const uncertainNlpResult: NlpProcessResponse = {
        category: {
          label: 'ACCOUNT',
          confidence: 0.46,
          probabilities: { ACCOUNT: 0.46, DELIVERY: 0.43, OTHER: 0.11 },
        },
        intent: {
          label: 'general_inquiry',
          confidence: 0.45,
        },
        priority: {
          label: 'LOW',
          confidence: 0.5,
          reason: 'Standard inquiry',
        },
        sentiment: {
          label: 'NEUTRAL',
          score: 0.05,
          urgency_detected: false,
          urgency_keywords: [],
        },
        entities: [],
        human_review: {
          needs_review: true,
          reason: 'Low confidence (0.46) below threshold 0.60; Top two predictions [ACCOUNT: 0.46, DELIVERY: 0.43] are ambiguous',
        },
        normalized_text: 'can someone help me with my account and the delivery',
        processed_at: new Date().toISOString(),
      };

      vi.spyOn(nlpClient, 'processTicket').mockResolvedValue(uncertainNlpResult);

      await nlpService.analyzeTicket(ambiguousTicketId);

      const ticket = store.tickets.find((t) => t.id === ambiguousTicketId);
      expect(ticket.needsHumanReview).toBe(true);

      const analysis = store.ticketNlpAnalyses.find((a) => a.ticketId === ambiguousTicketId);
      expect(analysis.needsHumanReview).toBe(true);
      expect(analysis.reviewReason).toContain('Low confidence (0.46)');
    });
  });

  describe('4. Ticket Filtering by Category and needsHumanReview', () => {
    const ticketPay1Id = '30000000-0000-0000-0000-000000000001';
    const ticketPay2Id = '30000000-0000-0000-0000-000000000002';
    const ticketTech1Id = '30000000-0000-0000-0000-000000000003';

    beforeEach(() => {
      store.tickets.push(
        {
          id: ticketPay1Id,
          ticketNumber: 3001,
          title: 'Payment failed for invoice',
          description: 'Payment issue',
          priority: TicketPriority.HIGH,
          status: TicketStatus.OPEN,
          category: 'PAYMENT',
          needsHumanReview: false,
          customerId: null,
          departmentId: deptId,
          assignedAgentId: agentId,
          createdAt: new Date(),
          updatedAt: new Date(),
        },
        {
          id: ticketPay2Id,
          ticketNumber: 3002,
          title: 'Suspicious card charge',
          description: 'Payment issue review',
          priority: TicketPriority.HIGH,
          status: TicketStatus.OPEN,
          category: 'PAYMENT',
          needsHumanReview: true,
          customerId: null,
          departmentId: deptId,
          assignedAgentId: agentId,
          createdAt: new Date(),
          updatedAt: new Date(),
        },
        {
          id: ticketTech1Id,
          ticketNumber: 3003,
          title: 'Application crashing with error 500',
          description: 'Technical bug',
          priority: TicketPriority.URGENT,
          status: TicketStatus.OPEN,
          category: 'TECHNICAL',
          needsHumanReview: false,
          customerId: null,
          departmentId: deptId,
          assignedAgentId: agentId,
          createdAt: new Date(),
          updatedAt: new Date(),
        }
      );
    });

    it('should filter tickets by category=PAYMENT', async () => {
      const res = await request(app)
        .get('/api/v1/tickets?category=PAYMENT')
        .set('Authorization', `Bearer ${managerToken}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.length).toBe(2);
      expect(res.body.data.every((t: any) => t.category === 'PAYMENT')).toBe(true);
    });

    it('should filter tickets by needsHumanReview=true', async () => {
      const res = await request(app)
        .get('/api/v1/tickets?needsHumanReview=true')
        .set('Authorization', `Bearer ${managerToken}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.length).toBe(1);
      expect(res.body.data[0].id).toBe(ticketPay2Id);
      expect(res.body.data[0].needsHumanReview).toBe(true);
    });

    it('should return populated nlpAnalysis relation on GET /tickets/:id', async () => {
      store.ticketNlpAnalyses.push({
        id: 'analysis-001',
        ticketId: ticketPay1Id,
        category: 'PAYMENT',
        categoryConfidence: 0.95,
        intent: 'payment_inquiry',
        intentConfidence: 0.9,
        priorityPredicted: 'HIGH',
        priorityConfidence: 0.85,
        sentiment: 'NEUTRAL',
        sentimentScore: 0.0,
        urgencyDetected: false,
        extractedEntities: [{ type: 'AMOUNT', value: '50.00' }],
        needsHumanReview: false,
        reviewReason: null,
        rawResponse: {},
        modelVersion: '1.0.0',
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      const res = await request(app)
        .get(`/api/v1/tickets/${ticketPay1Id}`)
        .set('Authorization', `Bearer ${managerToken}`);

      expect(res.status).toBe(200);
      expect(res.body.data.nlpAnalysis).toBeDefined();
      expect(res.body.data.nlpAnalysis.category).toBe('PAYMENT');
      expect(res.body.data.nlpAnalysis.intent).toBe('payment_inquiry');
    });
  });

  describe('5. Error Handling & Graceful Degradation', () => {
    it('should gracefully degrade and flag for human review when NLP microservice is unavailable', async () => {
      const ticketId = '40000000-0000-0000-0000-000000000001';
      store.tickets.push({
        id: ticketId,
        ticketNumber: 4001,
        title: 'Cannot access my downloads',
        description: 'Unable to access digital goods after transaction TXN-88771',
        priority: TicketPriority.MEDIUM,
        status: TicketStatus.OPEN,
        category: 'OTHER',
        needsHumanReview: false,
        customerId: customerId,
        departmentId: null,
        assignedAgentId: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      // Simulate microservice network error / offline
      vi.spyOn(nlpClient, 'processTicket').mockResolvedValue(null);

      const result = await nlpService.analyzeTicket(ticketId);

      expect(result).toBeNull();
      // Ticket must be flagged for human review as safe fallback
      const ticket = store.tickets.find((t) => t.id === ticketId);
      expect(ticket.needsHumanReview).toBe(true);
    });
  });
});

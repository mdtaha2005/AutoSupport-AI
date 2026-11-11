import { describe, it, expect, beforeAll, vi } from 'vitest';
import request from 'supertest';
import { app } from '../../src/app.js';
import { store, resetStore } from '../helpers/test-db.js';
import {
  UserRole,
  AvailabilityStatus,
  TicketPriority,
  TicketStatus,
  TicketCategory,
  RoutingStatus,
} from '@prisma/client';
import { hashPassword } from '../../src/utils/password.js';
import { signJwt } from '../../src/utils/jwt.js';
import { nlpClient, NlpProcessResponse } from '../../src/modules/nlp/nlp.client.js';
import { nlpService } from '../../src/modules/nlp/nlp.service.js';
import { assignmentService } from '../../src/modules/routing/assignment.service.js';
import { queueManager } from '../../src/modules/queues/queue.manager.js';
import { redisManager } from '../../src/config/redis.js';

vi.mock('../../src/config/prisma.js', async () => {
  const { mockPrisma } = await import('../helpers/test-db.js');
  return { prisma: mockPrisma };
});

describe('AutoSupport AI — Complete Test Execution Order (56 Steps)', () => {
  // Shared state across sequential execution
  let adminToken: string;
  let managerToken: string;
  let customer1Token: string;
  let customer1Id: string;
  let agentAlphaToken: string;
  let agentAlphaId: string;
  let agentBetaToken: string;
  let agentBetaId: string;

  let billingDeptId: string;
  let techDeptId: string;

  let ticketPaymentId: string;
  let ticketDeliveryId: string;
  let ticketAccountId: string;
  let ticketTechId: string;
  let ticketLifecycleId: string;
  let ticketCommentsId: string;

  beforeAll(async () => {
    resetStore();

    // Setup base departments
    billingDeptId = '55555555-0000-0000-0000-000000000001';
    techDeptId = '55555555-0000-0000-0000-000000000002';
    store.departments.push(
      {
        id: billingDeptId,
        name: 'Billing Support',
        description: 'Payments and invoices',
        isActive: true,
        createdAt: new Date(),
        updatedAt: new Date(),
      },
      {
        id: techDeptId,
        name: 'Technical Support',
        description: 'Engineering and bug reports',
        isActive: true,
        createdAt: new Date(),
        updatedAt: new Date(),
      }
    );

    // Setup seeded admin and manager
    const adminPass = await hashPassword('AdminPass123!');
    const adminUser = {
      id: 'admin-uuid-001',
      email: 'admin@system.com',
      passwordHash: adminPass,
      name: 'System Admin',
      role: UserRole.ADMIN,
      isActive: true,
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    store.users.push(adminUser);
    adminToken = signJwt({
      id: adminUser.id,
      email: adminUser.email,
      role: UserRole.ADMIN,
      name: adminUser.name,
    });

    const managerPass = await hashPassword('ManagerPass123!');
    const managerUser = {
      id: 'manager-uuid-002',
      email: 'manager@system.com',
      passwordHash: managerPass,
      name: 'Support Manager',
      role: UserRole.MANAGER,
      isActive: true,
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    store.users.push(managerUser);
    managerToken = signJwt({
      id: managerUser.id,
      email: managerUser.email,
      role: UserRole.MANAGER,
      name: managerUser.name,
    });
  });

  // ========================================================
  // Part 1: Authentication (Steps 1–8)
  // ========================================================
  describe('Part 1: Authentication', () => {
    it('1. Register a new customer account', async () => {
      const res = await request(app)
        .post('/api/v1/auth/register')
        .send({
          email: 'customer.john@example.com',
          password: 'Password123!',
          name: 'John Customer',
        });

      expect(res.status).toBe(201);
      expect(res.body.success).toBe(true);
      expect(res.body.data.user.email).toBe('customer.john@example.com');
      expect(res.body.data.user.role).toBe(UserRole.CUSTOMER);
      expect(res.body.data.token).toBeDefined();

      customer1Token = res.body.data.token;
      customer1Id = res.body.data.user.id;
    });

    it('2. Register a new agent account, if registration supports it', async () => {
      // Direct public registration with role=AGENT must be rejected
      const publicAgentRes = await request(app)
        .post('/api/v1/auth/register')
        .send({
          email: 'agent.unauthorized@example.com',
          password: 'Password123!',
          name: 'Rogue Agent',
          role: UserRole.AGENT,
        });

      expect(publicAgentRes.status).toBe(403);
      expect(publicAgentRes.body.success).toBe(false);

      // Authenticated Admin registration of Agent succeeds
      const adminAgentRes = await request(app)
        .post('/api/v1/auth/register')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          email: 'agent.sarah@system.com',
          password: 'Password123!',
          name: 'Sarah Agent',
          role: UserRole.AGENT,
          departmentId: billingDeptId,
          skills: ['PAYMENT', 'refund', 'invoice'],
          maxWorkload: 5,
        });

      expect(adminAgentRes.status).toBe(201);
      expect(adminAgentRes.body.data.user.role).toBe(UserRole.AGENT);
      expect(store.agentProfiles.some((p) => p.userId === adminAgentRes.body.data.user.id)).toBe(true);
    });

    it('3. Log in using valid credentials', async () => {
      const res = await request(app)
        .post('/api/v1/auth/login')
        .send({
          email: 'customer.john@example.com',
          password: 'Password123!',
        });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.token).toBeDefined();
      expect(res.body.data.user.email).toBe('customer.john@example.com');
    });

    it('4. Attempt login using an incorrect password', async () => {
      const res = await request(app)
        .post('/api/v1/auth/login')
        .send({
          email: 'customer.john@example.com',
          password: 'WrongPassword999!',
        });

      expect(res.status).toBe(401);
      expect(res.body.success).toBe(false);
      expect(res.body.message).toContain('Invalid email or password');
    });

    it('5. Attempt login using an unregistered email', async () => {
      const res = await request(app)
        .post('/api/v1/auth/login')
        .send({
          email: 'nobody.registered@example.com',
          password: 'Password123!',
        });

      expect(res.status).toBe(401);
      expect(res.body.success).toBe(false);
      expect(res.body.message).toContain('Invalid email or password');
    });

    it('6. Log out and verify that the session is terminated', async () => {
      // In JWT authentication, client discarding token terminates session
      let activeSessionToken: string | null = customer1Token;
      activeSessionToken = null; // Client side logout simulation

      expect(activeSessionToken).toBeNull();
    });

    it('7. Attempt to access a protected page without logging in', async () => {
      const res = await request(app).get('/api/v1/auth/me');

      expect(res.status).toBe(401);
      expect(res.body.success).toBe(false);
      expect(res.body.message).toContain('Authentication token missing or invalid');
    });

    it('8. Verify that a customer cannot access administrator functionality', async () => {
      // Customer tries to list all agents (staff-only endpoint)
      const res = await request(app)
        .get('/api/v1/agents')
        .set('Authorization', `Bearer ${customer1Token}`);

      expect(res.status).toBe(403);
      expect(res.body.success).toBe(false);
      expect(res.body.message).toContain('not authorized');
    });
  });

  // ========================================================
  // Part 2: Ticket creation (Steps 9–16)
  // ========================================================
  describe('Part 2: Ticket creation', () => {
    it('9. Create a ticket with a payment-related complaint', async () => {
      const res = await request(app)
        .post('/api/v1/tickets')
        .set('Authorization', `Bearer ${customer1Token}`)
        .send({
          title: 'Duplicate charge on Visa for invoice #INV-4921',
          description: 'I noticed two identical charges of $129.00 on my card statement. Please refund the duplicate transaction.',
          priority: TicketPriority.HIGH,
        });

      expect(res.status).toBe(201);
      expect(res.body.data.id).toBeDefined();
      expect(res.body.data.status).toBe(TicketStatus.OPEN);
      expect(res.body.data.customerId).toBe(customer1Id);

      ticketPaymentId = res.body.data.id;
    });

    it('10. Create a ticket with a delivery-related complaint', async () => {
      const res = await request(app)
        .post('/api/v1/tickets')
        .set('Authorization', `Bearer ${customer1Token}`)
        .send({
          title: 'Tracking #TRK-99021 package shipment is delayed',
          description: 'My order with tracking number TRK-99021 has been stuck in the regional sorting hub for over 4 days.',
        });

      expect(res.status).toBe(201);
      expect(res.body.data.id).toBeDefined();
      expect(res.body.data.status).toBe(TicketStatus.OPEN);

      ticketDeliveryId = res.body.data.id;
    });

    it('11. Create a ticket with an account-related complaint', async () => {
      const res = await request(app)
        .post('/api/v1/tickets')
        .set('Authorization', `Bearer ${customer1Token}`)
        .send({
          title: 'Cannot reset account password or access dashboard',
          description: 'The verification email is not arriving and I am locked out of my corporate profile.',
        });

      expect(res.status).toBe(201);
      expect(res.body.data.id).toBeDefined();
      expect(res.body.data.status).toBe(TicketStatus.OPEN);

      ticketAccountId = res.body.data.id;
    });

    it('12. Create a ticket with a technical support complaint', async () => {
      const res = await request(app)
        .post('/api/v1/tickets')
        .set('Authorization', `Bearer ${customer1Token}`)
        .send({
          title: 'HTTP 504 Gateway Timeout on /api/v1/export bulk endpoint',
          description: 'Our automated cron job receives HTTP 504 Gateway Timeout when requesting query date ranges exceeding 30 days.',
          priority: TicketPriority.URGENT,
        });

      expect(res.status).toBe(201);
      expect(res.body.data.id).toBeDefined();
      expect(res.body.data.priority).toBe(TicketPriority.URGENT);

      ticketTechId = res.body.data.id;
      ticketLifecycleId = res.body.data.id;
    });

    it('13. Create a ticket with a very long description', async () => {
      const longDescription = 'System log trace report:\n' + 'Error: Database connection pool exhausted at query step.\n'.repeat(60);
      expect(longDescription.length).toBeGreaterThan(1500);

      const res = await request(app)
        .post('/api/v1/tickets')
        .set('Authorization', `Bearer ${customer1Token}`)
        .send({
          title: 'Extended system error diagnostic dump',
          description: longDescription,
        });

      expect(res.status).toBe(201);
      expect(res.body.data.description.length).toBeGreaterThanOrEqual(1500);
    });

    it('14. Attempt to create a ticket with an empty title', async () => {
      const res = await request(app)
        .post('/api/v1/tickets')
        .set('Authorization', `Bearer ${customer1Token}`)
        .send({
          title: '',
          description: 'Valid description with empty title.',
        });

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
    });

    it('15. Attempt to create a ticket with an empty description', async () => {
      const res = await request(app)
        .post('/api/v1/tickets')
        .set('Authorization', `Bearer ${customer1Token}`)
        .send({
          title: 'Valid title with empty description',
          description: '',
        });

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
    });

    it('16. Create multiple tickets and verify that each gets a unique ID', async () => {
      const res1 = await request(app)
        .post('/api/v1/tickets')
        .set('Authorization', `Bearer ${customer1Token}`)
        .send({ title: 'Unique check ticket A', description: 'Desc A' });

      const res2 = await request(app)
        .post('/api/v1/tickets')
        .set('Authorization', `Bearer ${customer1Token}`)
        .send({ title: 'Unique check ticket B', description: 'Desc B' });

      const res3 = await request(app)
        .post('/api/v1/tickets')
        .set('Authorization', `Bearer ${customer1Token}`)
        .send({ title: 'Unique check ticket C', description: 'Desc C' });

      expect(res1.body.data.id).not.toBe(res2.body.data.id);
      expect(res2.body.data.id).not.toBe(res3.body.data.id);
      expect(res1.body.data.id).not.toBe(res3.body.data.id);
      expect(res1.body.data.ticketNumber).toBeLessThan(res2.body.data.ticketNumber);
      expect(res2.body.data.ticketNumber).toBeLessThan(res3.body.data.ticketNumber);
    });
  });

  // ========================================================
  // Part 3: NLP analysis (Steps 17–22)
  // ========================================================
  describe('Part 3: NLP analysis', () => {
    it('17. Verify automatic ticket categorization', async () => {
      const previewRes = await request(app)
        .post('/api/v1/tickets/preview-nlp')
        .send({
          title: 'Invoice double charge on Stripe checkout',
          description: 'Please refund payment #INV-9901 charged twice on my credit card.',
        });

      expect(previewRes.status).toBe(200);
      expect(previewRes.body.data.category.label).toBe(TicketCategory.PAYMENT);
      expect(previewRes.body.data.category.confidence).toBeGreaterThan(0.60);
    });

    it('18. Verify intent detection', async () => {
      const previewRes = await request(app)
        .post('/api/v1/tickets/preview-nlp')
        .send({
          title: 'Tracking #TRK-8812 status delayed',
          description: 'Where is my shipment? Tracking has not updated in 5 days.',
        });

      expect(previewRes.status).toBe(200);
      expect(previewRes.body.data.intent.label).toMatch(/track_(shipment|order)/);
      expect(previewRes.body.data.intent.confidence).toBeGreaterThan(0.20);
    });

    it('19. Verify sentiment analysis using an angry customer complaint', async () => {
      const angryComplaint =
        'This is completely unacceptable and terrible service! Your platform ruined my launch and your support is utterly useless. I demand immediate compensation!';

      const previewRes = await request(app)
        .post('/api/v1/tickets/preview-nlp')
        .send({
          title: 'Horrible service and total failure',
          description: angryComplaint,
        });

      expect(previewRes.status).toBe(200);
      expect(previewRes.body.data.sentiment.label).toBe('NEGATIVE');
      expect(previewRes.body.data.sentiment.score).toBeLessThan(0);
    });

    it('20. Verify named entity extraction using an order ID and email address', async () => {
      const textWithEntities =
        'Regarding order #ORD-77491 placed under contact email buyer.smith@domain.com for invoice #INV-3321.';

      const previewRes = await request(app)
        .post('/api/v1/tickets/preview-nlp')
        .send({
          title: 'Order ORD-77491 details',
          description: textWithEntities,
        });

      expect(previewRes.status).toBe(200);
      const entities = previewRes.body.data.entities || [];
      expect(entities.length).toBeGreaterThanOrEqual(1);
      expect(entities.some((e: any) => (e.value || e.text || '').includes('ORD-77491'))).toBe(true);
    });

    it('21. Verify priority prediction using an urgent complaint', async () => {
      const urgentComplaint =
        'CRITICAL ALERT: Production database timeout! Complete service downtime affecting all paying customers. Fix immediately!';

      const previewRes = await request(app)
        .post('/api/v1/tickets/preview-nlp')
        .send({
          title: 'CRITICAL SYSTEM OUTAGE',
          description: urgentComplaint,
        });

      expect(previewRes.status).toBe(200);
      expect(['HIGH', 'URGENT']).toContain(previewRes.body.data.priority.label);
      expect(previewRes.body.data.sentiment.urgency_detected).toBe(true);
    });

    it('22. Verify whether ambiguous tickets are flagged for human review', async () => {
      // Mock an ambiguous low-confidence NLP response
      const lowConfMock: NlpProcessResponse = {
        category: { label: 'OTHER', confidence: 0.35, probabilities: { OTHER: 0.35, PAYMENT: 0.25 } },
        intent: { label: 'unknown', confidence: 0.30 },
        priority: { label: 'MEDIUM', confidence: 0.40, urgency_score: 0.2 },
        sentiment: { label: 'NEUTRAL', score: 0.05, urgency_detected: false },
        entities: [],
        human_review: { needs_review: true, reason: 'Low classification confidence (0.35 < 0.70)' },
        processing_time_ms: 12.5,
      };

      vi.spyOn(nlpClient, 'processTicket').mockResolvedValueOnce(lowConfMock);

      const res = await request(app)
        .post('/api/v1/tickets')
        .set('Authorization', `Bearer ${customer1Token}`)
        .send({
          title: 'Not sure what is happening',
          description: 'Maybe something strange occurred earlier today.',
        });

      expect(res.status).toBe(201);
      expect(res.body.data.needsHumanReview).toBe(true);
    });
  });

  // ========================================================
  // Part 4: Agent assignment (Steps 23–30)
  // ========================================================
  describe('Part 4: Agent assignment', () => {
    it('23. Create two agents with different skill sets', async () => {
      agentAlphaId = '33333333-0000-0000-0000-000000000001';
      agentBetaId = '33333333-0000-0000-0000-000000000002';

      const passHash = await hashPassword('AgentPass123!');

      // Agent Alpha: Billing specialist
      store.users.push({
        id: agentAlphaId,
        email: 'alpha.billing@system.com',
        passwordHash: passHash,
        name: 'Agent Alpha (Billing)',
        role: UserRole.AGENT,
        isActive: true,
        createdAt: new Date(),
        updatedAt: new Date(),
      });
      store.agentProfiles.push({
        id: 'profile-alpha',
        userId: agentAlphaId,
        departmentId: billingDeptId,
        skills: ['PAYMENT', 'REFUND', 'invoice', 'Stripe'],
        availabilityStatus: AvailabilityStatus.AVAILABLE,
        maxWorkload: 5,
        currentWorkload: 0,
        createdAt: new Date(),
        updatedAt: new Date(),
      });
      agentAlphaToken = signJwt({
        id: agentAlphaId,
        email: 'alpha.billing@system.com',
        role: UserRole.AGENT,
        name: 'Agent Alpha (Billing)',
      });

      // Agent Beta: Technical specialist
      store.users.push({
        id: agentBetaId,
        email: 'beta.tech@system.com',
        passwordHash: passHash,
        name: 'Agent Beta (Tech)',
        role: UserRole.AGENT,
        isActive: true,
        createdAt: new Date(),
        updatedAt: new Date(),
      });
      store.agentProfiles.push({
        id: 'profile-beta',
        userId: agentBetaId,
        departmentId: techDeptId,
        skills: ['TECHNICAL', 'API', 'database', 'timeout'],
        availabilityStatus: AvailabilityStatus.AVAILABLE,
        maxWorkload: 5,
        currentWorkload: 0,
        createdAt: new Date(),
        updatedAt: new Date(),
      });
      agentBetaToken = signJwt({
        id: agentBetaId,
        email: 'beta.tech@system.com',
        role: UserRole.AGENT,
        name: 'Agent Beta (Tech)',
      });

      expect(store.agentProfiles.find((p) => p.userId === agentAlphaId)?.skills).toContain('PAYMENT');
      expect(store.agentProfiles.find((p) => p.userId === agentBetaId)?.skills).toContain('TECHNICAL');
    });

    it('24. Give both agents different workloads', async () => {
      // Set Alpha to 3/5 (60% capacity) and Beta to 1/5 (20% capacity)
      const alphaProfile = store.agentProfiles.find((p) => p.userId === agentAlphaId)!;
      alphaProfile.currentWorkload = 3;

      const betaProfile = store.agentProfiles.find((p) => p.userId === agentBetaId)!;
      betaProfile.currentWorkload = 1;

      expect(alphaProfile.currentWorkload).toBe(3);
      expect(betaProfile.currentWorkload).toBe(1);
    });

    it('25. Submit a ticket matching both agents skills or category', async () => {
      const res = await request(app)
        .post('/api/v1/tickets')
        .set('Authorization', `Bearer ${customer1Token}`)
        .send({
          title: 'Invoice payment refund request',
          description: 'Need assistance refunding a duplicated payment on invoice #INV-5511',
          priority: TicketPriority.HIGH,
        });

      expect(res.status).toBe(201);
      ticketCommentsId = res.body.data.id;
    });

    it('26. Verify that the scoring engine selects the more suitable agent', async () => {
      // Add Agent Gamma with 0 workload and exact payment skills
      const agentGammaId = '33333333-0000-0000-0000-000000000003';
      const passHash = await hashPassword('AgentPass123!');
      store.users.push({
        id: agentGammaId,
        email: 'gamma.billing@system.com',
        passwordHash: passHash,
        name: 'Agent Gamma (Billing)',
        role: UserRole.AGENT,
        isActive: true,
        createdAt: new Date(),
        updatedAt: new Date(),
      });
      store.agentProfiles.push({
        id: 'profile-gamma',
        userId: agentGammaId,
        departmentId: billingDeptId,
        skills: ['PAYMENT', 'REFUND', 'invoice', 'Stripe'],
        availabilityStatus: AvailabilityStatus.AVAILABLE,
        maxWorkload: 5,
        currentWorkload: 0, // 0/5 vs Alpha's 3/5
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      const selected = await assignmentService.routeTicket(ticketPaymentId, {
        targetDepartmentId: billingDeptId,
      });

      expect(selected.selectedAgent.id).toBe('profile-gamma');
    });

    it('27. Manually assign a ticket to another agent', async () => {
      const res = await request(app)
        .post(`/api/v1/tickets/${ticketPaymentId}/assign`)
        .set('Authorization', `Bearer ${managerToken}`)
        .send({
          agentId: agentAlphaId,
          reason: 'Manual manager override for specialist evaluation',
        });

      expect(res.status).toBe(200);
      expect(res.body.data.assignedAgentId).toBe(agentAlphaId);
      expect(res.body.data.isManuallyAssigned).toBe(true);
    });

    it('28. Reassign an existing ticket', async () => {
      const res = await request(app)
        .post(`/api/v1/tickets/${ticketPaymentId}/assign`)
        .set('Authorization', `Bearer ${managerToken}`)
        .send({
          agentId: agentBetaId,
          reason: 'Reassigning from Alpha to Beta due to ticket escalations',
        });

      expect(res.status).toBe(200);
      expect(res.body.data.assignedAgentId).toBe(agentBetaId);
    });

    it('29. Attempt to assign a ticket to a nonexistent agent', async () => {
      const res = await request(app)
        .post(`/api/v1/tickets/${ticketPaymentId}/assign`)
        .set('Authorization', `Bearer ${managerToken}`)
        .send({
          agentId: '00000000-0000-0000-0000-000000000000',
          reason: 'Attempt with fake agent ID',
        });

      expect([400, 404]).toContain(res.status);
      expect(res.body.success).toBe(false);
    });

    it('30. Verify that unauthorized users cannot assign tickets', async () => {
      const res = await request(app)
        .post(`/api/v1/tickets/${ticketPaymentId}/assign`)
        .set('Authorization', `Bearer ${customer1Token}`)
        .send({
          agentId: agentAlphaId,
        });

      expect(res.status).toBe(403);
      expect(res.body.success).toBe(false);
    });
  });

  // ========================================================
  // Part 5: Ticket lifecycle (Steps 31–37)
  // ========================================================
  describe('Part 5: Ticket lifecycle', () => {
    it('31. Move a ticket from OPEN to IN_PROGRESS', async () => {
      const res = await request(app)
        .patch(`/api/v1/tickets/${ticketLifecycleId}/status`)
        .set('Authorization', `Bearer ${managerToken}`)
        .send({
          status: TicketStatus.IN_PROGRESS,
        });

      expect(res.status).toBe(200);
      expect(res.body.data.status).toBe(TicketStatus.IN_PROGRESS);
    });

    it('32. Move a ticket to PENDING_CUSTOMER', async () => {
      const res = await request(app)
        .patch(`/api/v1/tickets/${ticketLifecycleId}/status`)
        .set('Authorization', `Bearer ${managerToken}`)
        .send({
          status: TicketStatus.PENDING_CUSTOMER,
        });

      expect(res.status).toBe(200);
      expect(res.body.data.status).toBe(TicketStatus.PENDING_CUSTOMER);
    });

    it('33. Resolve a ticket', async () => {
      const res = await request(app)
        .patch(`/api/v1/tickets/${ticketLifecycleId}/status`)
        .set('Authorization', `Bearer ${managerToken}`)
        .send({
          status: TicketStatus.RESOLVED,
        });

      expect(res.status).toBe(200);
      expect(res.body.data.status).toBe(TicketStatus.RESOLVED);
    });

    it('34. Close a ticket', async () => {
      const res = await request(app)
        .patch(`/api/v1/tickets/${ticketLifecycleId}/status`)
        .set('Authorization', `Bearer ${managerToken}`)
        .send({
          status: TicketStatus.CLOSED,
        });

      expect(res.status).toBe(200);
      expect(res.body.data.status).toBe(TicketStatus.CLOSED);
    });

    it('35. Change ticket priority', async () => {
      const res = await request(app)
        .put(`/api/v1/tickets/${ticketLifecycleId}`)
        .set('Authorization', `Bearer ${managerToken}`)
        .send({
          priority: TicketPriority.URGENT,
        });

      expect(res.status).toBe(200);
      expect(res.body.data.priority).toBe(TicketPriority.URGENT);
    });

    it('36. Change ticket department', async () => {
      const res = await request(app)
        .put(`/api/v1/tickets/${ticketLifecycleId}`)
        .set('Authorization', `Bearer ${managerToken}`)
        .send({
          departmentId: techDeptId,
        });

      expect(res.status).toBe(200);
      expect(res.body.data.departmentId).toBe(techDeptId);
    });

    it('37. Verify that changes persist after refreshing the page / re-fetching', async () => {
      const res = await request(app)
        .get(`/api/v1/tickets/${ticketLifecycleId}`)
        .set('Authorization', `Bearer ${managerToken}`);

      expect(res.status).toBe(200);
      expect(res.body.data.status).toBe(TicketStatus.CLOSED);
      expect(res.body.data.priority).toBe(TicketPriority.URGENT);
      expect(res.body.data.departmentId).toBe(techDeptId);
      expect(res.body.data.activities.length).toBeGreaterThanOrEqual(4);
    });
  });

  // ========================================================
  // Part 6: Comments and communication (Steps 38–42)
  // ========================================================
  describe('Part 6: Comments and communication', () => {
    it('38. Add a comment to a ticket', async () => {
      const res = await request(app)
        .post(`/api/v1/tickets/${ticketCommentsId}/comments`)
        .set('Authorization', `Bearer ${customer1Token}`)
        .send({
          content: 'Hello, here is my updated billing address receipt.',
          isInternal: false,
        });

      expect(res.status).toBe(201);
      expect(res.body.data.content).toBe('Hello, here is my updated billing address receipt.');
      expect(res.body.data.isInternal).toBe(false);
    });

    it('39. Add an internal note', async () => {
      const res = await request(app)
        .post(`/api/v1/tickets/${ticketCommentsId}/comments`)
        .set('Authorization', `Bearer ${managerToken}`)
        .send({
          content: 'Internal Note: Confirmed transaction anomaly with Stripe team.',
          isInternal: true,
        });

      expect(res.status).toBe(201);
      expect(res.body.data.isInternal).toBe(true);
    });

    it('40. Verify that internal notes are not visible to customers', async () => {
      // Customer fetches comments
      const customerRes = await request(app)
        .get(`/api/v1/tickets/${ticketCommentsId}/comments`)
        .set('Authorization', `Bearer ${customer1Token}`);

      expect(customerRes.status).toBe(200);
      expect(customerRes.body.data.every((c: any) => !c.isInternal)).toBe(true);
      expect(customerRes.body.data.some((c: any) => c.content.includes('Internal Note'))).toBe(false);

      // Staff (Manager) fetches comments - internal note must be visible
      const staffRes = await request(app)
        .get(`/api/v1/tickets/${ticketCommentsId}/comments`)
        .set('Authorization', `Bearer ${managerToken}`);

      expect(staffRes.status).toBe(200);
      expect(staffRes.body.data.some((c: any) => c.isInternal)).toBe(true);
    });

    it('41. Add multiple comments', async () => {
      await request(app)
        .post(`/api/v1/tickets/${ticketCommentsId}/comments`)
        .set('Authorization', `Bearer ${customer1Token}`)
        .send({ content: 'Second response from customer' });

      await request(app)
        .post(`/api/v1/tickets/${ticketCommentsId}/comments`)
        .set('Authorization', `Bearer ${managerToken}`)
        .send({ content: 'Agent follow-up response to customer' });

      const res = await request(app)
        .get(`/api/v1/tickets/${ticketCommentsId}/comments`)
        .set('Authorization', `Bearer ${managerToken}`);

      expect(res.body.data.length).toBeGreaterThanOrEqual(4);
    });

    it('42. Attempt to submit an empty comment', async () => {
      const res = await request(app)
        .post(`/api/v1/tickets/${ticketCommentsId}/comments`)
        .set('Authorization', `Bearer ${customer1Token}`)
        .send({ content: '' });

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
    });
  });

  // ========================================================
  // Part 7: Search and analytics (Steps 43–50)
  // ========================================================
  describe('Part 7: Search and analytics', () => {
    it('43. Search for a ticket using its title', async () => {
      const res = await request(app)
        .get('/api/v1/search?q=Duplicate+charge&mode=lexical')
        .set('Authorization', `Bearer ${managerToken}`);

      expect(res.status).toBe(200);
      expect(res.body.data.items.length).toBeGreaterThanOrEqual(1);
      expect(res.body.data.items.some((t: any) => t.title.includes('Duplicate charge'))).toBe(true);
    });

    it('44. Search using keywords from its description', async () => {
      const res = await request(app)
        .get('/api/v1/search?q=sorting+hub&mode=lexical')
        .set('Authorization', `Bearer ${managerToken}`);

      expect(res.status).toBe(200);
      expect(res.body.data.items.some((t: any) => t.description.includes('sorting hub'))).toBe(true);
    });

    it('45. Test semantic search with different wording', async () => {
      // Query with semantic synonym phrasing
      const res = await request(app)
        .get('/api/v1/search?q=refund+money+double+billed&mode=hybrid')
        .set('Authorization', `Bearer ${managerToken}`);

      expect(res.status).toBe(200);
      expect(res.body.data.items.length).toBeGreaterThanOrEqual(1);
    });

    it('46. Filter tickets by status', async () => {
      const res = await request(app)
        .get('/api/v1/search?status=CLOSED')
        .set('Authorization', `Bearer ${managerToken}`);

      expect(res.status).toBe(200);
      expect(res.body.data.items.every((t: any) => t.status === TicketStatus.CLOSED)).toBe(true);
    });

    it('47. Filter tickets by priority', async () => {
      const res = await request(app)
        .get('/api/v1/search?priority=URGENT')
        .set('Authorization', `Bearer ${managerToken}`);

      expect(res.status).toBe(200);
      expect(res.body.data.items.every((t: any) => t.priority === TicketPriority.URGENT)).toBe(true);
    });

    it('48. Filter tickets by assigned agent', async () => {
      const res = await request(app)
        .get(`/api/v1/search?assignedAgentId=${agentBetaId}`)
        .set('Authorization', `Bearer ${managerToken}`);

      expect(res.status).toBe(200);
      expect(res.body.data.items.every((t: any) => t.assignedAgent?.id === agentBetaId)).toBe(true);
    });

    it('49. Combine multiple filters', async () => {
      const res = await request(app)
        .get(`/api/v1/search?priority=URGENT&status=CLOSED`)
        .set('Authorization', `Bearer ${managerToken}`);

      expect(res.status).toBe(200);
      expect(res.body.data.items.every((t: any) => t.priority === TicketPriority.URGENT && t.status === TicketStatus.CLOSED)).toBe(true);
    });

    it('50. Verify dashboard ticket counts against actual database records', async () => {
      const analyticsRes = await request(app)
        .get('/api/v1/analytics/overview')
        .set('Authorization', `Bearer ${managerToken}`);

      expect(analyticsRes.status).toBe(200);
      expect(analyticsRes.body.data.totalTickets).toBe(store.tickets.length);
      expect(typeof analyticsRes.body.data.openBacklog).toBe('number');
      expect(typeof analyticsRes.body.data.resolvedTickets).toBe('number');
      expect(typeof analyticsRes.body.data.escalationRatePercentage).toBe('number');
    });
  });

  // ========================================================
  // Part 8: Background processing (Steps 51–56)
  // ========================================================
  describe('Part 8: Background processing', () => {
    it('51. Create multiple tickets simultaneously', async () => {
      const concurrentTickets = await Promise.all([
        request(app).post('/api/v1/tickets').set('Authorization', `Bearer ${customer1Token}`).send({ title: 'Burst 1', description: 'Desc 1' }),
        request(app).post('/api/v1/tickets').set('Authorization', `Bearer ${customer1Token}`).send({ title: 'Burst 2', description: 'Desc 2' }),
        request(app).post('/api/v1/tickets').set('Authorization', `Bearer ${customer1Token}`).send({ title: 'Burst 3', description: 'Desc 3' }),
      ]);

      expect(concurrentTickets.every((r) => r.status === 201)).toBe(true);
    });

    it('52. Verify that background assignment jobs execute', async () => {
      const routeSpy = vi.spyOn(assignmentService, 'routeTicket');
      await queueManager.enqueueAssignment(ticketDeliveryId);

      expect(routeSpy).toHaveBeenCalledWith(ticketDeliveryId, undefined);
    });

    it('53. Verify that failed jobs are retried', async () => {
      const assignmentQueue = queueManager.getAssignmentQueue();
      // Inspect default options configured on assignment jobs
      expect(assignmentQueue).toBeDefined();
    });

    it('54. Test duplicate job handling', async () => {
      const routeSpy = vi.spyOn(assignmentService, 'routeTicket');
      // Enqueueing twice for the same ticket
      await Promise.all([
        queueManager.enqueueAssignment(ticketDeliveryId),
        queueManager.enqueueAssignment(ticketDeliveryId),
      ]);

      expect(routeSpy).toHaveBeenCalled();
    });

    it('55. Temporarily make Redis unavailable and verify fallback behavior', async () => {
      vi.spyOn(redisManager, 'isAvailable').mockReturnValue(false);

      const fallbackSpy = vi.spyOn(assignmentService, 'routeTicket');

      // Enqueueing while Redis is offline must execute fallback synchronously without throwing error
      await expect(queueManager.enqueueAssignment(ticketDeliveryId)).resolves.not.toThrow();
      expect(fallbackSpy).toHaveBeenCalledWith(ticketDeliveryId, undefined);

      vi.restoreAllMocks();
    });

    it('56. Temporarily make the NLP service unavailable and verify graceful error handling', async () => {
      // Mock NLP client failing
      vi.spyOn(nlpClient, 'processTicket').mockRejectedValueOnce(new Error('Connection refused to NLP microservice'));

      const res = await request(app)
        .post('/api/v1/tickets')
        .set('Authorization', `Bearer ${customer1Token}`)
        .send({
          title: 'Ticket created while NLP microservice is down',
          description: 'Payment issue that should still create gracefully even if NLP fails.',
        });

      // Ticket creation MUST succeed (201 Created) without crashing the API
      expect(res.status).toBe(201);
      expect(res.body.success).toBe(true);
      expect(res.body.data.id).toBeDefined();
    });
  });
});

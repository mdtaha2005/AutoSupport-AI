import { describe, it, expect, beforeEach, vi } from 'vitest';
import request from 'supertest';
import { app } from '../../src/app.js';
import { store, resetStore } from '../helpers/test-db.js';
import {
  UserRole,
  AvailabilityStatus,
  TicketPriority,
  TicketStatus,
  ActivityAction,
} from '@prisma/client';
import { signJwt } from '../../src/utils/jwt.js';

vi.mock('../../src/config/prisma.js', async () => {
  const { mockPrisma } = await import('../helpers/test-db.js');
  return { prisma: mockPrisma };
});

describe('Ticket Lifecycle, Assignment & Activity Audit Tests', () => {
  let adminToken: string;
  let managerToken: string;
  let agent1Token: string;
  let agent2Token: string;
  let customerToken: string;
  const agent1Id = '11111111-1111-1111-1111-111111111111';
  const agent2Id = '22222222-2222-2222-2222-222222222222';
  const customerId = '33333333-3333-3333-3333-333333333333';
  const dept1Id = '44444444-4444-4444-4444-444444444444';
  const dept2Id = '55555555-5555-5555-5555-555555555555';

  beforeEach(() => {
    resetStore();

    adminToken = signJwt({
      id: 'admin-id-1',
      email: 'admin@system.com',
      role: UserRole.ADMIN,
      name: 'Admin',
    });

    managerToken = signJwt({
      id: 'manager-id-1',
      email: 'manager@system.com',
      role: UserRole.MANAGER,
      name: 'Manager',
    });

    agent1Token = signJwt({
      id: agent1Id,
      email: 'agent1@system.com',
      role: UserRole.AGENT,
      name: 'Agent 1',
    });

    agent2Token = signJwt({
      id: agent2Id,
      email: 'agent2@system.com',
      role: UserRole.AGENT,
      name: 'Agent 2',
    });

    customerToken = signJwt({
      id: customerId,
      email: 'customer@acme.com',
      role: UserRole.CUSTOMER,
      name: 'Acme Customer',
    });

    // Departments
    store.departments.push(
      { id: dept1Id, name: 'Technical Support', description: 'Tech', isActive: true },
      { id: dept2Id, name: 'Billing Support', description: 'Billing', isActive: true }
    );

    // Users & Agents
    store.users.push(
      { id: agent1Id, email: 'agent1@system.com', name: 'Agent 1', role: UserRole.AGENT, isActive: true },
      { id: agent2Id, email: 'agent2@system.com', name: 'Agent 2', role: UserRole.AGENT, isActive: true },
      { id: customerId, email: 'customer@acme.com', name: 'Acme Customer', role: UserRole.CUSTOMER, isActive: true }
    );

    store.agentProfiles.push(
      {
        id: 'agent1-prof',
        userId: agent1Id,
        departmentId: dept1Id,
        skills: ['Node.js'],
        availabilityStatus: AvailabilityStatus.AVAILABLE,
        maxWorkload: 5,
        currentWorkload: 0,
      },
      {
        id: 'agent2-prof',
        userId: agent2Id,
        departmentId: dept2Id,
        skills: ['Invoices'],
        availabilityStatus: AvailabilityStatus.AVAILABLE,
        maxWorkload: 5,
        currentWorkload: 0,
      }
    );
  });

  describe('POST /api/v1/tickets', () => {
    it('should allow customer to create a ticket', async () => {
      const res = await request(app)
        .post('/api/v1/tickets')
        .set('Authorization', `Bearer ${customerToken}`)
        .send({
          title: 'Cannot reset password via email',
          description: 'Password reset emails never arrive in inbox or spam folder.',
          priority: TicketPriority.HIGH,
          departmentId: dept1Id,
        });

      expect(res.status).toBe(201);
      expect(res.body.success).toBe(true);
      expect(res.body.data.title).toBe('Cannot reset password via email');
      expect(res.body.data.status).toBe(TicketStatus.OPEN);
      expect(res.body.data.customerId).toBe(customerId);
      expect(res.body.data.customerEmail).toBe('customer@acme.com');

      // Verify activity recorded
      expect(store.ticketActivities.length).toBeGreaterThanOrEqual(1);
      expect(store.ticketActivities[0].action).toBe(ActivityAction.TICKET_CREATED);
    });

    it('should allow guest ticket creation with customerName and customerEmail', async () => {
      const res = await request(app).post('/api/v1/tickets').send({
        title: 'Billing issue for guest',
        description: 'Need invoice receipt PDF sent again',
        customerName: 'Guest User',
        customerEmail: 'guest@example.com',
      });

      expect(res.status).toBe(201);
      expect(res.body.data.customerEmail).toBe('guest@example.com');
    });
  });

  describe('GET /api/v1/tickets & RBAC Boundaries', () => {
    let ticketId: string;

    beforeEach(async () => {
      // Create ticket in Dept 1
      const res = await request(app)
        .post('/api/v1/tickets')
        .set('Authorization', `Bearer ${customerToken}`)
        .send({
          title: 'API Rate limit exceeded unexpectedly',
          description: 'Getting 429 errors despite staying under quota',
          departmentId: dept1Id,
        });
      ticketId = res.body.data.id;
    });

    it('should allow ADMIN and MANAGER to view any ticket', async () => {
      const res = await request(app)
        .get(`/api/v1/tickets/${ticketId}`)
        .set('Authorization', `Bearer ${managerToken}`);

      expect(res.status).toBe(200);
      expect(res.body.data.id).toBe(ticketId);
    });

    it('should FORBID AGENT from viewing tickets outside their assigned department (403 Forbidden)', async () => {
      // Agent 2 is in Dept 2 (Billing), while ticket is in Dept 1 (Tech) and unassigned
      const res = await request(app)
        .get(`/api/v1/tickets/${ticketId}`)
        .set('Authorization', `Bearer ${agent2Token}`);

      expect(res.status).toBe(403);
      expect(res.body.success).toBe(false);
      expect(res.body.message).toContain('outside their assigned department');
    });

    it('should FORBID AGENT from updating status of unassigned ticket (403 Forbidden)', async () => {
      const res = await request(app)
        .patch(`/api/v1/tickets/${ticketId}/status`)
        .set('Authorization', `Bearer ${agent2Token}`)
        .send({ status: TicketStatus.IN_PROGRESS });

      expect(res.status).toBe(403);
    });
  });

  describe('POST /api/v1/tickets/:id/assign (Assignment & Reassignment)', () => {
    let ticketId: string;

    beforeEach(async () => {
      const res = await request(app)
        .post('/api/v1/tickets')
        .set('Authorization', `Bearer ${customerToken}`)
        .send({
          title: 'Payment gateway timeout',
          description: 'Charges failing on checkout',
          departmentId: dept1Id,
        });
      ticketId = res.body.data.id;
    });

    it('should assign ticket to Agent 1 and increment Agent 1 currentWorkload', async () => {
      const res = await request(app)
        .post(`/api/v1/tickets/${ticketId}/assign`)
        .set('Authorization', `Bearer ${managerToken}`)
        .send({ agentId: agent1Id, reason: 'Technical specialization' });

      expect(res.status).toBe(200);
      expect(res.body.data.assignedAgentId).toBe(agent1Id);

      const agent1Profile = store.agentProfiles.find((p) => p.userId === agent1Id);
      expect(agent1Profile?.currentWorkload).toBe(1);

      // Verify activity recorded
      const assignActivity = store.ticketActivities.find(
        (a) => a.action === ActivityAction.AGENT_ASSIGNED
      );
      expect(assignActivity).toBeDefined();
    });

    it('should reassign ticket from Agent 1 to Agent 2 and balance workloads correctly', async () => {
      // First assign to Agent 1
      await request(app)
        .post(`/api/v1/tickets/${ticketId}/assign`)
        .set('Authorization', `Bearer ${managerToken}`)
        .send({ agentId: agent1Id });

      expect(store.agentProfiles.find((p) => p.userId === agent1Id)?.currentWorkload).toBe(1);
      expect(store.agentProfiles.find((p) => p.userId === agent2Id)?.currentWorkload).toBe(0);

      // Reassign to Agent 2
      const reassignRes = await request(app)
        .post(`/api/v1/tickets/${ticketId}/assign`)
        .set('Authorization', `Bearer ${managerToken}`)
        .send({ agentId: agent2Id, reason: 'Rebalancing workload' });

      expect(reassignRes.status).toBe(200);
      expect(reassignRes.body.data.assignedAgentId).toBe(agent2Id);

      // Agent 1 decremented, Agent 2 incremented
      expect(store.agentProfiles.find((p) => p.userId === agent1Id)?.currentWorkload).toBe(0);
      expect(store.agentProfiles.find((p) => p.userId === agent2Id)?.currentWorkload).toBe(1);

      // Reassign activity logged
      const reassignAct = store.ticketActivities.find(
        (a) => a.action === ActivityAction.AGENT_REASSIGNED
      );
      expect(reassignAct).toBeDefined();
    });

    it('should reject assignment to an OFFLINE agent (400 Bad Request)', async () => {
      // Set Agent 2 to OFFLINE
      const a2 = store.agentProfiles.find((p) => p.userId === agent2Id);
      if (a2) a2.availabilityStatus = AvailabilityStatus.OFFLINE;

      const res = await request(app)
        .post(`/api/v1/tickets/${ticketId}/assign`)
        .set('Authorization', `Bearer ${managerToken}`)
        .send({ agentId: agent2Id });

      expect(res.status).toBe(400);
      expect(res.body.message).toContain('OFFLINE');
    });

    it('should FORBID AGENT from assigning tickets (403 Forbidden)', async () => {
      const res = await request(app)
        .post(`/api/v1/tickets/${ticketId}/assign`)
        .set('Authorization', `Bearer ${agent1Token}`)
        .send({ agentId: agent2Id });

      expect(res.status).toBe(403);
    });
  });

  describe('Ticket Status Lifecycle & Workload Release', () => {
    it('should release assigned agent workload when ticket is RESOLVED or CLOSED', async () => {
      // Create ticket
      const ticketRes = await request(app)
        .post('/api/v1/tickets')
        .set('Authorization', `Bearer ${customerToken}`)
        .send({ title: 'Bug in checkout', description: 'Broken button' });
      const ticketId = ticketRes.body.data.id;

      // Assign to Agent 1
      await request(app)
        .post(`/api/v1/tickets/${ticketId}/assign`)
        .set('Authorization', `Bearer ${managerToken}`)
        .send({ agentId: agent1Id });

      expect(store.agentProfiles.find((p) => p.userId === agent1Id)?.currentWorkload).toBe(1);

      // Resolve ticket
      const resolveRes = await request(app)
        .patch(`/api/v1/tickets/${ticketId}/status`)
        .set('Authorization', `Bearer ${agent1Token}`)
        .send({ status: TicketStatus.RESOLVED });

      expect(resolveRes.status).toBe(200);
      expect(resolveRes.body.data.status).toBe(TicketStatus.RESOLVED);

      // Workload decremented back to 0
      expect(store.agentProfiles.find((p) => p.userId === agent1Id)?.currentWorkload).toBe(0);
    });
  });

  describe('Ticket Comments & Activities', () => {
    let ticketId: string;

    beforeEach(async () => {
      const ticketRes = await request(app)
        .post('/api/v1/tickets')
        .set('Authorization', `Bearer ${customerToken}`)
        .send({ title: 'Login loop bug', description: 'Redirects constantly', departmentId: dept1Id });
      ticketId = ticketRes.body.data.id;

      await request(app)
        .post(`/api/v1/tickets/${ticketId}/assign`)
        .set('Authorization', `Bearer ${managerToken}`)
        .send({ agentId: agent1Id });
    });

    it('should allow agent to post public comment and internal note', async () => {
      const internalRes = await request(app)
        .post(`/api/v1/tickets/${ticketId}/comments`)
        .set('Authorization', `Bearer ${agent1Token}`)
        .send({ content: 'Internal note: escalating to L3 dev', isInternal: true });

      expect(internalRes.status).toBe(201);
      expect(internalRes.body.data.isInternal).toBe(true);

      const publicRes = await request(app)
        .post(`/api/v1/tickets/${ticketId}/comments`)
        .set('Authorization', `Bearer ${agent1Token}`)
        .send({ content: 'Hello, we are investigating your login loop.', isInternal: false });

      expect(publicRes.status).toBe(201);
      expect(publicRes.body.data.isInternal).toBe(false);
    });

    it('should FORBID customer from posting an internal note (403 Forbidden)', async () => {
      const res = await request(app)
        .post(`/api/v1/tickets/${ticketId}/comments`)
        .set('Authorization', `Bearer ${customerToken}`)
        .send({ content: 'I want to write an internal note', isInternal: true });

      expect(res.status).toBe(403);
      expect(res.body.message).toContain('Customers cannot create internal notes');
    });

    it('should hide internal notes from customer when retrieving comments', async () => {
      // Add internal note by agent
      await request(app)
        .post(`/api/v1/tickets/${ticketId}/comments`)
        .set('Authorization', `Bearer ${agent1Token}`)
        .send({ content: 'Confidential debug trace', isInternal: true });

      // Add public comment
      await request(app)
        .post(`/api/v1/tickets/${ticketId}/comments`)
        .set('Authorization', `Bearer ${agent1Token}`)
        .send({ content: 'Customer visible reply', isInternal: false });

      // Customer fetches comments
      const res = await request(app)
        .get(`/api/v1/tickets/${ticketId}/comments`)
        .set('Authorization', `Bearer ${customerToken}`);

      expect(res.status).toBe(200);
      expect(res.body.data).toHaveLength(1);
      expect(res.body.data[0].content).toBe('Customer visible reply');
      expect(res.body.data[0].isInternal).toBe(false);
    });

    it('should fetch complete activity audit log for a ticket', async () => {
      const res = await request(app)
        .get(`/api/v1/tickets/${ticketId}/activities`)
        .set('Authorization', `Bearer ${managerToken}`);

      expect(res.status).toBe(200);
      expect(res.body.data.length).toBeGreaterThanOrEqual(2); // CREATED, ASSIGNED
    });
  });
});

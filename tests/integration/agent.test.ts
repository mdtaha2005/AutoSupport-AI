import { describe, it, expect, beforeEach, vi } from 'vitest';
import request from 'supertest';
import { app } from '../../src/app.js';
import { store, resetStore } from '../helpers/test-db.js';
import { UserRole, AvailabilityStatus } from '@prisma/client';
import { signJwt } from '../../src/utils/jwt.js';

vi.mock('../../src/config/prisma.js', async () => {
  const { mockPrisma } = await import('../helpers/test-db.js');
  return { prisma: mockPrisma };
});

describe('Agent Management & Workload Tests', () => {
  let adminToken: string;
  let managerToken: string;
  let agent1Token: string;
  let agent2Token: string;
  const agent1UserId = '33333333-3333-3333-3333-333333333333';
  const agent2UserId = '44444444-4444-4444-4444-444444444444';
  const agent1ProfileId = '55555555-5555-5555-5555-555555555555';
  const agent2ProfileId = '66666666-6666-6666-6666-666666666666';

  beforeEach(() => {
    resetStore();

    adminToken = signJwt({
      id: '11111111-1111-1111-1111-111111111111',
      email: 'admin@system.com',
      role: UserRole.ADMIN,
      name: 'System Admin',
    });

    managerToken = signJwt({
      id: '22222222-2222-2222-2222-222222222222',
      email: 'manager@system.com',
      role: UserRole.MANAGER,
      name: 'Support Manager',
    });

    agent1Token = signJwt({
      id: agent1UserId,
      email: 'agent1@system.com',
      role: UserRole.AGENT,
      name: 'Alex Agent',
    });

    agent2Token = signJwt({
      id: agent2UserId,
      email: 'agent2@system.com',
      role: UserRole.AGENT,
      name: 'Bob Agent',
    });

    // Populate Agent 1
    store.users.push({
      id: agent1UserId,
      email: 'agent1@system.com',
      passwordHash: 'hash',
      name: 'Alex Agent',
      role: UserRole.AGENT,
      isActive: true,
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    store.agentProfiles.push({
      id: agent1ProfileId,
      userId: agent1UserId,
      departmentId: null,
      skills: ['TypeScript', 'Node.js'],
      availabilityStatus: AvailabilityStatus.AVAILABLE,
      maxWorkload: 5,
      currentWorkload: 2,
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    // Populate Agent 2
    store.users.push({
      id: agent2UserId,
      email: 'agent2@system.com',
      passwordHash: 'hash',
      name: 'Bob Agent',
      role: UserRole.AGENT,
      isActive: true,
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    store.agentProfiles.push({
      id: agent2ProfileId,
      userId: agent2UserId,
      departmentId: null,
      skills: ['Billing', 'Refunds'],
      availabilityStatus: AvailabilityStatus.OFFLINE,
      maxWorkload: 4,
      currentWorkload: 0,
      createdAt: new Date(),
      updatedAt: new Date(),
    });
  });

  describe('GET /api/v1/agents', () => {
    it('should list agents with capacity and workload percentage calculated', async () => {
      const res = await request(app)
        .get('/api/v1/agents')
        .set('Authorization', `Bearer ${managerToken}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data).toHaveLength(2);
      expect(res.body.data[0].capacityAvailable).toBeDefined();
      expect(res.body.data[0].workloadPercentage).toBeDefined();
    });
  });

  describe('PATCH /api/v1/agents/:id/availability', () => {
    it('should allow agent to update their own availability status', async () => {
      const res = await request(app)
        .patch(`/api/v1/agents/${agent1ProfileId}/availability`)
        .set('Authorization', `Bearer ${agent1Token}`)
        .send({ availabilityStatus: AvailabilityStatus.BUSY });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.availabilityStatus).toBe(AvailabilityStatus.BUSY);
    });

    it('should FORBID agent from updating another agent availability status (403 Forbidden)', async () => {
      const res = await request(app)
        .patch(`/api/v1/agents/${agent2ProfileId}/availability`)
        .set('Authorization', `Bearer ${agent1Token}`)
        .send({ availabilityStatus: AvailabilityStatus.AVAILABLE });

      expect(res.status).toBe(403);
      expect(res.body.success).toBe(false);
      expect(res.body.message).toContain('only update their own');
    });

    it('should allow MANAGER to update any agent availability status', async () => {
      const res = await request(app)
        .patch(`/api/v1/agents/${agent2ProfileId}/availability`)
        .set('Authorization', `Bearer ${managerToken}`)
        .send({ availabilityStatus: AvailabilityStatus.AVAILABLE });

      expect(res.status).toBe(200);
      expect(res.body.data.availabilityStatus).toBe(AvailabilityStatus.AVAILABLE);
    });
  });

  describe('PUT /api/v1/agents/:id', () => {
    it('should allow MANAGER or ADMIN to update skills and maxWorkload', async () => {
      const res = await request(app)
        .put(`/api/v1/agents/${agent1ProfileId}`)
        .set('Authorization', `Bearer ${managerToken}`)
        .send({
          skills: ['TypeScript', 'Express', 'Prisma', 'PostgreSQL'],
          maxWorkload: 8,
        });

      expect(res.status).toBe(200);
      expect(res.body.data.skills).toContain('PostgreSQL');
      expect(res.body.data.maxWorkload).toBe(8);
    });

    it('should FORBID AGENT from updating their own maxWorkload (403 Forbidden)', async () => {
      const res = await request(app)
        .put(`/api/v1/agents/${agent1ProfileId}`)
        .set('Authorization', `Bearer ${agent1Token}`)
        .send({ maxWorkload: 20 });

      expect(res.status).toBe(403);
    });
  });

  describe('GET /api/v1/agents/:id/workload', () => {
    it('should return agent real-time workload stats and capacity', async () => {
      const res = await request(app)
        .get(`/api/v1/agents/${agent1ProfileId}/workload`)
        .set('Authorization', `Bearer ${agent1Token}`);

      expect(res.status).toBe(200);
      expect(res.body.data.maxWorkload).toBe(5);
      expect(res.body.data.availabilityStatus).toBe(AvailabilityStatus.AVAILABLE);
    });
  });
});

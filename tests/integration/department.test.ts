import { describe, it, expect, beforeEach, vi } from 'vitest';
import request from 'supertest';
import { app } from '../../src/app.js';
import { store, resetStore } from '../helpers/test-db.js';
import { UserRole } from '@prisma/client';
import { signJwt } from '../../src/utils/jwt.js';

vi.mock('../../src/config/prisma.js', async () => {
  const { mockPrisma } = await import('../helpers/test-db.js');
  return { prisma: mockPrisma };
});

describe('Department Management & RBAC Tests', () => {
  let adminToken: string;
  let managerToken: string;
  let agentToken: string;

  beforeEach(() => {
    resetStore();

    adminToken = signJwt({
      id: 'admin-1',
      email: 'admin@system.com',
      role: UserRole.ADMIN,
      name: 'System Admin',
    });

    managerToken = signJwt({
      id: 'mgr-1',
      email: 'manager@system.com',
      role: UserRole.MANAGER,
      name: 'Support Manager',
    });

    agentToken = signJwt({
      id: 'agent-1',
      email: 'agent@system.com',
      role: UserRole.AGENT,
      name: 'Support Agent',
    });
  });

  describe('POST /api/v1/departments', () => {
    it('should allow ADMIN to create a department', async () => {
      const res = await request(app)
        .post('/api/v1/departments')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          name: 'Technical Support',
          description: 'Handles server and API issues',
        });

      expect(res.status).toBe(201);
      expect(res.body.success).toBe(true);
      expect(res.body.data.name).toBe('Technical Support');
    });

    it('should FORBID MANAGER from creating a department (403 Forbidden)', async () => {
      const res = await request(app)
        .post('/api/v1/departments')
        .set('Authorization', `Bearer ${managerToken}`)
        .send({
          name: 'Billing Support',
        });

      expect(res.status).toBe(403);
      expect(res.body.success).toBe(false);
    });

    it('should FORBID AGENT from creating a department (403 Forbidden)', async () => {
      const res = await request(app)
        .post('/api/v1/departments')
        .set('Authorization', `Bearer ${agentToken}`)
        .send({
          name: 'Operations',
        });

      expect(res.status).toBe(403);
    });

    it('should reject duplicate department names (409 Conflict)', async () => {
      await request(app)
        .post('/api/v1/departments')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ name: 'General Support' });

      const res = await request(app)
        .post('/api/v1/departments')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ name: 'General Support' });

      expect(res.status).toBe(409);
    });
  });

  describe('GET /api/v1/departments', () => {
    it('should allow AGENT, MANAGER, and ADMIN to list departments', async () => {
      // Create a department first
      await request(app)
        .post('/api/v1/departments')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ name: 'Tier 1 Support' });

      const res = await request(app)
        .get('/api/v1/departments')
        .set('Authorization', `Bearer ${agentToken}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data).toHaveLength(1);
    });
  });

  describe('PUT /api/v1/departments/:id', () => {
    it('should allow ADMIN to update department details', async () => {
      const createRes = await request(app)
        .post('/api/v1/departments')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ name: 'Tier 2 Support' });

      const deptId = createRes.body.data.id;

      const updateRes = await request(app)
        .put(`/api/v1/departments/${deptId}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ description: 'Updated description' });

      expect(updateRes.status).toBe(200);
      expect(updateRes.body.data.description).toBe('Updated description');
    });
  });
});

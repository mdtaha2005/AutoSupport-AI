import { describe, it, expect, beforeEach, vi } from 'vitest';
import request from 'supertest';
import { app } from '../../src/app.js';
import { store, resetStore } from '../helpers/test-db.js';
import { UserRole } from '@prisma/client';
import { hashPassword } from '../../src/utils/password.js';

vi.mock('../../src/config/prisma.js', async () => {
  const { mockPrisma } = await import('../helpers/test-db.js');
  return { prisma: mockPrisma };
});

describe('Auth Integration Tests', () => {
  beforeEach(async () => {
    resetStore();

    // Seed an admin user
    const adminPass = await hashPassword('AdminPass123!');
    store.users.push({
      id: 'admin-uuid-1',
      email: 'admin@system.com',
      passwordHash: adminPass,
      name: 'System Admin',
      role: UserRole.ADMIN,
      isActive: true,
      createdAt: new Date(),
      updatedAt: new Date(),
    });
  });

  describe('POST /api/v1/auth/register', () => {
    it('should register a new customer user successfully', async () => {
      const res = await request(app).post('/api/v1/auth/register').send({
        email: 'alice@example.com',
        password: 'Password123!',
        name: 'Alice Customer',
      });

      expect(res.status).toBe(201);
      expect(res.body.success).toBe(true);
      expect(res.body.data.user.email).toBe('alice@example.com');
      expect(res.body.data.user.role).toBe(UserRole.CUSTOMER);
      expect(res.body.data.token).toBeDefined();
      expect(res.body.data.user.passwordHash).toBeUndefined(); // Never expose hash!
    });

    it('should reject registration if email already exists (409 Conflict)', async () => {
      await request(app).post('/api/v1/auth/register').send({
        email: 'duplicate@example.com',
        password: 'Password123!',
        name: 'First User',
      });

      const res = await request(app).post('/api/v1/auth/register').send({
        email: 'duplicate@example.com',
        password: 'Password123!',
        name: 'Second User',
      });

      expect(res.status).toBe(409);
      expect(res.body.success).toBe(false);
      expect(res.body.message).toContain('already exists');
    });

    it('should reject invalid password format (400 Bad Request)', async () => {
      const res = await request(app).post('/api/v1/auth/register').send({
        email: 'badpassword@example.com',
        password: 'short',
        name: 'Bad Pass',
      });

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
      expect(res.body.errors).toBeDefined();
    });

    it('should prevent non-admin from registering as ADMIN or MANAGER (403 Forbidden)', async () => {
      const res = await request(app).post('/api/v1/auth/register').send({
        email: 'fakeadmin@example.com',
        password: 'Password123!',
        name: 'Fake Admin',
        role: UserRole.ADMIN,
      });

      expect(res.status).toBe(403);
      expect(res.body.success).toBe(false);
    });
  });

  describe('POST /api/v1/auth/login', () => {
    it('should login successfully with correct credentials and return JWT', async () => {
      const res = await request(app).post('/api/v1/auth/login').send({
        email: 'admin@system.com',
        password: 'AdminPass123!',
      });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.token).toBeDefined();
      expect(res.body.data.user.email).toBe('admin@system.com');
      expect(res.body.data.user.role).toBe(UserRole.ADMIN);
      expect(res.body.data.user.passwordHash).toBeUndefined();
    });

    it('should reject login with incorrect password (401 Unauthorized)', async () => {
      const res = await request(app).post('/api/v1/auth/login').send({
        email: 'admin@system.com',
        password: 'WrongPassword123!',
      });

      expect(res.status).toBe(401);
      expect(res.body.success).toBe(false);
      expect(res.body.message).toContain('Invalid email or password');
    });

    it('should reject login for non-existent email (401 Unauthorized)', async () => {
      const res = await request(app).post('/api/v1/auth/login').send({
        email: 'nonexistent@system.com',
        password: 'AdminPass123!',
      });

      expect(res.status).toBe(401);
      expect(res.body.success).toBe(false);
    });
  });

  describe('GET /api/v1/auth/me', () => {
    it('should return current user profile when valid Bearer token provided', async () => {
      const loginRes = await request(app).post('/api/v1/auth/login').send({
        email: 'admin@system.com',
        password: 'AdminPass123!',
      });

      const token = loginRes.body.data.token;

      const meRes = await request(app)
        .get('/api/v1/auth/me')
        .set('Authorization', `Bearer ${token}`);

      expect(meRes.status).toBe(200);
      expect(meRes.body.success).toBe(true);
      expect(meRes.body.data.email).toBe('admin@system.com');
      expect(meRes.body.data.role).toBe(UserRole.ADMIN);
    });

    it('should reject request when token is missing (401 Unauthorized)', async () => {
      const res = await request(app).get('/api/v1/auth/me');
      expect(res.status).toBe(401);
      expect(res.body.success).toBe(false);
    });
  });

  describe('POST /api/v1/auth/change-password', () => {
    it('should allow user to change password after verifying current password', async () => {
      const loginRes = await request(app).post('/api/v1/auth/login').send({
        email: 'admin@system.com',
        password: 'AdminPass123!',
      });
      const token = loginRes.body.data.token;

      const changeRes = await request(app)
        .post('/api/v1/auth/change-password')
        .set('Authorization', `Bearer ${token}`)
        .send({
          currentPassword: 'AdminPass123!',
          newPassword: 'NewAdminPass456!',
        });

      expect(changeRes.status).toBe(200);
      expect(changeRes.body.success).toBe(true);

      // Verify can login with new password
      const newLoginRes = await request(app).post('/api/v1/auth/login').send({
        email: 'admin@system.com',
        password: 'NewAdminPass456!',
      });
      expect(newLoginRes.status).toBe(200);
    });
  });
});

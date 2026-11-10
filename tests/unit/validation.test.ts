import { describe, it, expect } from 'vitest';
import { registerSchema, loginSchema } from '../../src/modules/auth/auth.validation.js';
import { createTicketSchema } from '../../src/modules/tickets/ticket.validation.js';
import { createDepartmentSchema } from '../../src/modules/departments/department.validation.js';
import { TicketPriority } from '@prisma/client';

describe('Validation Schemas', () => {
  describe('registerSchema', () => {
    it('should validate valid registration input', () => {
      const valid = {
        email: 'user@example.com',
        password: 'ValidPassword123!',
        name: 'Jane Doe',
      };
      const result = registerSchema.safeParse(valid);
      expect(result.success).toBe(true);
    });

    it('should reject invalid email', () => {
      const invalid = {
        email: 'not-an-email',
        password: 'ValidPassword123!',
        name: 'Jane Doe',
      };
      const result = registerSchema.safeParse(invalid);
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.errors[0].message).toContain('email');
      }
    });

    it('should reject weak passwords lacking numbers or uppercase letters', () => {
      const weak = {
        email: 'user@example.com',
        password: 'passwordonly',
        name: 'Jane Doe',
      };
      const result = registerSchema.safeParse(weak);
      expect(result.success).toBe(false);
    });
  });

  describe('createTicketSchema', () => {
    it('should validate valid ticket data', () => {
      const valid = {
        title: 'Unable to access dashboard',
        description: 'Receiving HTTP 500 error when visiting /dashboard',
        priority: TicketPriority.HIGH,
      };
      const result = createTicketSchema.safeParse(valid);
      expect(result.success).toBe(true);
    });

    it('should reject short title or description', () => {
      const invalid = {
        title: 'Hi',
        description: 'Err',
      };
      const result = createTicketSchema.safeParse(invalid);
      expect(result.success).toBe(false);
    });
  });

  describe('createDepartmentSchema', () => {
    it('should require minimum name length', () => {
      expect(createDepartmentSchema.safeParse({ name: 'A' }).success).toBe(false);
      expect(createDepartmentSchema.safeParse({ name: 'Support' }).success).toBe(true);
    });
  });
});

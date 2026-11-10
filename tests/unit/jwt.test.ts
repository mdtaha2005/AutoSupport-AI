import { describe, it, expect } from 'vitest';
import { signJwt, verifyJwt } from '../../src/utils/jwt.js';
import { UserRole } from '@prisma/client';
import { UserPayload } from '../../src/types/index.js';

describe('JWT Utility', () => {
  const sampleUser: UserPayload = {
    id: '123e4567-e89b-12d3-a456-426614174000',
    email: 'agent@test.com',
    role: UserRole.AGENT,
    name: 'Test Agent',
  };

  it('should sign a valid JWT token containing user payload', () => {
    const token = signJwt(sampleUser);
    expect(typeof token).toBe('string');
    expect(token.split('.')).toHaveLength(3);
  });

  it('should verify and decode valid JWT payload', () => {
    const token = signJwt(sampleUser);
    const decoded = verifyJwt(token);

    expect(decoded.id).toBe(sampleUser.id);
    expect(decoded.email).toBe(sampleUser.email);
    expect(decoded.role).toBe(UserRole.AGENT);
    expect(decoded.name).toBe(sampleUser.name);
  });

  it('should throw an error for a tampered or invalid token', () => {
    const token = signJwt(sampleUser);
    const tampered = token.slice(0, -5) + 'abcde';

    expect(() => verifyJwt(tampered)).toThrow();
  });
});

import { describe, it, expect, vi } from 'vitest';
import { authorizeRoles } from '../../src/middleware/rbac.middleware.js';
import { UserRole } from '@prisma/client';
import { AuthenticatedRequest } from '../../src/types/index.js';
import { ForbiddenError, UnauthorizedError } from '../../src/errors/error-types.js';

describe('RBAC Middleware', () => {
  it('should call next() if user role is included in allowed roles', () => {
    const middleware = authorizeRoles(UserRole.ADMIN, UserRole.MANAGER);
    const req = {
      user: {
        id: '1',
        email: 'admin@test.com',
        role: UserRole.ADMIN,
        name: 'Admin',
      },
    } as AuthenticatedRequest;
    const res = {} as never;
    const next = vi.fn();

    middleware(req, res, next);
    expect(next).toHaveBeenCalledWith();
  });

  it('should pass ForbiddenError to next() if user role is not allowed', () => {
    const middleware = authorizeRoles(UserRole.ADMIN);
    const req = {
      user: {
        id: '2',
        email: 'agent@test.com',
        role: UserRole.AGENT,
        name: 'Agent',
      },
    } as AuthenticatedRequest;
    const res = {} as never;
    const next = vi.fn();

    middleware(req, res, next);
    expect(next).toHaveBeenCalled();
    const error = next.mock.calls[0][0];
    expect(error).toBeInstanceOf(ForbiddenError);
    expect(error.statusCode).toBe(403);
  });

  it('should pass UnauthorizedError to next() if req.user is missing', () => {
    const middleware = authorizeRoles(UserRole.ADMIN);
    const req = {} as AuthenticatedRequest;
    const res = {} as never;
    const next = vi.fn();

    middleware(req, res, next);
    expect(next).toHaveBeenCalled();
    const error = next.mock.calls[0][0];
    expect(error).toBeInstanceOf(UnauthorizedError);
    expect(error.statusCode).toBe(401);
  });
});

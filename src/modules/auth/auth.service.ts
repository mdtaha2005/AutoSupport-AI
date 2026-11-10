import { UserRole } from '@prisma/client';
import { prisma } from '../../config/prisma.js';
import { RegisterInput, LoginInput, ChangePasswordInput } from './auth.validation.js';
import { hashPassword, comparePassword } from '../../utils/password.js';
import { signJwt } from '../../utils/jwt.js';
import { UserPayload } from '../../types/index.js';
import {
  BadRequestError,
  ConflictError,
  ForbiddenError,
  NotFoundError,
  UnauthorizedError,
} from '../../errors/error-types.js';

export class AuthService {
  async register(input: RegisterInput, requestingUser?: UserPayload) {
    const existing = await prisma.user.findUnique({
      where: { email: input.email },
    });

    if (existing) {
      throw new ConflictError('A user with this email address already exists');
    }

    // Role assignment rules:
    // Only ADMIN can assign ADMIN, MANAGER, or AGENT roles.
    // Self-registration defaults to CUSTOMER unless ADMIN is creating the user.
    let assignedRole: UserRole = UserRole.CUSTOMER;

    if (input.role) {
      const isAdmin = requestingUser?.role === UserRole.ADMIN;
      const isManagerCreatingAgent = requestingUser?.role === UserRole.MANAGER && input.role === UserRole.AGENT;
      if (!isAdmin && !isManagerCreatingAgent) {
        throw new ForbiddenError('Only administrators (or managers adding agents) can assign specific user roles');
      }
      assignedRole = input.role;
    }

    const passwordHash = await hashPassword(input.password);

    // Atomically create user and agent profile if role is AGENT
    const result = await prisma.$transaction(async (tx) => {
      const user = await tx.user.create({
        data: {
          email: input.email,
          passwordHash,
          name: input.name,
          role: assignedRole,
        },
      });

      if (assignedRole === UserRole.AGENT) {
        if (input.departmentId) {
          const dept = await tx.department.findUnique({
            where: { id: input.departmentId },
          });
          if (!dept) {
            throw new BadRequestError('Specified department does not exist');
          }
        }

        await tx.agentProfile.create({
          data: {
            userId: user.id,
            departmentId: input.departmentId || null,
            skills: input.skills || [],
            maxWorkload: input.maxWorkload || 5,
          },
        });
      }

      return user;
    });

    const userPayload: UserPayload = {
      id: result.id,
      email: result.email,
      name: result.name,
      role: result.role,
    };

    const token = signJwt(userPayload);

    return {
      user: userPayload,
      token,
    };
  }

  async login(input: LoginInput) {
    const user = await prisma.user.findUnique({
      where: { email: input.email },
      include: {
        agentProfile: {
          include: {
            department: true,
          },
        },
      },
    });

    if (!user) {
      throw new UnauthorizedError('Invalid email or password');
    }

    if (!user.isActive) {
      throw new UnauthorizedError('Your account has been deactivated. Please contact support.');
    }

    const isPasswordValid = await comparePassword(input.password, user.passwordHash);
    if (!isPasswordValid) {
      throw new UnauthorizedError('Invalid email or password');
    }

    const userPayload: UserPayload = {
      id: user.id,
      email: user.email,
      name: user.name,
      role: user.role,
    };

    const token = signJwt(userPayload);

    return {
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        role: user.role,
        agentProfile: user.agentProfile
          ? {
              id: user.agentProfile.id,
              skills: user.agentProfile.skills,
              availabilityStatus: user.agentProfile.availabilityStatus,
              maxWorkload: user.agentProfile.maxWorkload,
              currentWorkload: user.agentProfile.currentWorkload,
              department: user.agentProfile.department
                ? {
                    id: user.agentProfile.department.id,
                    name: user.agentProfile.department.name,
                  }
                : null,
            }
          : null,
      },
      token,
    };
  }

  async getProfile(userId: string) {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      include: {
        agentProfile: {
          include: {
            department: true,
          },
        },
      },
    });

    if (!user) {
      throw new NotFoundError('User profile not found');
    }

    return {
      id: user.id,
      email: user.email,
      name: user.name,
      role: user.role,
      isActive: user.isActive,
      createdAt: user.createdAt,
      agentProfile: user.agentProfile
        ? {
            id: user.agentProfile.id,
            skills: user.agentProfile.skills,
            availabilityStatus: user.agentProfile.availabilityStatus,
            maxWorkload: user.agentProfile.maxWorkload,
            currentWorkload: user.agentProfile.currentWorkload,
            department: user.agentProfile.department
              ? {
                  id: user.agentProfile.department.id,
                  name: user.agentProfile.department.name,
                }
              : null,
          }
        : null,
    };
  }

  async changePassword(userId: string, input: ChangePasswordInput) {
    const user = await prisma.user.findUnique({
      where: { id: userId },
    });

    if (!user) {
      throw new NotFoundError('User not found');
    }

    const isMatch = await comparePassword(input.currentPassword, user.passwordHash);
    if (!isMatch) {
      throw new BadRequestError('Current password is incorrect');
    }

    const newHash = await hashPassword(input.newPassword);

    await prisma.user.update({
      where: { id: userId },
      data: { passwordHash: newHash },
    });

    return { message: 'Password updated successfully' };
  }
}

export const authService = new AuthService();

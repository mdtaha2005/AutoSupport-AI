import { prisma } from '../../config/prisma.js';
import { CreateDepartmentInput, UpdateDepartmentInput } from './department.validation.js';
import { ConflictError, NotFoundError, BadRequestError } from '../../errors/error-types.js';

export class DepartmentService {
  async create(input: CreateDepartmentInput) {
    const existing = await prisma.department.findUnique({
      where: { name: input.name },
    });

    if (existing) {
      throw new ConflictError(`Department '${input.name}' already exists`);
    }

    return prisma.department.create({
      data: {
        name: input.name,
        description: input.description,
      },
    });
  }

  async findAll(includeInactive = false) {
    return prisma.department.findMany({
      where: includeInactive ? undefined : { isActive: true },
      include: {
        _count: {
          select: {
            agents: true,
            tickets: true,
          },
        },
      },
      orderBy: { name: 'asc' },
    });
  }

  async findById(id: string) {
    const department = await prisma.department.findUnique({
      where: { id },
      include: {
        agents: {
          include: {
            user: {
              select: {
                id: true,
                name: true,
                email: true,
                role: true,
                isActive: true,
              },
            },
          },
        },
        _count: {
          select: {
            tickets: true,
          },
        },
      },
    });

    if (!department) {
      throw new NotFoundError(`Department with ID '${id}' not found`);
    }

    return department;
  }

  async update(id: string, input: UpdateDepartmentInput) {
    await this.findById(id);

    if (input.name) {
      const existing = await prisma.department.findFirst({
        where: {
          name: input.name,
          NOT: { id },
        },
      });

      if (existing) {
        throw new ConflictError(`Department with name '${input.name}' already exists`);
      }
    }

    return prisma.department.update({
      where: { id },
      data: input,
    });
  }

  async delete(id: string) {
    const department = await this.findById(id);

    const activeTicketsCount = await prisma.ticket.count({
      where: {
        departmentId: id,
        status: { in: ['OPEN', 'IN_PROGRESS', 'PENDING_CUSTOMER'] },
      },
    });

    if (activeTicketsCount > 0) {
      throw new BadRequestError(
        `Cannot delete department with ${activeTicketsCount} active tickets. Reassign tickets first or deactivate department.`
      );
    }

    // Soft delete by setting isActive to false
    return prisma.department.update({
      where: { id },
      data: { isActive: false },
    });
  }
}

export const departmentService = new DepartmentService();

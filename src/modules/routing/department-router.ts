import { TicketCategory } from '@prisma/client';
import { prisma } from '../../config/prisma.js';
import { logger } from '../../config/logger.js';
import { routingConfig } from '../../config/routing.config.js';

export class DepartmentRouter {
  /**
   * Resolves target department ID for a ticket based on explicit selection or NLP category/intent.
   */
  async resolveDepartment(
    ticket: {
      id: string;
      departmentId?: string | null;
      category?: TicketCategory | null;
    },
    preferredDepartmentId?: string
  ): Promise<string | null> {
    // 1. Explicit preferred department or already-assigned department
    const candidateDeptId = preferredDepartmentId || ticket.departmentId;
    if (candidateDeptId) {
      const existingDept = await prisma.department.findUnique({
        where: { id: candidateDeptId },
      });
      if (existingDept && existingDept.isActive) {
        logger.debug(`Preserving explicitly specified department '${existingDept.name}' for ticket ${ticket.id}`);
        return existingDept.id;
      }
    }

    // 2. Infer target department name from NLP category
    const category = ticket.category || TicketCategory.OTHER;
    const targetDeptName = routingConfig.categoryDepartmentMap[category] || 'Customer Operations';

    // 3. Find matching active department in database
    const matchedDept = await prisma.department.findFirst({
      where: {
        name: { equals: targetDeptName, mode: 'insensitive' },
        isActive: true,
      },
    });

    if (matchedDept) {
      logger.debug(
        `Routed ticket ${ticket.id} [Category: ${category}] to department '${matchedDept.name}' (${matchedDept.id})`
      );
      return matchedDept.id;
    }

    // 4. Fallback: select any active department if specific target is not found
    const fallbackDept = await prisma.department.findFirst({
      where: { isActive: true },
      orderBy: { createdAt: 'asc' },
    });

    if (fallbackDept) {
      logger.warn(
        `Target department '${targetDeptName}' not found for category ${category}. Falling back to '${fallbackDept.name}'.`
      );
      return fallbackDept.id;
    }

    logger.error(`No active departments found in the system for ticket ${ticket.id}`);
    return null;
  }
}

export const departmentRouter = new DepartmentRouter();

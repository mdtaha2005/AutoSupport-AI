import { ActivityAction, TicketStatus, UserRole } from '@prisma/client';
import { prisma } from '../../config/prisma.js';
import { CreateCommentInput } from './comment.validation.js';
import { UserPayload } from '../../types/index.js';
import { ForbiddenError, NotFoundError } from '../../errors/error-types.js';

export class CommentService {
  async addComment(ticketId: string, input: CreateCommentInput, requestingUser: UserPayload) {
    const ticket = await prisma.ticket.findUnique({
      where: { id: ticketId },
    });

    if (!ticket) {
      throw new NotFoundError(`Ticket with ID '${ticketId}' not found`);
    }

    // Role-based permission checks
    if (requestingUser.role === UserRole.CUSTOMER) {
      if (ticket.customerId !== requestingUser.id) {
        throw new ForbiddenError('You can only comment on your own tickets');
      }
      if (input.isInternal) {
        throw new ForbiddenError('Customers cannot create internal notes');
      }
    } else if (requestingUser.role === UserRole.AGENT) {
      const agentProfile = await prisma.agentProfile.findUnique({
        where: { userId: requestingUser.id },
      });

      const isAssigned = ticket.assignedAgentId === requestingUser.id;
      const isSameDept = agentProfile?.departmentId && ticket.departmentId === agentProfile.departmentId;

      if (!isAssigned && !isSameDept) {
        throw new ForbiddenError('Agents cannot comment on tickets outside their department or assignments');
      }
    }

    const comment = await prisma.$transaction(async (tx) => {
      // 1. Create comment
      const newComment = await tx.ticketComment.create({
        data: {
          ticketId,
          authorId: requestingUser.id,
          content: input.content,
          isInternal: input.isInternal ?? false,
        },
        include: {
          author: {
            select: {
              id: true,
              name: true,
              email: true,
              role: true,
            },
          },
        },
      });

      // 2. Activity log
      await tx.ticketActivity.create({
        data: {
          ticketId,
          actorId: requestingUser.id,
          action: ActivityAction.COMMENT_ADDED,
          details: {
            commentId: newComment.id,
            isInternal: newComment.isInternal,
            authorName: requestingUser.name,
            authorRole: requestingUser.role,
          },
        },
      });

      // 3. Workflow bonus: If customer replies to a PENDING_CUSTOMER ticket, auto-change status to IN_PROGRESS
      if (
        requestingUser.role === UserRole.CUSTOMER &&
        ticket.status === TicketStatus.PENDING_CUSTOMER
      ) {
        await tx.ticket.update({
          where: { id: ticketId },
          data: { status: TicketStatus.IN_PROGRESS },
        });

        await tx.ticketActivity.create({
          data: {
            ticketId,
            actorId: requestingUser.id,
            action: ActivityAction.STATUS_UPDATED,
            details: {
              from: TicketStatus.PENDING_CUSTOMER,
              to: TicketStatus.IN_PROGRESS,
              reason: 'Customer replied to ticket',
            },
          },
        });
      }

      return newComment;
    });

    return comment;
  }

  async getComments(ticketId: string, requestingUser: UserPayload) {
    const ticket = await prisma.ticket.findUnique({
      where: { id: ticketId },
    });

    if (!ticket) {
      throw new NotFoundError(`Ticket with ID '${ticketId}' not found`);
    }

    // Role-based permission checks
    if (requestingUser.role === UserRole.CUSTOMER) {
      if (ticket.customerId !== requestingUser.id) {
        throw new ForbiddenError('You can only view comments on your own tickets');
      }
    } else if (requestingUser.role === UserRole.AGENT) {
      const agentProfile = await prisma.agentProfile.findUnique({
        where: { userId: requestingUser.id },
      });

      const isAssigned = ticket.assignedAgentId === requestingUser.id;
      const isSameDept = agentProfile?.departmentId && ticket.departmentId === agentProfile.departmentId;

      if (!isAssigned && !isSameDept) {
        throw new ForbiddenError('Agents cannot view comments for tickets outside their department');
      }
    }

    const comments = await prisma.ticketComment.findMany({
      where: {
        ticketId,
        // If customer, hide internal comments!
        ...(requestingUser.role === UserRole.CUSTOMER ? { isInternal: false } : {}),
      },
      include: {
        author: {
          select: {
            id: true,
            name: true,
            email: true,
            role: true,
          },
        },
      },
      orderBy: { createdAt: 'asc' },
    });

    return comments;
  }
}

export const commentService = new CommentService();

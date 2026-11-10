import { z } from 'zod';
import { TicketPriority, TicketStatus, TicketCategory } from '@prisma/client';

export const createTicketSchema = z.object({
  title: z.string().min(3, 'Title must be at least 3 characters').max(200).trim(),
  description: z.string().min(5, 'Description must be at least 5 characters').trim(),
  priority: z.nativeEnum(TicketPriority).optional().default(TicketPriority.MEDIUM),
  category: z.nativeEnum(TicketCategory).optional(),
  departmentId: z.string().uuid().optional(),
  assignedAgentId: z.string().uuid().optional(),
  customerName: z.string().min(2).optional(),
  customerEmail: z.string().email().optional(),
});

export const updateTicketSchema = z.object({
  title: z.string().min(3).max(200).trim().optional(),
  description: z.string().min(5).trim().optional(),
  priority: z.nativeEnum(TicketPriority).optional(),
  category: z.nativeEnum(TicketCategory).optional(),
  departmentId: z.string().uuid().nullable().optional(),
});

export const updateStatusSchema = z.object({
  status: z.nativeEnum(TicketStatus, {
    errorMap: () => ({ message: 'Status must be OPEN, IN_PROGRESS, PENDING_CUSTOMER, RESOLVED, or CLOSED' }),
  }),
  notes: z.string().optional(),
});

export const assignTicketSchema = z.object({
  agentId: z.string().uuid('Valid agent UUID is required'),
  reason: z.string().optional(),
});

export const ticketFilterSchema = z.object({
  status: z.nativeEnum(TicketStatus).optional(),
  priority: z.nativeEnum(TicketPriority).optional(),
  category: z.nativeEnum(TicketCategory).optional(),
  needsHumanReview: z
    .enum(['true', 'false'])
    .transform((val) => val === 'true')
    .optional(),
  departmentId: z.string().uuid().optional(),
  assignedAgentId: z.string().uuid().optional(),
  customerId: z.string().uuid().optional(),
  search: z.string().optional(),
  page: z.string().regex(/^\d+$/).transform(Number).optional().default('1'),
  limit: z.string().regex(/^\d+$/).transform(Number).optional().default('20'),
  sortBy: z.enum(['createdAt', 'updatedAt', 'priority', 'status', 'ticketNumber']).optional().default('createdAt'),
  sortOrder: z.enum(['asc', 'desc']).optional().default('desc'),
});

export const ticketIdParamSchema = z.object({
  id: z.string().uuid('Valid ticket UUID is required'),
});

export type CreateTicketInput = z.infer<typeof createTicketSchema>;
export type UpdateTicketInput = z.infer<typeof updateTicketSchema>;
export type UpdateStatusInput = z.infer<typeof updateStatusSchema>;
export type AssignTicketInput = z.infer<typeof assignTicketSchema>;
export type TicketFilterInput = z.infer<typeof ticketFilterSchema>;

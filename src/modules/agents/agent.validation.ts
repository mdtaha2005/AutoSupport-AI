import { z } from 'zod';
import { AvailabilityStatus } from '@prisma/client';

export const updateAgentProfileSchema = z.object({
  departmentId: z.string().uuid().nullable().optional(),
  skills: z.array(z.string().trim().min(1)).optional(),
  maxWorkload: z.number().int().min(1, 'Max workload must be at least 1').max(50).optional(),
});

export const updateAvailabilitySchema = z.object({
  availabilityStatus: z.nativeEnum(AvailabilityStatus, {
    errorMap: () => ({ message: 'Availability status must be AVAILABLE, BUSY, or OFFLINE' }),
  }),
});

export const agentFilterSchema = z.object({
  departmentId: z.string().uuid().optional(),
  availabilityStatus: z.nativeEnum(AvailabilityStatus).optional(),
  skill: z.string().optional(),
  page: z.string().regex(/^\d+$/).transform(Number).optional().default('1'),
  limit: z.string().regex(/^\d+$/).transform(Number).optional().default('20'),
});

export const agentIdParamSchema = z.object({
  id: z.string().uuid('Valid agent UUID is required'),
});

export type UpdateAgentProfileInput = z.infer<typeof updateAgentProfileSchema>;
export type UpdateAvailabilityInput = z.infer<typeof updateAvailabilitySchema>;
export type AgentFilterInput = z.infer<typeof agentFilterSchema>;

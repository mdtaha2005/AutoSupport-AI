import { z } from 'zod';

export const createDepartmentSchema = z.object({
  name: z.string().min(2, 'Department name must be at least 2 characters').trim(),
  description: z.string().optional(),
});

export const updateDepartmentSchema = z.object({
  name: z.string().min(2, 'Department name must be at least 2 characters').trim().optional(),
  description: z.string().optional(),
  isActive: z.boolean().optional(),
});

export const departmentIdParamSchema = z.object({
  id: z.string().uuid('Valid department UUID is required'),
});

export type CreateDepartmentInput = z.infer<typeof createDepartmentSchema>;
export type UpdateDepartmentInput = z.infer<typeof updateDepartmentSchema>;

import { z } from 'zod';

export const createCommentSchema = z.object({
  content: z.string().min(1, 'Comment content cannot be empty').max(5000).trim(),
  isInternal: z.boolean().optional().default(false),
});

export const ticketIdParamSchema = z.object({
  ticketId: z.string().uuid('Valid ticket UUID is required'),
});

export type CreateCommentInput = z.infer<typeof createCommentSchema>;

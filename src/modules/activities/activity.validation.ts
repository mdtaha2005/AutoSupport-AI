import { z } from 'zod';

export const activityTicketParamSchema = z.object({
  ticketId: z.string().uuid('Valid ticket UUID is required'),
});

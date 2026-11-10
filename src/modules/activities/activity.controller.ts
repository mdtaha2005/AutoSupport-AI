import { Response, NextFunction } from 'express';
import { AuthenticatedRequest } from '../../types/index.js';
import { activityService } from './activity.service.js';
import { sendSuccess } from '../../utils/response.js';

export class ActivityController {
  async getActivities(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      const activities = await activityService.getActivities(req.params.ticketId, req.user!);
      sendSuccess(res, activities, 'Ticket activities retrieved successfully');
    } catch (error) {
      next(error);
    }
  }
}

export const activityController = new ActivityController();

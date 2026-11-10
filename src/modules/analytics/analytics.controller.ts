import { Request, Response, NextFunction } from 'express';
import { analyticsService } from './analytics.service.js';
import { sendSuccess } from '../../utils/response.js';

export class AnalyticsController {
  async getOverview(req: Request, res: Response, next: NextFunction) {
    try {
      const filters = {
        startDate: req.query.startDate as string,
        endDate: req.query.endDate as string,
        departmentId: req.query.departmentId as string,
      };
      const data = await analyticsService.getOverview(filters);
      return sendSuccess(res, data, 'Analytics overview retrieved successfully');
    } catch (error) {
      next(error);
    }
  }

  async getTicketVolume(req: Request, res: Response, next: NextFunction) {
    try {
      const filters = {
        startDate: req.query.startDate as string,
        endDate: req.query.endDate as string,
        departmentId: req.query.departmentId as string,
      };
      const interval = (req.query.interval as 'hour' | 'day' | 'week' | 'month') || 'day';
      const data = await analyticsService.getTicketVolume(filters, interval);
      return sendSuccess(res, data, 'Ticket volume time-series retrieved successfully');
    } catch (error) {
      next(error);
    }
  }

  async getCategories(req: Request, res: Response, next: NextFunction) {
    try {
      const filters = {
        startDate: req.query.startDate as string,
        endDate: req.query.endDate as string,
        departmentId: req.query.departmentId as string,
      };
      const data = await analyticsService.getCategoryDistribution(filters);
      return sendSuccess(res, data, 'Category distribution retrieved successfully');
    } catch (error) {
      next(error);
    }
  }

  async getResolutionTime(req: Request, res: Response, next: NextFunction) {
    try {
      const filters = {
        startDate: req.query.startDate as string,
        endDate: req.query.endDate as string,
        departmentId: req.query.departmentId as string,
      };
      const data = await analyticsService.getResolutionTime(filters);
      return sendSuccess(res, data, 'Resolution time metrics retrieved successfully');
    } catch (error) {
      next(error);
    }
  }

  async getAgentWorkload(req: Request, res: Response, next: NextFunction) {
    try {
      const departmentId = req.query.departmentId as string;
      const data = await analyticsService.getAgentWorkload(departmentId);
      return sendSuccess(res, data, 'Agent workload metrics retrieved successfully');
    } catch (error) {
      next(error);
    }
  }

  async getAssignmentDistribution(req: Request, res: Response, next: NextFunction) {
    try {
      const filters = {
        startDate: req.query.startDate as string,
        endDate: req.query.endDate as string,
        departmentId: req.query.departmentId as string,
      };
      const data = await analyticsService.getAssignmentDistribution(filters);
      return sendSuccess(res, data, 'Assignment distribution metrics retrieved successfully');
    } catch (error) {
      next(error);
    }
  }

  async getEscalations(req: Request, res: Response, next: NextFunction) {
    try {
      const filters = {
        startDate: req.query.startDate as string,
        endDate: req.query.endDate as string,
        departmentId: req.query.departmentId as string,
      };
      const data = await analyticsService.getEscalationMetrics(filters);
      return sendSuccess(res, data, 'Escalation metrics retrieved successfully');
    } catch (error) {
      next(error);
    }
  }

  async getStatusDistribution(req: Request, res: Response, next: NextFunction) {
    try {
      const filters = {
        startDate: req.query.startDate as string,
        endDate: req.query.endDate as string,
        departmentId: req.query.departmentId as string,
      };
      const data = await analyticsService.getStatusDistribution(filters);
      return sendSuccess(res, data, 'Status distribution retrieved successfully');
    } catch (error) {
      next(error);
    }
  }
}

export const analyticsController = new AnalyticsController();

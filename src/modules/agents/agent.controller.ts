import { Response, NextFunction } from 'express';
import { AuthenticatedRequest } from '../../types/index.js';
import { agentService } from './agent.service.js';
import { sendSuccess } from '../../utils/response.js';

export class AgentController {
  async listAgents(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      const result = await agentService.listAgents(req.query as never);
      sendSuccess(res, result.data, 'Agents retrieved successfully', 200, result.pagination);
    } catch (error) {
      next(error);
    }
  }

  async getAgentById(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      const agent = await agentService.getAgentById(req.params.id);
      sendSuccess(res, agent, 'Agent profile retrieved successfully');
    } catch (error) {
      next(error);
    }
  }

  async updateProfile(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      const agent = await agentService.updateProfile(req.params.id, req.body, req.user!);
      sendSuccess(res, agent, 'Agent profile updated successfully');
    } catch (error) {
      next(error);
    }
  }

  async updateAvailability(
    req: AuthenticatedRequest,
    res: Response,
    next: NextFunction
  ): Promise<void> {
    try {
      const agent = await agentService.updateAvailability(req.params.id, req.body, req.user!);
      sendSuccess(res, agent, 'Agent availability updated successfully');
    } catch (error) {
      next(error);
    }
  }

  async getWorkload(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      const workload = await agentService.getWorkload(req.params.id);
      sendSuccess(res, workload, 'Agent workload retrieved successfully');
    } catch (error) {
      next(error);
    }
  }
}

export const agentController = new AgentController();

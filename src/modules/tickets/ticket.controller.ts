import { Response, NextFunction } from 'express';
import { AuthenticatedRequest } from '../../types/index.js';
import { ticketService } from './ticket.service.js';
import { sendSuccess } from '../../utils/response.js';
import { nlpClient } from '../nlp/nlp.client.js';

export class TicketController {
  async previewNlp(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      const { title, description } = req.body;
      const preview = await nlpClient.processTicket('preview-run', title || '', description || '');
      sendSuccess(res, preview, 'NLP preview generated successfully');
    } catch (error) {
      next(error);
    }
  }

  async createTicket(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      const ticket = await ticketService.createTicket(req.body, req.user);
      sendSuccess(res, ticket, 'Ticket created successfully', 201);
    } catch (error) {
      next(error);
    }
  }

  async listTickets(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      const result = await ticketService.listTickets(req.query as never, req.user!);
      sendSuccess(res, result.data, 'Tickets retrieved successfully', 200, result.pagination);
    } catch (error) {
      next(error);
    }
  }

  async getTicketById(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      const ticket = await ticketService.getTicketById(req.params.id, req.user!);
      sendSuccess(res, ticket, 'Ticket retrieved successfully');
    } catch (error) {
      next(error);
    }
  }

  async updateTicket(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      const ticket = await ticketService.updateTicket(req.params.id, req.body, req.user!);
      sendSuccess(res, ticket, 'Ticket updated successfully');
    } catch (error) {
      next(error);
    }
  }

  async updateStatus(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      const ticket = await ticketService.updateStatus(req.params.id, req.body, req.user!);
      sendSuccess(res, ticket, 'Ticket status updated successfully');
    } catch (error) {
      next(error);
    }
  }

  async assignTicket(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      const ticket = await ticketService.assignTicket(req.params.id, req.body, req.user!);
      sendSuccess(res, ticket, 'Ticket assigned successfully');
    } catch (error) {
      next(error);
    }
  }

  async analyzeTicket(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      const ticket = await ticketService.analyzeTicket(req.params.id, req.user!);
      sendSuccess(res, ticket, 'Ticket analyzed with NLP successfully');
    } catch (error) {
      next(error);
    }
  }

  async routeTicket(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      const ticket = await ticketService.routeTicket(req.params.id, req.user!);
      sendSuccess(res, ticket, 'Ticket routed and assigned successfully');
    } catch (error) {
      next(error);
    }
  }
}

export const ticketController = new TicketController();

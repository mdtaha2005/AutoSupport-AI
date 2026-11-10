import { Response, NextFunction } from 'express';
import { AuthenticatedRequest } from '../../types/index.js';
import { commentService } from './comment.service.js';
import { sendSuccess } from '../../utils/response.js';

export class CommentController {
  async addComment(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      const comment = await commentService.addComment(req.params.ticketId, req.body, req.user!);
      sendSuccess(res, comment, 'Comment added successfully', 201);
    } catch (error) {
      next(error);
    }
  }

  async getComments(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      const comments = await commentService.getComments(req.params.ticketId, req.user!);
      sendSuccess(res, comments, 'Comments retrieved successfully');
    } catch (error) {
      next(error);
    }
  }
}

export const commentController = new CommentController();

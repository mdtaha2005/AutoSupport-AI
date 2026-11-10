import { Response, NextFunction } from 'express';
import { AuthenticatedRequest } from '../../types/index.js';
import { departmentService } from './department.service.js';
import { sendSuccess } from '../../utils/response.js';

export class DepartmentController {
  async create(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      const department = await departmentService.create(req.body);
      sendSuccess(res, department, 'Department created successfully', 201);
    } catch (error) {
      next(error);
    }
  }

  async findAll(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      const includeInactive = req.query.includeInactive === 'true';
      const departments = await departmentService.findAll(includeInactive);
      sendSuccess(res, departments, 'Departments retrieved successfully');
    } catch (error) {
      next(error);
    }
  }

  async findById(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      const department = await departmentService.findById(req.params.id);
      sendSuccess(res, department, 'Department retrieved successfully');
    } catch (error) {
      next(error);
    }
  }

  async update(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      const department = await departmentService.update(req.params.id, req.body);
      sendSuccess(res, department, 'Department updated successfully');
    } catch (error) {
      next(error);
    }
  }

  async delete(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      const department = await departmentService.delete(req.params.id);
      sendSuccess(res, department, 'Department deactivated successfully');
    } catch (error) {
      next(error);
    }
  }
}

export const departmentController = new DepartmentController();

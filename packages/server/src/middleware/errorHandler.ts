import { Request, Response, NextFunction } from 'express';
import { logger } from '../utils/logger';

export interface AppError extends Error {
  code?: string;
  status?: number;
  details?: any;
}

export const errorHandler = (
  err: AppError,
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  const status = err.status || 500;
  const code = err.code || 'INTERNAL_SERVER_ERROR';
  const message = err.message || 'An unexpected error occurred';
  const requestId = req.id;

  logger.error({
    msg: message,
    code,
    status,
    requestId,
    stack: err.stack,
    details: err.details,
  });

  res.status(status).json({
    error: {
      code,
      message,
      details: err.details,
      requestId,
    },
  });
};

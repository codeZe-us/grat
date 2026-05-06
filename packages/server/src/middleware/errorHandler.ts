import { Request, Response, NextFunction } from 'express';
import { logger } from '../utils/logger';
import { RelayError } from '../utils/errors';

export const errorHandler = (
  err: Error,
  req: Request,
  res: Response,
  _next: NextFunction,
) => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const requestId = (req as any).id;

  if (err instanceof RelayError) {
    err.requestId = requestId;
    
    // Log warning for 4xx, error for 5xx
    const logLevel = err.statusCode >= 500 ? 'error' : 'warn';
    logger[logLevel]({
      msg: err.message,
      code: err.code,
      status: err.statusCode,
      requestId,
      details: err.details,
    });

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    if ((err as any).retryAfter) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      res.setHeader('Retry-After', (err as any).retryAfter.toString());
    }

    return res.status(err.statusCode).json(err.toJSON());
  }

  // Handle unknown errors
  logger.error({
    msg: 'Unhandled internal error',
    error: err.message,
    stack: err.stack,
    requestId,
  });

  res.status(500).json({
    error: {
      code: 'INTERNAL_ERROR',
      message: 'An unexpected internal error occurred',
      requestId,
    },
  });
};

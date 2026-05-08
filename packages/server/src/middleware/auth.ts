import { Request, Response, NextFunction } from 'express';
import { config } from '../config';
import { AuthenticationError, RelayError } from '../utils/errors';

export const adminAuth = (req: Request, res: Response, next: NextFunction) => {
  const authHeader = req.headers.authorization;

  if (!authHeader) {
    throw new AuthenticationError('Authorization header is missing');
  }

  const token = authHeader.startsWith('Bearer ') ? authHeader.substring(7) : authHeader;

  if (token !== config.adminToken) {
    throw new RelayError('Invalid admin token', 'INVALID_ADMIN_TOKEN', 403);
  }

  next();
};

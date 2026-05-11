import crypto from 'crypto';
import { Request, Response, NextFunction } from 'express';
import { config } from '../config';
import { AuthenticationError, RelayError } from '../utils/errors';

export const adminAuth = (req: Request, res: Response, next: NextFunction) => {
  const authHeader = req.headers.authorization;

  if (!authHeader) {
    throw new AuthenticationError('Authorization header is missing');
  }

  const token = authHeader.startsWith('Bearer ') ? authHeader.substring(7) : authHeader;

  const expectedToken = Buffer.from(config.adminToken);
  const actualToken = Buffer.from(token);

  if (
    actualToken.length !== expectedToken.length ||
    !crypto.timingSafeEqual(actualToken, expectedToken)
  ) {
    throw new RelayError('Invalid admin token', 'INVALID_ADMIN_TOKEN', 403);
  }

  next();
};

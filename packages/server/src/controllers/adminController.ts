import { Request, Response, NextFunction } from 'express';
import { circuitBreaker } from '../utils/circuitBreaker';

export const getCircuitBreakerStatus = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const status = await circuitBreaker.getStatus();
    res.json(status);
  } catch (err) {
    next(err);
  }
};

export const resetCircuitBreaker = async (req: Request, res: Response, next: NextFunction) => {
  try {
    await circuitBreaker.reset();
    res.json({ message: 'Circuit breaker reset successfully' });
  } catch (err) {
    next(err);
  }
};

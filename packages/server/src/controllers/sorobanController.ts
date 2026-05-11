import { Request, Response, NextFunction } from 'express';
import { container } from '../container';

const { sponsorshipService } = container;

export const simulateHandler = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { transaction, network } = req.body;

    if (!transaction) {
      return res.status(400).json({
        error: {
          code: 'MISSING_TRANSACTION',
          message: 'transaction is required in request body',
          requestId: req.id,
        },
      });
    }

    const result = await sponsorshipService.simulate({ transaction, network });
    res.json({
      ...result,
      requestId: req.id,
    });
  } catch (err) {
    next(err);
  }
};

export const estimateHandler = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { transaction, network } = req.body;

    if (!transaction) {
      return res.status(400).json({
        error: {
          code: 'MISSING_TRANSACTION',
          message: 'transaction is required in request body',
          requestId: req.id,
        },
      });
    }

    const result = await sponsorshipService.estimate({ transaction, network });
    res.json({
      ...result,
      requestId: req.id,
    });
  } catch (err) {
    next(err);
  }
};

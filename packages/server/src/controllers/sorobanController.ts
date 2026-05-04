import { Request, Response, NextFunction } from 'express';
import { sponsorshipService } from '../modules/sponsorship/SponsorshipService';

export const simulateHandler = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { transaction } = req.body;

    if (!transaction) {
      return res.status(400).json({
        error: {
          code: 'MISSING_TRANSACTION',
          message: 'transaction is required in request body',
          requestId: req.id,
        },
      });
    }

    const result = await sponsorshipService.simulate(transaction);
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
    const { transaction } = req.body;

    if (!transaction) {
      return res.status(400).json({
        error: {
          code: 'MISSING_TRANSACTION',
          message: 'transaction is required in request body',
          requestId: req.id,
        },
      });
    }

    const result = await sponsorshipService.estimate(transaction);
    res.json({
      ...result,
      requestId: req.id,
    });
  } catch (err) {
    next(err);
  }
};

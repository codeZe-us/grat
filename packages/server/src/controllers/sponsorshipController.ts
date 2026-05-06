import { Request, Response, NextFunction } from 'express';
import { sponsorshipService } from '../modules/sponsorship/SponsorshipService';

export const sponsorHandler = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { transaction, network } = req.body;
    const idempotencyKey = req.headers['x-idempotency-key'] as string;

    if (!transaction) {
      return res.status(400).json({
        error: {
          code: 'MISSING_TRANSACTION',
          message: 'transaction is required in request body',
          requestId: req.id as string,
        },
      });
    }


    if (idempotencyKey) {
      const cached = await sponsorshipService.checkIdempotency(idempotencyKey);
      if (cached) {
        return res.json({
          ...cached,
          requestId: req.id as string,
          cached: true,
        });
      }
    }

    const result = await sponsorshipService.sponsor(
      { transaction, network, idempotencyKey },
      req.id as string
    );


    if (idempotencyKey) {
      await sponsorshipService.setIdempotency(idempotencyKey, result);
    }

    res.json({
      ...result,
      requestId: req.id as string,
    });
  } catch (err) {
    next(err);
  }
};

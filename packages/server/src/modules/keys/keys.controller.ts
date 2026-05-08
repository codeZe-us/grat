import { Request, Response, NextFunction } from 'express';
import { keysService } from './keys.service';

export const createKeyHandler = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { email, name, network } = req.body;
    
    if (!email || !name || !network) {
      return res.status(400).json({ error: 'email, name, and network are required' });
    }

    if (network !== 'mainnet' && network !== 'testnet') {
      return res.status(400).json({ error: 'network must be either mainnet or testnet' });
    }

    const result = await keysService.createKey({ email, name, network });
    res.status(201).json(result);
  } catch (err) {
    next(err);
  }
};

export const listKeysHandler = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const email = (req.query.email || req.body.email) as string;
    
    if (!email) {
      return res.status(400).json({ error: 'email is required' });
    }

    const result = await keysService.listKeys(email);
    res.json(result);
  } catch (err) {
    next(err);
  }
};

export const rotateKeyHandler = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { prefix } = req.params;
    
    if (!prefix) {
      return res.status(400).json({ error: 'prefix is required' });
    }

    const result = await keysService.rotateKey(prefix);
    res.json(result);
  } catch (err) {
    next(err);
  }
};

export const revokeKeyHandler = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { prefix } = req.params;
    
    if (!prefix) {
      return res.status(400).json({ error: 'prefix is required' });
    }

    await keysService.revokeKey(prefix);
    res.status(204).send();
  } catch (err) {
    next(err);
  }
};

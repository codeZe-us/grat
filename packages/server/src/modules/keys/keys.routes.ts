import { Router } from 'express';
import { 
  createKeyHandler, 
  listKeysHandler, 
  rotateKeyHandler, 
  revokeKeyHandler 
} from './keys.controller';
import { adminAuth } from '../../middleware/auth';

const router: Router = Router();

router.use(adminAuth);

router.post('/', createKeyHandler);
router.get('/', listKeysHandler);
router.post('/:prefix/rotate', rotateKeyHandler);
router.delete('/:prefix', revokeKeyHandler);

export default router;

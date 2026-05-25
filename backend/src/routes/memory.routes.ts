import { Router } from 'express';
import { authenticate } from '@/middleware/auth';
import MemoryController from '@/controllers/MemoryController';

const router = Router();

router.use(authenticate);

router.get('/me', MemoryController.getMyMemories);
router.delete('/me/:type/:id', MemoryController.deleteMemory);
router.patch('/me/optout', MemoryController.setOptOut);

export default router;

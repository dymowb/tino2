import { Router } from 'express';
import { authenticate, requireAdminRole } from '@/middleware/auth';
import MemoryController from '@/controllers/MemoryController';

const router = Router();

router.use(authenticate);

// User memory CRUD
router.get('/me', MemoryController.getMyMemories);
router.delete('/me/:type/:id', MemoryController.deleteMemory);
router.patch('/me/optout', MemoryController.setOptOut);

// Stats
router.get('/stats/me', MemoryController.getMyStats);
router.get('/stats', requireAdminRole, MemoryController.getSystemStats);

// Eval / recall test (any authenticated user can test their own; admin can specify userId)
router.post('/eval/recall', MemoryController.testRecall);

export default router;

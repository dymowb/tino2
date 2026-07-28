import { Router } from 'express';
import { openApiDocument } from '@/contracts/openapi';

const router = Router();

router.get('/', (_req, res) => {
  res.json(openApiDocument);
});

export default router;

import { Router } from 'express';
import * as controller from './health.controller';

export function healthRoutes(): Router {
  const router = Router();
  router.get('/', controller.getHealth);
  return router;
}

import { asyncHandler } from '../../core/http';
import * as healthService from './health.service';

export const getHealth = asyncHandler(async (_req, res) => {
  const health = await healthService.getHealth();
  res
    .status(health.status === 'ok' ? 200 : 503)
    .set('Cache-Control', 'no-store')
    .json(health);
});

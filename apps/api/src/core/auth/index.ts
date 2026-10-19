export { authenticate, authorize } from './authenticate';
export {
  canAccessAssessment,
  canAccessBatch,
  canAccessEnrollment,
  canAccessSession,
  isOwnStudent,
  owns,
  requireOwnership,
  trainerOwnsBatch,
  trainerTeachesStudent,
  type CurrentUser,
  type OwnershipResult,
  type Resolver,
} from './ownership';
export { burnPasswordCheck, hashPassword, verifyPassword } from './password';
export {
  ACCESS_TOKEN_TTL_SECONDS,
  REFRESH_COOKIE,
  REFRESH_COOKIE_PATH,
  REFRESH_TOKEN_TTL_MS,
  generateRefreshToken,
  hashRefreshToken,
  signAccessToken,
  verifyAccessToken,
} from './tokens';

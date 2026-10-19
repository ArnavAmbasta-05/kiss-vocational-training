import bcrypt from 'bcrypt';
import { config } from '../config';

export function hashPassword(plain: string): Promise<string> {
  return bcrypt.hash(plain, config().BCRYPT_ROUNDS);
}

export function verifyPassword(plain: string, hash: string): Promise<boolean> {
  return bcrypt.compare(plain, hash);
}

let dummyHash: Promise<string> | undefined;

/**
 * Compares against a throwaway hash when the email is unknown, so a login for a missing
 * account takes as long as one for a real account (no user enumeration by timing).
 */
export async function burnPasswordCheck(plain: string): Promise<false> {
  dummyHash ??= bcrypt.hash('timing-equaliser', config().BCRYPT_ROUNDS);
  await bcrypt.compare(plain, await dummyHash);
  return false;
}

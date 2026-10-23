import { randomBytes } from 'node:crypto';

/** Crockford base32: no I, L, O or U, so a code read aloud or typed is hard to get wrong. */
const ALPHABET = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';
export const PUBLIC_CODE_LENGTH = 16;
export const PUBLIC_CODE_PATTERN = /^[0-9A-HJKMNP-TV-Z]{16}$/;

/**
 * Certificate public code (BR-10, BR-19): 80 random bits from the OS CSPRNG, written as 16
 * base32 characters. Never sequential or derived from any record, so codes can't be guessed.
 */
export function publicCode(): string {
  const bytes = randomBytes(10);
  let bits = 0;
  let value = 0;
  let out = '';
  for (const b of bytes) {
    value = (value << 8) | b;
    bits += 8;
    while (bits >= 5) {
      out += ALPHABET[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  return out;
}

import { createHmac, timingSafeEqual } from 'node:crypto';

export interface JwtClaims {
  sub: string;
  role?: string;
  exp?: number;
  [claim: string]: unknown;
}

function base64UrlDecode(value: string): string {
  return Buffer.from(value, 'base64url').toString('utf8');
}

export function verifyJwt(
  token: string,
  secret: string,
  now = Math.floor(Date.now() / 1000),
): JwtClaims {
  const parts = token.split('.');
  if (parts.length !== 3) throw new Error('Invalid JWT format');

  const [encodedHeader, encodedPayload, signature] = parts;
  if (!encodedHeader || !encodedPayload || !signature) throw new Error('Invalid JWT format');
  const header = JSON.parse(base64UrlDecode(encodedHeader)) as { alg?: string; typ?: string };
  if (header.alg !== 'HS256' || header.typ !== 'JWT') throw new Error('Unsupported JWT');

  const expectedSignature = createHmac('sha256', secret)
    .update(`${encodedHeader}.${encodedPayload}`)
    .digest();
  const actualSignature = Buffer.from(signature, 'base64url');
  if (
    actualSignature.length !== expectedSignature.length ||
    !timingSafeEqual(actualSignature, expectedSignature)
  ) {
    throw new Error('Invalid JWT signature');
  }

  const claims = JSON.parse(base64UrlDecode(encodedPayload)) as JwtClaims;
  if (!claims.sub || typeof claims.sub !== 'string') throw new Error('JWT subject is required');
  if (claims.exp !== undefined && (typeof claims.exp !== 'number' || claims.exp <= now)) {
    throw new Error('JWT has expired');
  }

  return claims;
}

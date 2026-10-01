import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';

export interface TokenPayload {
  rid: string;
  role: 'host' | 'viewer';
  pid: string;
  jti: string;
  iat: number;
  exp: number;
}

const encoder = (value: string): string => Buffer.from(value).toString('base64url');
const decoder = (value: string): string => Buffer.from(value, 'base64url').toString('utf8');

export function signToken(payload: TokenPayload, secret: string): string {
  const body = encoder(JSON.stringify(payload));
  const signature = createHmac('sha256', secret).update(body).digest('base64url');
  return `${body}.${signature}`;
}

export function verifyToken(token: string, secret: string, now = Date.now()): TokenPayload | null {
  const [body, signature] = token.split('.');
  if (!body || !signature || !/^[A-Za-z0-9_-]+$/.test(body) || !/^[A-Za-z0-9_-]+$/.test(signature)) {
    return null;
  }

  const expected = createHmac('sha256', secret).update(body).digest();
  const received = Buffer.from(signature, 'base64url');
  if (expected.length !== received.length || !timingSafeEqual(expected, received)) return null;

  try {
    const payload = JSON.parse(decoder(body)) as Partial<TokenPayload>;
    if (
      typeof payload.rid !== 'string' ||
      typeof payload.pid !== 'string' ||
      (payload.role !== 'host' && payload.role !== 'viewer') ||
      typeof payload.jti !== 'string' ||
      typeof payload.iat !== 'number' ||
      typeof payload.exp !== 'number' ||
      payload.exp <= Math.floor(now / 1000) ||
      payload.iat > Math.floor(now / 1000) + 30
    ) return null;
    return payload as TokenPayload;
  } catch {
    return null;
  }
}

export function tokenDigest(token: string): string {
  return createHmac('sha256', 'private-stream-token-index').update(token).digest('hex');
}

export function randomId(prefix: 'room' | 'user' | 'jti'): string {
  // Hex keeps identifiers URL-safe and compatible with the public schema regex.
  return `${prefix}_${randomBytes(prefix === 'room' ? 10 : 12).toString('hex')}`;
}

export function pseudonymousSubject(discordId: string, secret: string): string {
  return `sub_${createHmac('sha256', secret).update(discordId).digest('hex').slice(0, 24)}`;
}

export function turnCredential(username: string, secret: string): string {
  return createHmac('sha1', secret).update(username).digest('base64');
}

export function createTurnUsername(participantId: string, expiresAtSeconds: number): string {
  return `${expiresAtSeconds}:${participantId}`;
}

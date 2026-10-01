import { describe, expect, it } from 'vitest';
import { signToken, verifyToken } from './security.js';

const secret = 'test-secret-that-is-long-enough';

describe('ephemeral access tokens', () => {
  it('accepts a valid token and rejects an expired token', () => {
    const payload = { rid: 'room_test', role: 'viewer' as const, pid: 'user_test', jti: 'jti_test', iat: 100, exp: 200 };
    const token = signToken(payload, secret);
    expect(verifyToken(token, secret, 100_000)).toEqual(payload);
    expect(verifyToken(token, secret, 201_000)).toBeNull();
  });

  it('rejects a token signed with another secret', () => {
    const token = signToken({ rid: 'room_test', role: 'host', pid: 'user_test', jti: 'jti_test', iat: 100, exp: 200 }, secret);
    expect(verifyToken(token, 'another-secret-that-is-long-enough', 100_000)).toBeNull();
  });
});

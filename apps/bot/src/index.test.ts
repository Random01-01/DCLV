import { describe, expect, it } from 'vitest';

describe('bot link policy', () => {
  it('documents that access links carry the token only in the URL fragment', () => {
    const link = 'https://stream.example/room/room_abc/viewer#token=opaque';
    expect(new URL(link).search).toBe('');
    expect(new URL(link).hash).toContain('token=');
  });
});

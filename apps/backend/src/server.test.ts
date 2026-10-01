import { describe, expect, it } from 'vitest';
import { buildServer } from './server.js';
import type { BackendConfig } from './config.js';

const config: BackendConfig = {
  host: '127.0.0.1', port: 3000, hmacSecret: 'a'.repeat(40), internalApiSecret: 'b'.repeat(40),
  publicWebUrl: 'http://localhost:8080', publicTurnHost: 'localhost', turnPort: 3478, turnTlsPort: 5349,
  turnSecret: 'c'.repeat(40), turnCredentialTtlSeconds: 600, roomTtlSeconds: 3600,
  accessTokenTtlSeconds: 600, maxViewers: 8, relayOnly: true, allowedOrigins: [],
};

describe('public session boundary', () => {
  it('does not expose Discord identifiers in the session response', async () => {
    const { app } = buildServer(config);
    const create = await app.inject({
      method: 'POST', url: '/internal/rooms', headers: { authorization: `Bearer ${config.internalApiSecret}` },
      payload: { guildId: 'guild-hidden', hostDiscordId: 'discord-hidden', preset: '1080p60' },
    });
    const body = create.json() as { roomId: string; hostToken: string };
    const session = await app.inject({ method: 'POST', url: `/api/rooms/${body.roomId}/session`, payload: { token: body.hostToken } });
    expect(session.statusCode).toBe(200);
    expect(session.body).not.toContain('discord-hidden');
    expect(session.body).not.toContain('guild-hidden');
    await app.close();
  });
});

import { describe, expect, it } from 'vitest';
import { RoomStore } from './room-store.js';
import type { BackendConfig } from './config.js';

const config: BackendConfig = {
  host: '127.0.0.1', port: 3000, hmacSecret: 'a'.repeat(40), internalApiSecret: 'b'.repeat(40),
  publicWebUrl: 'http://localhost:8080', publicTurnHost: 'localhost', turnPort: 3478, turnTlsPort: 5349,
  turnSecret: 'c'.repeat(40), turnCredentialTtlSeconds: 600, roomTtlSeconds: 3600,
  accessTokenTtlSeconds: 600, maxViewers: 2, relayOnly: true, allowedOrigins: [],
};

describe('RoomStore', () => {
  it('creates one-time viewer credentials and tracks a viewer session', () => {
    const store = new RoomStore(config);
    const created = store.createRoom('guild-private', 'discord-host', '1080p60');
    const viewer = store.createViewerToken('guild-private', 'discord-viewer');
    expect(viewer?.roomId).toBe(created.roomId);
    const consumed = store.consumeAccessToken(created.roomId, viewer!.viewerToken);
    expect(consumed?.role).toBe('viewer');
    expect(store.consumeAccessToken(created.roomId, viewer!.viewerToken)).toBeNull();
    store.createSession(consumed!);
    expect(store.status(created.roomId)?.viewers).toBe(1);
    expect(store.status(created.roomId)?.relayConfigured).toBe(true);
  });
});

import {
  PRESETS,
  createTurnUsername,
  randomId,
  signToken,
  tokenDigest,
  turnCredential,
  verifyToken,
  type IceServerConfig,
  type InternalCreateRoomResponse,
  type InternalViewerTokenResponse,
  type Preset,
  type PublicRoomStatus,
  type RoomRole,
  type SessionResponse,
} from '@private-stream/shared';
import type { BackendConfig } from './config.js';

interface RoomToken {
  role: RoomRole;
  token: string;
  digest: string;
  used: boolean;
  expiresAt: number;
}

interface Room {
  roomId: string;
  guildId: string;
  hostDiscordId: string;
  preset: Preset;
  createdAt: number;
  expiresAt: number;
  active: boolean;
  hostToken: RoomToken;
  tokens: Map<string, RoomToken>;
  viewers: Set<string>;
}

export type ConsumedAccess = { room: Room; role: RoomRole; participantId: string };

export class RoomStore {
  private readonly rooms = new Map<string, Room>();
  private readonly activeByGuild = new Map<string, string>();

  public constructor(private readonly config: BackendConfig) {}

  public createRoom(guildId: string, hostDiscordId: string, preset: Preset): InternalCreateRoomResponse {
    this.endGuildRoom(guildId);
    const now = Date.now();
    const roomId = randomId('room');
    const expiresAt = now + this.config.roomTtlSeconds * 1000;
    const hostAccessExpiresAt = Math.min(expiresAt, now + this.config.accessTokenTtlSeconds * 1000);
    const hostToken = this.makeAccessToken(roomId, 'host', 'user_host', now, hostAccessExpiresAt);
    const room: Room = {
      roomId,
      guildId,
      hostDiscordId,
      preset,
      createdAt: now,
      expiresAt,
      active: true,
      hostToken,
      tokens: new Map([[hostToken.digest, hostToken]]),
      viewers: new Set(),
    };
    this.rooms.set(roomId, room);
    this.activeByGuild.set(guildId, roomId);
    return { roomId, hostToken: hostToken.token, expiresAt: new Date(expiresAt).toISOString(), preset };
  }

  public createViewerToken(guildId: string, viewerDiscordId: string): InternalViewerTokenResponse | null {
    const room = this.getActiveRoomForGuild(guildId);
    if (!room) return null;
    const now = Date.now();
    const expiresAt = Math.min(room.expiresAt, now + this.config.accessTokenTtlSeconds * 1000);
    const participantId = randomId('user');
    // The Discord ID is only used to establish an internal association; no client payload contains it.
    void viewerDiscordId;
    const token = this.makeAccessToken(room.roomId, 'viewer', participantId, now, expiresAt);
    room.tokens.set(token.digest, token);
    return { roomId: room.roomId, viewerToken: token.token, expiresAt: new Date(expiresAt).toISOString() };
  }

  public getActiveRoomForGuild(guildId: string): Room | null {
    const roomId = this.activeByGuild.get(guildId);
    if (!roomId) return null;
    const room = this.rooms.get(roomId);
    if (!room || !room.active || room.expiresAt <= Date.now()) {
      if (room) room.active = false;
      this.activeByGuild.delete(guildId);
      return null;
    }
    return room;
  }

  public getRoom(roomId: string): Room | null {
    const room = this.rooms.get(roomId);
    if (!room || !room.active || room.expiresAt <= Date.now()) return null;
    return room;
  }

  public consumeAccessToken(roomId: string, rawToken: string): ConsumedAccess | null {
    const room = this.getRoom(roomId);
    if (!room) return null;
    const payload = verifyToken(rawToken, this.config.hmacSecret);
    if (!payload || payload.rid !== roomId) return null;
    const stored = room.tokens.get(tokenDigest(rawToken));
    if (!stored || stored.used || stored.expiresAt <= Date.now() || stored.role !== payload.role) return null;
    stored.used = true;
    if (payload.role === 'viewer' && room.viewers.size >= this.config.maxViewers) return null;
    return { room, role: payload.role, participantId: payload.pid };
  }

  public createSession(consumed: ConsumedAccess): SessionResponse {
    const now = Math.floor(Date.now() / 1000);
    const leaseExpires = Math.min(Math.floor(consumed.room.expiresAt / 1000), now + this.config.accessTokenTtlSeconds);
    const leaseToken = signToken(
      { rid: consumed.room.roomId, role: consumed.role, pid: consumed.participantId, jti: randomId('jti'), iat: now, exp: leaseExpires },
      this.config.hmacSecret,
    );
    if (consumed.role === 'viewer') consumed.room.viewers.add(consumed.participantId);
    return {
      roomId: consumed.room.roomId,
      role: consumed.role,
      participantId: consumed.participantId,
      expiresAt: new Date(leaseExpires * 1000).toISOString(),
      preset: consumed.room.preset,
      maxViewers: this.config.maxViewers,
      relayOnly: true,
      iceServers: this.turnServers(consumed.participantId),
      websocketPath: `/ws?ticket=${encodeURIComponent(leaseToken)}`,
    };
  }

  public verifyLease(rawToken: string): { room: Room; role: RoomRole; participantId: string } | null {
    const payload = verifyToken(rawToken, this.config.hmacSecret);
    if (!payload) return null;
    const room = this.getRoom(payload.rid);
    if (!room) return null;
    return { room, role: payload.role, participantId: payload.pid };
  }

  public renewLease(room: Room, role: RoomRole, participantId: string): { token: string; expiresAt: string } {
    const now = Math.floor(Date.now() / 1000);
    const exp = Math.min(Math.floor(room.expiresAt / 1000), now + this.config.accessTokenTtlSeconds);
    return {
      token: signToken({ rid: room.roomId, role, pid: participantId, jti: randomId('jti'), iat: now, exp }, this.config.hmacSecret),
      expiresAt: new Date(exp * 1000).toISOString(),
    };
  }

  public releaseViewer(roomId: string, participantId: string): void {
    this.rooms.get(roomId)?.viewers.delete(participantId);
  }

  public status(roomId: string): PublicRoomStatus | null {
    const room = this.getRoom(roomId);
    if (!room) return null;
    return {
      roomId: room.roomId,
      preset: room.preset,
      target: PRESETS[room.preset],
      viewers: room.viewers.size,
      maxViewers: this.config.maxViewers,
      active: room.active,
      expiresAt: new Date(room.expiresAt).toISOString(),
      relayConfigured: this.config.relayOnly,
    };
  }

  public endRoom(roomId: string): boolean {
    const room = this.rooms.get(roomId);
    if (!room) return false;
    room.active = false;
    this.activeByGuild.delete(room.guildId);
    room.tokens.clear();
    room.viewers.clear();
    return true;
  }

  public endGuildRoom(guildId: string): void {
    const roomId = this.activeByGuild.get(guildId);
    if (roomId) this.endRoom(roomId);
  }

  public cleanup(): void {
    for (const room of this.rooms.values()) {
      if (room.expiresAt <= Date.now()) this.endRoom(room.roomId);
    }
  }

  private makeAccessToken(roomId: string, role: RoomRole, participantId: string, now: number, expiresAt: number): RoomToken {
    const token = signToken(
      {
        rid: roomId,
        role,
        pid: participantId,
        jti: randomId('jti'),
        iat: Math.floor(now / 1000),
        exp: Math.floor(expiresAt / 1000),
      },
      this.config.hmacSecret,
    );
    return { role, token, digest: tokenDigest(token), used: false, expiresAt };
  }

  private turnServers(participantId: string): IceServerConfig[] {
    const expiresAt = Math.floor(Date.now() / 1000) + this.config.turnCredentialTtlSeconds;
    const username = createTurnUsername(participantId, expiresAt);
    const credential = turnCredential(username, this.config.turnSecret);
    return [
      {
        urls: [
          `turn:${this.config.publicTurnHost}:${this.config.turnPort}?transport=udp`,
          `turn:${this.config.publicTurnHost}:${this.config.turnPort}?transport=tcp`,
          `turns:${this.config.publicTurnHost}:${this.config.turnTlsPort}?transport=tcp`,
        ],
        username,
        credential,
      },
    ];
  }
}

import Fastify, { type FastifyInstance, type FastifyRequest } from 'fastify';
import cors from '@fastify/cors';
import websocket from '@fastify/websocket';
import { WebSocket, type RawData } from 'ws';
import {
  assertRelayOnlySdp,
  createRoomSchema,
  createViewerTokenSchema,
  isRelayOnlyCandidate,
  sessionSchema,
  signalSchema,
  type ServerSignalMessage,
  type SignalMessage,
} from '@private-stream/shared';
import type { BackendConfig } from './config.js';
import { RoomStore } from './room-store.js';

interface Client {
  socket: WebSocket;
  roomId: string;
  role: 'host' | 'viewer';
  participantId: string;
  leaseToken: string;
}

interface RoomConnections {
  host?: Client;
  viewers: Map<string, Client>;
}

function authHeader(request: FastifyRequest): string | null {
  const value = request.headers.authorization;
  return value?.startsWith('Bearer ') ? value.slice('Bearer '.length) : null;
}

function isInternal(request: FastifyRequest, config: BackendConfig): boolean {
  const candidate = authHeader(request);
  return Boolean(candidate && candidate.length >= 32 && candidate === config.internalApiSecret);
}

function send(client: Client | undefined, message: ServerSignalMessage): void {
  if (client?.socket.readyState === WebSocket.OPEN) client.socket.send(JSON.stringify(message));
}

function parseMessage(raw: RawData): SignalMessage | null {
  try {
    const result = signalSchema.safeParse(JSON.parse(raw.toString()));
    return result.success ? result.data : null;
  } catch {
    return null;
  }
}

export function buildServer(config: BackendConfig): { app: FastifyInstance; store: RoomStore; closeSockets: (roomId: string) => void } {
  const app = Fastify({ logger: false, bodyLimit: 128 * 1024 });
  const store = new RoomStore(config);
  const connections = new Map<string, RoomConnections>();
  const cleanupTimer = setInterval(() => store.cleanup(), 30_000);
  cleanupTimer.unref();

  const getConnections = (roomId: string): RoomConnections => {
    let value = connections.get(roomId);
    if (!value) {
      value = { viewers: new Map() };
      connections.set(roomId, value);
    }
    return value;
  };

  const closeSockets = (roomId: string): void => {
    const room = connections.get(roomId);
    if (!room) return;
    room.host?.socket.close(1000, 'room-ended');
    for (const viewer of room.viewers.values()) viewer.socket.close(1000, 'room-ended');
    connections.delete(roomId);
  };

  app.register(cors, { origin: config.allowedOrigins, credentials: false });
  app.register(websocket);

  app.get('/healthz', async () => ({ ok: true, service: 'private-stream-backend' }));

  app.post('/internal/rooms', async (request, reply) => {
    if (!isInternal(request, config)) return reply.code(401).send({ error: 'unauthorized' });
    const parsed = createRoomSchema.safeParse(request.body);
    if (!parsed.success) return reply.code(400).send({ error: 'invalid_request' });
    const result = store.createRoom(parsed.data.guildId, parsed.data.hostDiscordId, parsed.data.preset);
    return reply.code(201).send(result);
  });

  app.post('/internal/rooms/:roomId/viewer-token', async (request, reply) => {
    if (!isInternal(request, config)) return reply.code(401).send({ error: 'unauthorized' });
    const params = request.params as { roomId?: string };
    const parsed = createViewerTokenSchema.safeParse(request.body);
    if (!params.roomId || !parsed.success) return reply.code(400).send({ error: 'invalid_request' });
    const room = store.getRoom(params.roomId);
    if (!room) return reply.code(404).send({ error: 'room_not_found' });
    const result = store.createViewerToken(room.guildId, parsed.data.viewerDiscordId);
    return result ? reply.send(result) : reply.code(404).send({ error: 'room_not_found' });
  });

  app.get('/internal/guilds/:guildId/active-room', async (request, reply) => {
    if (!isInternal(request, config)) return reply.code(401).send({ error: 'unauthorized' });
    const params = request.params as { guildId?: string };
    if (!params.guildId) return reply.code(400).send({ error: 'invalid_request' });
    const room = store.getActiveRoomForGuild(params.guildId);
    if (!room) return reply.code(404).send({ error: 'room_not_found' });
    return reply.send({ roomId: room.roomId, preset: room.preset, expiresAt: new Date(room.expiresAt).toISOString() });
  });

  app.get('/internal/rooms/:roomId/status', async (request, reply) => {
    if (!isInternal(request, config)) return reply.code(401).send({ error: 'unauthorized' });
    const params = request.params as { roomId?: string };
    const status = params.roomId ? store.status(params.roomId) : null;
    return status ? reply.send(status) : reply.code(404).send({ error: 'room_not_found' });
  });

  app.post('/internal/rooms/:roomId/end', async (request, reply) => {
    if (!isInternal(request, config)) return reply.code(401).send({ error: 'unauthorized' });
    const params = request.params as { roomId?: string };
    if (!params.roomId || !store.endRoom(params.roomId)) return reply.code(404).send({ error: 'room_not_found' });
    closeSockets(params.roomId);
    return reply.send({ ok: true });
  });

  app.post('/api/rooms/:roomId/session', async (request, reply) => {
    const params = request.params as { roomId?: string };
    const parsed = sessionSchema.safeParse(request.body);
    if (!params.roomId || !parsed.success) return reply.code(400).send({ error: 'invalid_request' });
    const consumed = store.consumeAccessToken(params.roomId, parsed.data.token);
    if (!consumed) return reply.code(401).send({ error: 'invalid_or_expired_token' });
    // The returned object intentionally contains no Discord IDs, IPs, or ICE candidates.
    return reply.send(store.createSession(consumed));
  });

  app.get('/api/rooms/:roomId/status', async (request, reply) => {
    const params = request.params as { roomId?: string };
    const status = params.roomId ? store.status(params.roomId) : null;
    return status ? reply.send(status) : reply.code(404).send({ error: 'room_not_found' });
  });

  app.get('/ws', { websocket: true }, (socket, request) => {
    const query = request.query as { ticket?: string };
    const ticket = typeof query.ticket === 'string' ? query.ticket : '';
    const lease = store.verifyLease(ticket);
    if (!lease || (config.relayOnly !== true && config.relayOnly !== false)) {
      socket.close(1008, 'unauthorized');
      return;
    }

    const client: Client = {
      socket,
      roomId: lease.room.roomId,
      role: lease.role,
      participantId: lease.participantId,
      leaseToken: ticket,
    };
    const room = getConnections(client.roomId);
    if (client.role === 'host') {
      room.host?.socket.close(1000, 'replaced');
      room.host = client;
      send(client, { type: 'host-connected' });
      // A viewer may arrive while the host is still opening the capture page.
      for (const viewer of room.viewers.values()) send(client, { type: 'viewer-joined', viewerId: viewer.participantId });
    } else {
      if (room.viewers.size >= config.maxViewers) {
        socket.close(1013, 'viewer-limit');
        return;
      }
      room.viewers.set(client.participantId, client);
      send(client, { type: 'viewer-assigned', viewerId: client.participantId });
      send(room.host, { type: 'viewer-joined', viewerId: client.participantId });
    }

    socket.on('message', (raw) => {
      const message = parseMessage(raw);
      if (!message) return send(client, { type: 'error', code: 'invalid_message' });
      const current = connections.get(client.roomId);
      if (!current) return;

      if (message.type === 'renew') {
        const renewed = store.renewLease(lease.room, client.role, client.participantId);
        client.leaseToken = renewed.token;
        return send(client, { type: 'renewed', expiresAt: renewed.expiresAt });
      }
      if (message.type === 'host-ready') {
        if (client.role === 'host') send(client, { type: 'host-connected' });
        return;
      }
      if (message.type === 'viewer-join') {
        if (client.role !== 'viewer') return;
        send(client, { type: 'viewer-assigned', viewerId: client.participantId });
        send(current.host, { type: 'viewer-joined', viewerId: client.participantId });
        return;
      }
      if (message.type === 'viewer-left') {
        if (client.role !== 'host') return;
        current.viewers.get(message.viewerId)?.socket.close(1000, 'left');
        return;
      }

      const target = current.viewers.get(message.viewerId);
      if (!target) return send(client, { type: 'error', code: 'viewer_not_found' });
      try {
        if (message.type === 'offer' || message.type === 'answer') assertRelayOnlySdp(message.sdp);
        if (message.type === 'ice-candidate' && !isRelayOnlyCandidate(message.candidate)) {
          return send(client, { type: 'error', code: 'relay_candidate_required' });
        }
      } catch {
        return send(client, { type: 'error', code: 'relay_only_required' });
      }

      if (message.type === 'offer') {
        if (client.role === 'host') send(target, message);
      } else if (message.type === 'answer') {
        if (client.role === 'viewer') send(current.host, message);
      } else if (message.type === 'ice-candidate') {
        if (client.role === 'host') send(target, message);
        else if (client.role === 'viewer') send(current.host, message);
      }
    });

    socket.on('close', () => {
      const current = connections.get(client.roomId);
      if (!current) return;
      if (client.role === 'host' && current.host === client) {
        current.host = undefined;
        for (const viewer of current.viewers.values()) send(viewer, { type: 'error', code: 'host_disconnected' });
      } else if (client.role === 'viewer' && current.viewers.get(client.participantId) === client) {
        current.viewers.delete(client.participantId);
        store.releaseViewer(client.roomId, client.participantId);
        send(current.host, { type: 'viewer-left', viewerId: client.participantId });
      }
      if (!current.host && current.viewers.size === 0) connections.delete(client.roomId);
    });
  });

  app.addHook('onClose', async () => {
    clearInterval(cleanupTimer);
    for (const room of connections.values()) {
      room.host?.socket.close();
      for (const viewer of room.viewers.values()) viewer.socket.close();
    }
    connections.clear();
  });

  return { app, store, closeSockets };
}

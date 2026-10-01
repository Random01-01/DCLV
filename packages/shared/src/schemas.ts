import { z } from 'zod';

export const presetSchema = z.enum(['1080p60', '1080p30', '720p60', '720p30']);

export const createRoomSchema = z.object({
  guildId: z.string().min(1).max(100),
  hostDiscordId: z.string().min(1).max(100),
  preset: presetSchema,
});

export const createViewerTokenSchema = z.object({
  viewerDiscordId: z.string().min(1).max(100),
});

export const sessionSchema = z.object({
  token: z.string().min(32).max(4096),
});

export const signalSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('host-ready') }),
  z.object({ type: z.literal('viewer-join') }),
  z.object({ type: z.literal('viewer-left'), viewerId: z.string().regex(/^user_[a-z0-9]+$/) }),
  z.object({ type: z.literal('offer'), viewerId: z.string().regex(/^user_[a-z0-9]+$/), sdp: z.string().max(100_000) }),
  z.object({ type: z.literal('answer'), viewerId: z.string().regex(/^user_[a-z0-9]+$/), sdp: z.string().max(100_000) }),
  z.object({
    type: z.literal('ice-candidate'),
    viewerId: z.string().regex(/^user_[a-z0-9]+$/),
    candidate: z.string().max(2048),
  }),
  z.object({ type: z.literal('renew') }),
]);

export const internalSecretSchema = z.string().min(32);

import 'dotenv/config';
import type { Preset } from '@private-stream/shared';

function required(name: string): string {
  const value = process.env[name];
  if (!value || value.startsWith('CHANGE_ME')) throw new Error(`Missing secure environment variable: ${name}`);
  return value;
}

function numberEnv(name: string, fallback: number): number {
  const parsed = Number(process.env[name] ?? fallback);
  if (!Number.isFinite(parsed) || parsed <= 0) throw new Error(`Invalid numeric environment variable: ${name}`);
  return parsed;
}

export interface BackendConfig {
  host: string;
  port: number;
  hmacSecret: string;
  internalApiSecret: string;
  publicWebUrl: string;
  publicTurnHost: string;
  turnPort: number;
  turnTlsPort: number;
  turnSecret: string;
  turnCredentialTtlSeconds: number;
  roomTtlSeconds: number;
  accessTokenTtlSeconds: number;
  maxViewers: number;
  relayOnly: boolean;
  allowedOrigins: string[];
}

export function loadConfig(): BackendConfig {
  return {
    host: process.env.BACKEND_HOST ?? '0.0.0.0',
    port: numberEnv('BACKEND_PORT', 3000),
    hmacSecret: required('HMAC_SECRET'),
    internalApiSecret: required('INTERNAL_API_SECRET'),
    publicWebUrl: process.env.PUBLIC_WEB_URL ?? 'http://localhost:8080',
    publicTurnHost: process.env.PUBLIC_TURN_HOST ?? 'localhost',
    turnPort: numberEnv('TURN_PORT', 3478),
    turnTlsPort: numberEnv('TURN_TLS_PORT', 5349),
    turnSecret: required('TURN_SECRET'),
    turnCredentialTtlSeconds: numberEnv('TURN_CREDENTIAL_TTL_SECONDS', 600),
    roomTtlSeconds: numberEnv('ROOM_TTL_SECONDS', 3600),
    accessTokenTtlSeconds: numberEnv('ACCESS_TOKEN_TTL_SECONDS', 600),
    maxViewers: numberEnv('MAX_VIEWERS', 8),
    relayOnly: process.env.ICE_RELAY_ONLY !== 'false',
    allowedOrigins: [process.env.PUBLIC_WEB_URL ?? 'http://localhost:8080', 'http://localhost:5173'],
  };
}

export function isPreset(value: string): value is Preset {
  return ['1080p60', '1080p30', '720p60', '720p30'].includes(value);
}

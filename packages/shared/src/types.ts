export const PRESETS = {
  '1080p60': {
    label: '1080p 60fps',
    width: 1920,
    height: 1080,
    fps: 60,
    maxBitrate: 8_000_000,
  },
  '1080p30': {
    label: '1080p 30fps',
    width: 1920,
    height: 1080,
    fps: 30,
    maxBitrate: 4_500_000,
  },
  '720p60': {
    label: '720p 60fps',
    width: 1280,
    height: 720,
    fps: 60,
    maxBitrate: 3_500_000,
  },
  '720p30': {
    label: '720p 30fps',
    width: 1280,
    height: 720,
    fps: 30,
    maxBitrate: 2_000_000,
  },
} as const;

export type Preset = keyof typeof PRESETS;
export type RoomRole = 'host' | 'viewer';

export interface IceServerConfig {
  urls: string[];
  username?: string;
  credential?: string;
}

export interface PublicRoomStatus {
  roomId: string;
  preset: Preset;
  target: (typeof PRESETS)[Preset];
  viewers: number;
  maxViewers: number;
  active: boolean;
  expiresAt: string;
  relayConfigured: boolean;
}

export interface SessionResponse {
  roomId: string;
  role: RoomRole;
  participantId: string;
  expiresAt: string;
  preset: Preset;
  maxViewers: number;
  relayOnly: true;
  iceServers: IceServerConfig[];
  websocketPath: string;
}

export type SignalMessage =
  | { type: 'host-ready' }
  | { type: 'viewer-join' }
  | { type: 'viewer-left'; viewerId: string }
  | { type: 'offer'; viewerId: string; sdp: string }
  | { type: 'answer'; viewerId: string; sdp: string }
  | { type: 'ice-candidate'; viewerId: string; candidate: string }
  | { type: 'renew' };

export type ServerSignalMessage =
  | { type: 'host-connected' }
  | { type: 'viewer-joined'; viewerId: string }
  | { type: 'viewer-assigned'; viewerId: string }
  | { type: 'viewer-left'; viewerId: string }
  | { type: 'offer'; viewerId: string; sdp: string }
  | { type: 'answer'; viewerId: string; sdp: string }
  | { type: 'ice-candidate'; viewerId: string; candidate: string }
  | { type: 'renewed'; expiresAt: string }
  | { type: 'error'; code: string };

export interface InternalCreateRoomRequest {
  guildId: string;
  hostDiscordId: string;
  preset: Preset;
}

export interface InternalCreateRoomResponse {
  roomId: string;
  hostToken: string;
  expiresAt: string;
  preset: Preset;
}

export interface InternalViewerTokenResponse {
  roomId: string;
  viewerToken: string;
  expiresAt: string;
}

import type {
  InternalCreateRoomResponse,
  InternalViewerTokenResponse,
  Preset,
  PublicRoomStatus,
} from '@private-stream/shared';
import type { BotConfig } from './config.js';

export class BackendClient {
  public constructor(private readonly config: BotConfig) {}

  public async createRoom(guildId: string, hostDiscordId: string, preset: Preset): Promise<InternalCreateRoomResponse> {
    return this.request<InternalCreateRoomResponse>('/internal/rooms', {
      method: 'POST',
      body: JSON.stringify({ guildId, hostDiscordId, preset }),
    });
  }

  public async activeRoom(guildId: string): Promise<{ roomId: string; preset: Preset; expiresAt: string } | null> {
    const response = await fetch(`${this.config.backendUrl}/internal/guilds/${encodeURIComponent(guildId)}/active-room`, {
      headers: this.headers(),
    });
    if (response.status === 404) return null;
    if (!response.ok) throw new Error('backend_active_room_failed');
    return response.json() as Promise<{ roomId: string; preset: Preset; expiresAt: string }>;
  }

  public async createViewerToken(roomId: string, viewerDiscordId: string): Promise<InternalViewerTokenResponse> {
    return this.request<InternalViewerTokenResponse>(`/internal/rooms/${encodeURIComponent(roomId)}/viewer-token`, {
      method: 'POST',
      body: JSON.stringify({ viewerDiscordId }),
    });
  }

  public async endRoom(roomId: string): Promise<void> {
    await this.request(`/internal/rooms/${encodeURIComponent(roomId)}/end`, { method: 'POST' });
  }

  public async status(roomId: string): Promise<PublicRoomStatus> {
    return this.request<PublicRoomStatus>(`/internal/rooms/${encodeURIComponent(roomId)}/status`);
  }

  private headers(): Record<string, string> {
    return { authorization: `Bearer ${this.config.internalApiSecret}`, 'content-type': 'application/json' };
  }

  private async request<T = unknown>(path: string, init: RequestInit = {}): Promise<T> {
    const response = await fetch(`${this.config.backendUrl}${path}`, {
      ...init,
      headers: { ...this.headers(), ...(init.headers ?? {}) },
      signal: AbortSignal.timeout(10_000),
    });
    if (!response.ok) throw new Error(`backend_request_failed_${response.status}`);
    return response.json() as Promise<T>;
  }
}

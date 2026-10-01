import type { SessionResponse } from '@private-stream/shared/browser';

const apiBase = (import.meta.env.VITE_API_BASE_URL as string | undefined) ?? '';

export async function openSession(roomId: string): Promise<SessionResponse> {
  const hash = window.location.hash;
  const token = new URLSearchParams(hash.replace(/^#/, '')).get('token');
  if (!token) throw new Error('missing_token');
  // Remove the credential from the visible URL immediately. It stays only in this JS runtime.
  window.history.replaceState(null, '', window.location.pathname);
  const response = await fetch(`${apiBase}/api/rooms/${encodeURIComponent(roomId)}/session`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ token }),
  });
  if (!response.ok) throw new Error(response.status === 401 ? 'expired_token' : 'session_failed');
  return response.json() as Promise<SessionResponse>;
}

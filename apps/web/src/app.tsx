import { useEffect, useMemo, useState } from 'react';
import type { Preset, SessionResponse } from '@private-stream/shared/browser';
import { openSession } from './api.js';
import { HostRoom } from './host-room.js';
import { ViewerRoom } from './viewer-room.js';

function roomRoute(): { roomId: string; role: 'host' | 'viewer' } | null {
  const match = window.location.pathname.match(/^\/room\/([^/]+)\/(host|viewer)\/?$/);
  return match ? { roomId: decodeURIComponent(match[1]!), role: match[2] as 'host' | 'viewer' } : null;
}

export function App() {
  const route = useMemo(roomRoute, []);
  const [session, setSession] = useState<SessionResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!route) return;
    openSession(route.roomId).then(setSession).catch((reason: unknown) => {
      setError(reason instanceof Error && reason.message === 'expired_token' ? 'Este link expirou ou já foi usado.' : 'Link inválido ou sala encerrada.');
    });
  }, [route]);

  if (!route) return <Landing />;
  if (error) return <Notice title="Acesso não autorizado" body={error} />;
  if (!session) return <div className="loading"><span className="pulse" /> Validando acesso seguro…</div>;
  return route.role === 'host' ? <HostRoom session={session} /> : <ViewerRoom session={session} />;
}

function Landing() {
  return <Notice title="PrivateStream Bridge" body="Abra um link temporário enviado pelo bot do Discord." />;
}

export function Notice({ title, body }: { title: string; body: string }) {
  return <main className="center-page"><div className="notice-card"><div className="brand-mark">PS</div><p className="eyebrow">PRIVATESTREAM BRIDGE</p><h1>{title}</h1><p>{body}</p></div></main>;
}

export function QualitySelect({ value, onChange }: { value: Preset; onChange: (value: Preset) => void }) {
  return <select value={value} onChange={(event) => onChange(event.target.value as Preset)} aria-label="Preset de qualidade">
    <option value="1080p60">1080p 60fps · 8 Mbps</option>
    <option value="1080p30">1080p 30fps · 4,5 Mbps</option>
    <option value="720p60">720p 60fps · 3,5 Mbps</option>
    <option value="720p30">720p 30fps · 2 Mbps</option>
  </select>;
}

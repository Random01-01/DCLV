import { useEffect, useRef, useState, type RefObject } from 'react';
import type { ServerSignalMessage, SessionResponse, SignalMessage } from '@private-stream/shared/browser';
import { collectStats, rtcConfig, websocketUrl, type RuntimeStats } from './webrtc.js';
import { Notice } from './app.js';

const emptyStats: RuntimeStats = { width: 0, height: 0, fps: 0, bitrateKbps: 0, packetLoss: 0, relay: false, connection: 'new' };

export function ViewerRoom({ session }: { session: SessionResponse }) {
  const video = useRef<HTMLVideoElement>(null);
  const [stats, setStats] = useState(emptyStats);
  const [error, setError] = useState<string | null>(null);
  const [controls, setControls] = useState(false);
  const state = useRef<ViewerState>();
  useEffect(() => { state.current = new ViewerState(session, video, setStats, setError); state.current.start(); return () => state.current?.stop(); }, [session]);
  if (error) return <Notice title="Stream indisponível" body={error} />;
  return <main className="viewer-shell" onMouseMove={() => setControls(true)} onMouseLeave={() => setControls(false)}>
    <video ref={video} className="viewer-video" autoPlay playsInline controls={false} onClick={() => setControls((value) => !value)} />
    <div className={`viewer-overlay ${controls ? 'show' : ''}`}><div><span className="brand-mark small">PS</span> <span>PrivateStream Bridge</span></div><div className="viewer-status"><span className="status-dot" /> {stats.relay ? 'Relay TURN ativo' : 'Conectando ao relay…'} {stats.width > 0 && <span className="muted">· {stats.width}×{stats.height} · {Math.round(stats.fps)} fps</span>}</div></div>
  </main>;
}

class ViewerState {
  private socket?: WebSocket;
  private pc?: RTCPeerConnection;
  private viewerId?: string;
  private lastSample?: { bytes: number; time: number };
  private timer?: number;
  public constructor(private readonly session: SessionResponse, private readonly video: RefObject<HTMLVideoElement>, private readonly onStats: (stats: RuntimeStats) => void, private readonly onError: (error: string) => void) {}
  public start(): void {
    this.socket = new WebSocket(websocketUrl(this.session.websocketPath));
    this.socket.onopen = () => this.send({ type: 'viewer-join' });
    this.socket.onmessage = (event) => this.message(JSON.parse(event.data) as ServerSignalMessage);
    this.socket.onerror = () => this.onError('Não foi possível conectar ao relay TURN.');
    this.timer = window.setInterval(() => this.poll(), 1000);
  }
  public stop(): void { if (this.timer) window.clearInterval(this.timer); this.socket?.close(); this.pc?.close(); }
  private async handleOffer(sdp: string): Promise<void> {
    if (!this.pc) {
      this.pc = new RTCPeerConnection(rtcConfig(this.session.iceServers));
      this.pc.ontrack = (event) => { if (this.video.current && event.streams[0]) this.video.current.srcObject = event.streams[0]; };
      this.pc.onicecandidate = (event) => { if (event.candidate && this.viewerId) this.send({ type: 'ice-candidate', viewerId: this.viewerId, candidate: event.candidate.candidate }); };
      this.pc.onconnectionstatechange = () => { if (this.pc?.connectionState === 'failed') this.onError('A conexão relay falhou.'); };
    }
    await this.pc.setRemoteDescription({ type: 'offer', sdp });
    const answer = await this.pc.createAnswer();
    await this.pc.setLocalDescription(answer);
    if (this.viewerId) this.send({ type: 'answer', viewerId: this.viewerId, sdp: answer.sdp ?? '' });
  }
  private message(message: ServerSignalMessage): void {
    if (message.type === 'viewer-assigned') this.viewerId = message.viewerId;
    if (message.type === 'offer') void this.handleOffer(message.sdp);
    if (message.type === 'ice-candidate' && this.pc) void this.pc.addIceCandidate({ candidate: message.candidate });
    if (message.type === 'error') this.onError(message.code === 'host_disconnected' ? 'O host encerrou a transmissão.' : 'A sala não está disponível.');
  }
  private send(message: SignalMessage): void { if (this.socket?.readyState === WebSocket.OPEN) this.socket.send(JSON.stringify(message)); }
  private async poll(): Promise<void> { if (!this.pc) return; const result = await collectStats(this.pc, this.lastSample); this.lastSample = result.sample; this.onStats(result.stats); }
}

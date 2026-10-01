import { useEffect, useRef, useState, type RefObject } from 'react';
import type { ServerSignalMessage, SessionResponse, SignalMessage, Preset } from '@private-stream/shared/browser';
import { PRESETS } from '@private-stream/shared/browser';
import { collectStats, captureConstraints, enforceOpusBitrate, preferHardwareCodecs, rtcConfig, tuneSender, websocketUrl, type RuntimeStats } from './webrtc.js';
import { Notice, QualitySelect } from './app.js';

const initialStats: RuntimeStats = { width: 0, height: 0, fps: 0, bitrateKbps: 0, packetLoss: 0, relay: false, connection: 'new' };

export function HostRoom({ session }: { session: SessionResponse }) {
  const [preset, setPreset] = useState<Preset>(session.preset);
  const [started, setStarted] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [stats, setStats] = useState<RuntimeStats>(initialStats);
  const [showStats, setShowStats] = useState(true);
  const videoRef = useRef<HTMLVideoElement>(null);
  const stateRef = useRef<HostState | null>(null);

  useEffect(() => {
    const state = new HostState(session, videoRef, setStats, setError);
    stateRef.current = state;
    return () => state.stop();
  }, [session, setError]);

  async function start() {
    try {
      await stateRef.current?.start(preset);
      setStarted(true);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Não foi possível iniciar a captura.');
    }
  }

  async function changePreset(next: Preset) {
    setPreset(next);
    try { await stateRef.current?.applyPreset(next); } catch { setError('Não foi possível aplicar o preset.'); }
  }

  if (error) return <Notice title="Transmissão interrompida" body={error} />;
  return <main className="host-shell">
    <header className="topbar">
      <div className="brand"><span className="brand-mark small">PS</span><span>PrivateStream <b>Bridge</b></span></div>
      <div className="top-actions">
        {started && <QualitySelect value={preset} onChange={changePreset} />}
        <button className="ghost-button" onClick={() => setShowStats((value) => !value)}>{showStats ? 'Ocultar métricas' : 'Mostrar métricas'}</button>
      </div>
    </header>
    <section className="host-stage">
      {!started && <div className="start-card"><div className="live-dot" /><p className="eyebrow">SALA PRIVADA · RELAY TURN</p><h1>Pronto para transmitir?</h1><p>O vídeo e o áudio da tela ficarão disponíveis apenas para os links emitidos pelo Discord.</p><button className="primary-button" onClick={start}>Compartilhar tela</button><small>O navegador solicitará permissão para vídeo e áudio do sistema.</small></div>}
      <video ref={videoRef} className={`screen-preview ${started ? 'visible' : ''}`} autoPlay muted playsInline />
      {showStats && started && <StatsPanel stats={stats} preset={preset} />}
    </section>
  </main>;
}

function StatsPanel({ stats, preset }: { stats: RuntimeStats; preset: Preset }) {
  return <aside className="stats-panel">
    <div className="stats-heading"><span className="status-dot" /> AO VIVO <span className="muted">· {PRESETS[preset].label}</span></div>
    <div className="stats-grid"><Stat label="Resolução" value={stats.width ? `${stats.width}×${stats.height}` : '—'} /><Stat label="FPS" value={stats.fps ? `${Math.round(stats.fps)}` : '—'} /><Stat label="Bitrate" value={`${Math.round(stats.bitrateKbps)} kbps`} /><Stat label="Perda" value={`${stats.packetLoss.toFixed(1)}%`} /></div>
    <div className="relay-state"><span className={stats.relay ? 'status-dot' : 'status-dot warning'} /> Relay TURN {stats.relay ? 'ativo' : 'conectando'} <span className="muted">· {stats.connection}</span></div>
  </aside>;
}
function Stat({ label, value }: { label: string; value: string }) { return <div><span>{label}</span><strong>{value}</strong></div>; }

class HostState {
  private socket?: WebSocket;
  private stream?: MediaStream;
  private readonly peers = new Map<string, RTCPeerConnection>();
  private lastSample?: { bytes: number; time: number };
  private statsTimer?: number;
  private currentPreset: Preset;
  public constructor(private readonly session: SessionResponse, private readonly video: RefObject<HTMLVideoElement>, private readonly onStats: (stats: RuntimeStats) => void, private readonly onError: (error: string) => void) { this.currentPreset = session.preset; }

  public async start(preset: Preset): Promise<void> {
    this.currentPreset = preset;
    this.stream = await navigator.mediaDevices.getDisplayMedia(captureConstraints(preset));
    const videoTrack = this.stream.getVideoTracks()[0];
    if (!videoTrack) throw new Error('Nenhuma faixa de vídeo foi compartilhada.');
    videoTrack.contentHint = 'motion';
    videoTrack.addEventListener('ended', () => this.stop());
    if (this.video.current) { this.video.current.srcObject = this.stream; await this.video.current.play(); }
    this.socket = new WebSocket(websocketUrl(this.session.websocketPath));
    this.socket.onopen = () => this.send({ type: 'host-ready' });
    this.socket.onmessage = (event) => this.message(JSON.parse(event.data) as ServerSignalMessage);
    this.socket.onerror = () => this.onError('A sinalização segura não está disponível.');
    this.statsTimer = window.setInterval(() => this.pollStats(), 1000);
  }

  public async applyPreset(preset: Preset): Promise<void> {
    this.currentPreset = preset;
    const videoTrack = this.stream?.getVideoTracks()[0];
    const videoConstraints = captureConstraints(preset).video;
    if (videoTrack && typeof videoConstraints === 'object') await videoTrack.applyConstraints(videoConstraints);
    await Promise.all([...this.peers.values()].flatMap((pc) => pc.getSenders().map((sender) => tuneSender(sender, preset, sender.track?.kind === 'audio'))));
  }

  public stop(): void {
    if (this.statsTimer) window.clearInterval(this.statsTimer);
    this.socket?.close();
    this.stream?.getTracks().forEach((track) => track.stop());
    this.peers.forEach((pc) => pc.close());
    this.peers.clear();
  }

  private async addViewer(viewerId: string): Promise<void> {
    if (!this.stream || this.peers.has(viewerId)) return;
    const pc = new RTCPeerConnection(rtcConfig(this.session.iceServers));
    this.peers.set(viewerId, pc);
    this.stream.getTracks().forEach((track) => pc.addTrack(track, this.stream!));
    pc.getTransceivers().forEach((transceiver) => preferHardwareCodecs(transceiver, transceiver.sender.track?.kind === 'audio' ? 'audio' : 'video'));
    await Promise.all(pc.getSenders().map((sender) => tuneSender(sender, this.currentPreset, sender.track?.kind === 'audio')));
    pc.onicecandidate = (event) => { if (event.candidate) this.send({ type: 'ice-candidate', viewerId, candidate: event.candidate.candidate }); };
    pc.onconnectionstatechange = () => { if (pc.connectionState === 'failed') this.onError('A conexão relay falhou; verifique as portas TURN.'); };
    const offer = await pc.createOffer();
    const tunedOffer = { type: 'offer' as const, sdp: enforceOpusBitrate(offer.sdp ?? '') };
    await pc.setLocalDescription(tunedOffer);
    this.send({ type: 'offer', viewerId, sdp: tunedOffer.sdp });
  }

  private message(message: ServerSignalMessage): void {
    if (message.type === 'viewer-joined') void this.addViewer(message.viewerId);
    if (message.type === 'answer') { const pc = this.peers.get(message.viewerId); if (pc) void pc.setRemoteDescription({ type: 'answer', sdp: message.sdp }); }
    if (message.type === 'ice-candidate') { const pc = this.peers.get(message.viewerId); if (pc) void pc.addIceCandidate({ candidate: message.candidate }); }
    if (message.type === 'viewer-left') { this.peers.get(message.viewerId)?.close(); this.peers.delete(message.viewerId); }
    if (message.type === 'error' && message.code === 'relay_only_required') this.onError('O relay TURN recusou um candidato não seguro.');
  }

  private send(message: SignalMessage): void { if (this.socket?.readyState === WebSocket.OPEN) this.socket.send(JSON.stringify(message)); }
  private async pollStats(): Promise<void> { const first = this.peers.values().next().value as RTCPeerConnection | undefined; if (!first) return; const result = await collectStats(first, this.lastSample); this.lastSample = result.sample; this.onStats(result.stats); }
}

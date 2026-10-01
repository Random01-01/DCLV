import { PRESETS, type IceServerConfig, type Preset } from '@private-stream/shared/browser';

export interface RuntimeStats {
  width: number;
  height: number;
  fps: number;
  bitrateKbps: number;
  packetLoss: number;
  relay: boolean;
  connection: string;
}

export function rtcConfig(iceServers: IceServerConfig[]): RTCConfiguration {
  return {
    // This must stay relay-only: host and srflx candidates can reveal a private/public IP.
    iceTransportPolicy: 'relay',
    iceServers: iceServers as RTCIceServer[],
  };
}

export function captureConstraints(preset: Preset): DisplayMediaStreamOptions {
  const target = PRESETS[preset];
  return {
    video: {
      width: { ideal: target.width, max: target.width },
      height: { ideal: target.height, max: target.height },
      frameRate: { ideal: target.fps, max: target.fps },
    },
    audio: {
      echoCancellation: false,
      noiseSuppression: false,
      autoGainControl: false,
      channelCount: 2,
    },
  };
}

export function preferHardwareCodecs(transceiver: RTCRtpTransceiver, kind: 'audio' | 'video'): void {
  const capabilities = RTCRtpSender.getCapabilities(kind);
  if (!capabilities) return;
  const preferred = capabilities.codecs.filter((codec) => {
    const mime = codec.mimeType.toLowerCase();
    if (kind === 'audio') return mime === 'audio/opus';
    return mime === 'video/h264' || mime === 'video/vp9' || mime === 'video/vp8';
  });
  const priority = kind === 'video' ? ['video/h264', 'video/vp9', 'video/vp8'] : ['audio/opus'];
  preferred.sort((a, b) => {
    const codecPriority = priority.indexOf(a.mimeType.toLowerCase()) - priority.indexOf(b.mimeType.toLowerCase());
    if (codecPriority !== 0) return codecPriority;
    // H.264 Main/High profiles are generally hardware accelerated. Keep them before baseline.
    if (kind === 'video' && a.mimeType.toLowerCase() === 'video/h264') {
      const aHighMain = /(?:4d|64)/i.test(a.sdpFmtpLine ?? '') ? 0 : 1;
      const bHighMain = /(?:4d|64)/i.test(b.sdpFmtpLine ?? '') ? 0 : 1;
      return aHighMain - bHighMain;
    }
    return 0;
  });
  if (preferred.length) transceiver.setCodecPreferences(preferred);
}

/** Adds the negotiated Opus stereo bitrate hint without storing or logging SDP. */
export function enforceOpusBitrate(sdp: string): string {
  const lines = sdp.split('\r\n');
  const opusPayloads = lines
    .filter((line) => /^a=rtpmap:(\d+) opus\/48000/i.test(line))
    .map((line) => line.match(/^a=rtpmap:(\d+)/i)?.[1])
    .filter((payload): payload is string => Boolean(payload));

  for (const payload of opusPayloads) {
    const index = lines.findIndex((line) => line.startsWith(`a=fmtp:${payload} `));
    if (index >= 0) {
      const current = lines[index]!;
      lines[index] = /maxaveragebitrate=/i.test(current)
        ? current.replace(/maxaveragebitrate=\d+/i, 'maxaveragebitrate=128000')
        : `${current};maxaveragebitrate=128000;stereo=1`;
    } else {
      const mediaLine = lines.findIndex((line) => line.startsWith('m=audio '));
      if (mediaLine >= 0) lines.splice(mediaLine + 1, 0, `a=fmtp:${payload} maxaveragebitrate=128000;stereo=1`);
    }
  }
  return lines.join('\r\n');
}

export async function tuneSender(sender: RTCRtpSender, preset: Preset, audio = false): Promise<void> {
  const parameters = sender.getParameters();
  if (!parameters.encodings?.length) parameters.encodings = [{}];
  const encoding = parameters.encodings[0];
  if (!encoding) return;
  parameters.degradationPreference = audio ? undefined : 'maintain-framerate';
  encoding.maxBitrate = audio ? 128_000 : PRESETS[preset].maxBitrate;
  await sender.setParameters(parameters);
}

export async function collectStats(
  pc: RTCPeerConnection,
  previous?: { bytes: number; time: number },
): Promise<{ stats: RuntimeStats; sample: { bytes: number; time: number } }> {
  const report = await pc.getStats();
  let bytes = 0;
  let timestamp = performance.now();
  let width = 0;
  let height = 0;
  let fps = 0;
  let packetsLost = 0;
  let packetsReceived = 0;
  let relay = false;
  let connection = pc.connectionState;
  const candidateTypes = new Map<string, string>();

  // Inspect only candidateType. Never read or display address/port fields.
  report.forEach((raw) => {
    const stat = raw as RTCStats & Record<string, unknown>;
    if ((stat.type === 'local-candidate' || stat.type === 'remote-candidate') && typeof stat.id === 'string') {
      candidateTypes.set(stat.id, String(stat.candidateType ?? ''));
    }
  });

  report.forEach((raw) => {
    const stat = raw as RTCStats & Record<string, unknown>;
    if (stat.type === 'outbound-rtp' && stat.kind === 'video') {
      bytes += Number(stat.bytesSent ?? 0);
      timestamp = Number(stat.timestamp ?? timestamp);
      width = Number(stat.frameWidth ?? width);
      height = Number(stat.frameHeight ?? height);
      fps = Number(stat.framesPerSecond ?? fps);
    }
    if (stat.type === 'inbound-rtp' && stat.kind === 'video') {
      bytes += Number(stat.bytesReceived ?? 0);
      timestamp = Number(stat.timestamp ?? timestamp);
      width = Number(stat.frameWidth ?? width);
      height = Number(stat.frameHeight ?? height);
      fps = Number(stat.framesPerSecond ?? fps);
      packetsLost += Number(stat.packetsLost ?? 0);
      packetsReceived += Number(stat.packetsReceived ?? 0);
    }
    if (stat.type === 'candidate-pair' && stat.state === 'succeeded') {
      connection = typeof stat.nominated === 'boolean' && stat.nominated ? 'connected' : connection;
      relay ||= typeof stat.localCandidateId === 'string' && candidateTypes.get(stat.localCandidateId) === 'relay';
    }
  });

  const elapsed = previous ? Math.max(1, timestamp - previous.time) : 1;
  const bitrateKbps = previous ? ((bytes - previous.bytes) * 8) / elapsed : 0;
  const packetLoss = packetsReceived + packetsLost > 0 ? (packetsLost / (packetsReceived + packetsLost)) * 100 : 0;
  return { stats: { width, height, fps, bitrateKbps, packetLoss, relay, connection }, sample: { bytes, time: timestamp } };
}

export function websocketUrl(path: string): string {
  const url = new URL(path, window.location.href);
  url.protocol = url.protocol === 'https:' ? 'wss:' : 'ws:';
  return url.toString();
}

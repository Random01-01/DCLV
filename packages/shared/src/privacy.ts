/**
 * Only relay candidates are accepted by the signaling layer. This is a defense in depth
 * measure in addition to RTCPeerConnection({ iceTransportPolicy: 'relay' }).
 */
export function isRelayOnlyCandidate(candidate: string): boolean {
  const normalized = candidate.trim().toLowerCase();
  if (!normalized || normalized === 'end-of-candidates') return true;
  return /(?:^|\s)typ\s+relay(?:\s|$)/.test(normalized) && !/(?:^|\s)typ\s+(?:host|srflx|prflx)(?:\s|$)/.test(normalized);
}

export function assertRelayOnlySdp(sdp: string): void {
  const candidateLines = sdp.split(/\r?\n/).filter((line) => line.startsWith('a=candidate:'));
  const invalid = candidateLines.find((line) => !isRelayOnlyCandidate(line.slice(2)));
  if (invalid) throw new Error('SDP contains a non-relay ICE candidate');
}

/** Remove fields that could carry provider-specific or Discord identity data before an API response. */
export function sanitizePublicPayload<T extends Record<string, unknown>>(payload: T): Partial<T> {
  const forbidden = new Set([
    'discordId',
    'hostDiscordId',
    'viewerDiscordId',
    'guildId',
    'discordUserId',
    'ip',
    'address',
    'candidateIp',
  ]);
  return Object.fromEntries(Object.entries(payload).filter(([key]) => !forbidden.has(key))) as Partial<T>;
}

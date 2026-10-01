import { describe, expect, it } from 'vitest';
import { assertRelayOnlySdp, sanitizePublicPayload } from './privacy.js';

describe('relay-only privacy policy', () => {
  it('rejects SDP offers containing host or srflx candidates', () => {
    expect(() => assertRelayOnlySdp('a=candidate:1 1 UDP 1 192.168.0.2 5000 typ host')).toThrow();
    expect(() => assertRelayOnlySdp('a=candidate:2 1 UDP 1 203.0.113.4 5000 typ srflx')).toThrow();
    expect(() => assertRelayOnlySdp('a=candidate:3 1 UDP 1 198.51.100.4 5000 typ relay')).not.toThrow();
  });

  it('removes Discord identity and network fields from public payloads', () => {
    const result = sanitizePublicPayload({ roomId: 'room_test', discordId: 'never-send', guildId: 'private', ip: '10.0.0.1' });
    expect(result).toEqual({ roomId: 'room_test' });
    expect(JSON.stringify(result)).not.toContain('never-send');
  });
});

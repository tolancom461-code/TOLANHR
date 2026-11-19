/** One logical confirmation ID; transport retries keep the same mutation body. */
export function createQrAttemptId(): string {
  const secure = globalThis.crypto;
  if (typeof secure.randomUUID === 'function') return secure.randomUUID();
  // getRandomValues also works on existing LAN HTTP pages without randomUUID.
  const bytes = secure.getRandomValues(new Uint8Array(16));
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = Array.from(bytes, value => value.toString(16).padStart(2, '0')).join('');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

// Browsers only offer crypto.randomUUID on https pages and on localhost. When the
// app is opened by a network address (a tablet on the same Wi-Fi, http://192.168…),
// it is missing, and every screen that makes a request id would crash. This builds
// the same version-4 UUID from crypto.getRandomValues, which is always available.

type RandomSource = { getRandomValues?: (bytes: Uint8Array) => Uint8Array; randomUUID?: () => string };

/** A version-4 UUID from 16 random bytes. */
export function uuidFromBytes(bytes: Uint8Array): string {
  const b = Uint8Array.from(bytes.slice(0, 16));
  b[6] = (b[6] & 0x0f) | 0x40; // version 4
  b[8] = (b[8] & 0x3f) | 0x80; // RFC 4122 variant
  const hex = Array.from(b, (value) => value.toString(16).padStart(2, '0')).join('');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

function randomBytes(source: RandomSource | undefined): Uint8Array {
  const bytes = new Uint8Array(16);
  if (typeof source?.getRandomValues === 'function') return source.getRandomValues(bytes);
  for (let index = 0; index < bytes.length; index += 1) bytes[index] = Math.floor(Math.random() * 256);
  return bytes;
}

/** Adds crypto.randomUUID where the browser leaves it out. Does nothing when it exists. */
export function installRandomUuid(scope: { crypto?: RandomSource } = globalThis as { crypto?: RandomSource }): void {
  if (typeof scope.crypto?.randomUUID === 'function') return;
  const source = scope.crypto;
  const randomUUID = () => uuidFromBytes(randomBytes(source));
  if (source) {
    Object.defineProperty(source, 'randomUUID', { value: randomUUID, configurable: true, writable: true });
  } else {
    Object.defineProperty(scope, 'crypto', { value: { randomUUID }, configurable: true, writable: true });
  }
}

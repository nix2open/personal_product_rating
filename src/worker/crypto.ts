const alphabet = "0123456789abcdefghijklmnopqrstuvwxyz";

export function randomId(len = 21): string {
  const bytes = new Uint8Array(len);
  crypto.getRandomValues(bytes);
  let out = "";
  for (let i = 0; i < len; i++) {
    out += alphabet[bytes[i]! % alphabet.length];
  }
  return out;
}

export async function sha256Hex(input: string): Promise<string> {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(input));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

function bufferToHex(buf: Uint8Array): string {
  return [...buf].map((b) => b.toString(16).padStart(2, "0")).join("");
}

function hexToBuffer(hex: string): Uint8Array {
  const out = new Uint8Array(hex.length / 2);
  for (let i = 0; i < out.length; i++) {
    out[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  }
  return out;
}

const PBKDF2_ITER = 100_000;
const DK_BYTES = 32;

async function pbkdf2Derive(password: string, salt: Uint8Array, iterations: number): Promise<Uint8Array> {
  const enc = new TextEncoder().encode(password);
  const keyMaterial = await crypto.subtle.importKey("raw", enc, "PBKDF2", false, ["deriveBits"]);
  const bits = await crypto.subtle.deriveBits(
    { name: "PBKDF2", salt, iterations, hash: "SHA-256" },
    keyMaterial,
    DK_BYTES * 8,
  );
  return new Uint8Array(bits);
}

/** Format: pbkdf2$<iter>$<saltHex>$<dkHex> */
export async function hashPasswordForStorage(password: string): Promise<string> {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const dk = await pbkdf2Derive(password, salt, PBKDF2_ITER);
  return `pbkdf2$${PBKDF2_ITER}$${bufferToHex(salt)}$${bufferToHex(dk)}`;
}

export async function verifyPassword(password: string, stored: string | null | undefined): Promise<boolean> {
  if (!stored || !stored.startsWith("pbkdf2$")) return false;
  const parts = stored.split("$");
  if (parts.length !== 4 || parts[0] !== "pbkdf2") return false;
  const iter = Number(parts[1]);
  if (!Number.isFinite(iter) || iter < 10_000) return false;
  let salt: Uint8Array;
  let expectedHex: string;
  try {
    salt = hexToBuffer(parts[2]!);
    expectedHex = parts[3]!;
  } catch {
    return false;
  }
  if (expectedHex.length !== DK_BYTES * 2) return false;
  const dk = await pbkdf2Derive(password, salt, iter);
  const actualHex = bufferToHex(dk);
  if (actualHex.length !== expectedHex.length) return false;
  let diff = 0;
  for (let i = 0; i < actualHex.length; i++) {
    diff |= actualHex.charCodeAt(i) ^ expectedHex.charCodeAt(i);
  }
  return diff === 0;
}

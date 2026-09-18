// backend/shared/totp.ts
import crypto from 'crypto';

// RFC 4648 (base32, sem padding) — formato que os aplicativos autenticadores esperam.
const BASE32_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
const TOTP_PERIOD_SECONDS = 30;
const TOTP_DIGITS = 6;

export const base32Encode = (buffer: Buffer): string => {
  let bits = '';
  for (const byte of buffer) bits += byte.toString(2).padStart(8, '0');

  let output = '';
  for (let i = 0; i + 5 <= bits.length; i += 5) {
    output += BASE32_ALPHABET[Number.parseInt(bits.slice(i, i + 5), 2)];
  }

  const remainder = bits.length % 5;
  if (remainder > 0) {
    output += BASE32_ALPHABET[Number.parseInt(bits.slice(bits.length - remainder).padEnd(5, '0'), 2)];
  }

  return output;
};

export const base32Decode = (encoded: string): Buffer => {
  const clean = encoded.toUpperCase().replace(/[^A-Z2-7]/g, '');

  let bits = '';
  for (const char of clean) {
    const value = BASE32_ALPHABET.indexOf(char);
    if (value === -1) continue;
    bits += value.toString(2).padStart(5, '0');
  }

  const bytes: number[] = [];
  for (let i = 0; i + 8 <= bits.length; i += 8) {
    bytes.push(Number.parseInt(bits.slice(i, i + 8), 2));
  }

  return Buffer.from(bytes);
};

/** HOTP (RFC 4226) — TOTP nada mais é do que HOTP com o contador derivado do relógio. */
const hotp = (key: Buffer, counter: number): string => {
  const counterBuffer = Buffer.alloc(8);
  // O contador cabe em 32 bits por décadas — dividir em duas metades evita overflow de bitwise em números de 64 bits.
  counterBuffer.writeUInt32BE(Math.floor(counter / 2 ** 32), 0);
  counterBuffer.writeUInt32BE(counter % 2 ** 32, 4);

  const hmac = crypto.createHmac('sha1', key).update(counterBuffer).digest();
  const offset = hmac[hmac.length - 1] & 0x0f;
  const binary =
    ((hmac[offset] & 0x7f) << 24) |
    ((hmac[offset + 1] & 0xff) << 16) |
    ((hmac[offset + 2] & 0xff) << 8) |
    (hmac[offset + 3] & 0xff);

  return String(binary % 10 ** TOTP_DIGITS).padStart(TOTP_DIGITS, '0');
};

/** Segredo de 160 bits (20 bytes) — o tamanho de chave padrão para HMAC-SHA1 em TOTP. */
export const generateTotpSecret = (): string => base32Encode(crypto.randomBytes(20));

const stepAt = (at: number): number => Math.floor(at / 1000 / TOTP_PERIOD_SECONDS);

export const currentTotp = (secret: string, at: number = Date.now()): string => hotp(base32Decode(secret), stepAt(at));

/**
 * Aceita o código do passo atual e de um passo antes/depois (±30s), tolerando
 * pequena dessincronia entre o relógio do servidor e o do aplicativo autenticador.
 */
export const verifyTotp = (secret: string, code: string, at: number = Date.now()): boolean => {
  const clean = code.trim();
  if (!/^\d{6}$/.test(clean)) return false;

  const key = base32Decode(secret);
  const counter = stepAt(at);
  return [0, -1, 1].some((drift) => hotp(key, counter + drift) === clean);
};

/** URI padrão (`otpauth://`) reconhecido por Google Authenticator, Authy etc. */
export const buildOtpAuthUrl = (secret: string, accountName: string, issuer = 'RailPulse CCO'): string =>
  `otpauth://totp/${encodeURIComponent(issuer)}:${encodeURIComponent(accountName)}` +
  `?secret=${secret}&issuer=${encodeURIComponent(issuer)}&algorithm=SHA1&digits=${TOTP_DIGITS}&period=${TOTP_PERIOD_SECONDS}`;

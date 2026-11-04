import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';

const FORMAT_VERSION = 1;
const NONCE_BYTES = 12;
const TAG_BYTES = 16;
const HEADER_BYTES = 1 + NONCE_BYTES + TAG_BYTES;

/** AES-256-GCM envelope for notification recipients. Keep key material outside source control. */
export class RecipientEmailCipher {
  private readonly key: Buffer;

  constructor(key: Uint8Array) {
    if (key.byteLength !== 32) throw new Error('Notification encryption key must be 32 bytes.');
    this.key = Buffer.from(key);
  }

  encrypt(email: string): Buffer {
    const normalized = email.trim();
    if (!isEmailAddress(normalized)) throw new Error('Recipient email is invalid.');
    const nonce = randomBytes(NONCE_BYTES);
    const cipher = createCipheriv('aes-256-gcm', this.key, nonce);
    const ciphertext = Buffer.concat([cipher.update(normalized, 'utf8'), cipher.final()]);
    return Buffer.concat([Buffer.from([FORMAT_VERSION]), nonce, cipher.getAuthTag(), ciphertext]);
  }

  decrypt(envelope: Uint8Array): string {
    const bytes = Buffer.from(envelope);
    if (bytes.byteLength <= HEADER_BYTES || bytes[0] !== FORMAT_VERSION) {
      throw new Error('Notification recipient ciphertext is invalid.');
    }
    const nonce = bytes.subarray(1, 1 + NONCE_BYTES);
    const tag = bytes.subarray(1 + NONCE_BYTES, HEADER_BYTES);
    const ciphertext = bytes.subarray(HEADER_BYTES);
    try {
      const decipher = createDecipheriv('aes-256-gcm', this.key, nonce);
      decipher.setAuthTag(tag);
      const plaintext = Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString('utf8');
      if (!isEmailAddress(plaintext)) throw new Error('Notification recipient ciphertext is invalid.');
      return plaintext;
    } catch {
      throw new Error('Notification recipient ciphertext is invalid.');
    }
  }
}

function isEmailAddress(value: string): boolean {
  return value.length > 0 && value.length <= 254 && !/[\r\n\s]/.test(value)
    && /^[^@]+@[^@.]+(?:\.[^@.]+)+$/.test(value);
}

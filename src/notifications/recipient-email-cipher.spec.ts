import { RecipientEmailCipher } from './recipient-email-cipher';

describe('RecipientEmailCipher', () => {
  const key = Buffer.from('0123456789abcdef0123456789abcdef', 'utf8');
  const cipher = new RecipientEmailCipher(key);

  it('encrypts a recipient with a fresh nonce and decrypts the test fixture', () => {
    const first = cipher.encrypt('fernando@example.test');
    const second = cipher.encrypt('fernando@example.test');
    expect(first).not.toEqual(second);
    expect(cipher.decrypt(first)).toBe('fernando@example.test');
  });

  it('rejects invalid key lengths and malformed email values', () => {
    expect(() => new RecipientEmailCipher(Buffer.alloc(16))).toThrow(/32 bytes/);
    expect(() => cipher.encrypt('not-an-email')).toThrow(/invalid/);
    expect(() => cipher.encrypt('user@example.test\r\nBcc:other@example.test')).toThrow(/invalid/);
  });

  it('rejects a modified ciphertext or unknown envelope version', () => {
    const encrypted = cipher.encrypt('fernando@example.test');
    encrypted[encrypted.length - 1] ^= 1;
    expect(() => cipher.decrypt(encrypted)).toThrow(/ciphertext is invalid/);
    expect(() => cipher.decrypt(Buffer.concat([Buffer.from([2]), Buffer.alloc(40)]))).toThrow(/ciphertext is invalid/);
  });
});

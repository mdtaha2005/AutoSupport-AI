import { describe, it, expect } from 'vitest';
import { hashPassword, comparePassword } from '../../src/utils/password.js';

describe('Password Utility', () => {
  it('should hash a plaintext password with bcrypt salt', async () => {
    const rawPassword = 'SecurePassword123!';
    const hash = await hashPassword(rawPassword);

    expect(hash).toBeDefined();
    expect(hash).not.toBe(rawPassword);
    expect(hash.startsWith('$2a$') || hash.startsWith('$2b$')).toBe(true);
  });

  it('should generate unique hashes for identical passwords due to salt', async () => {
    const raw = 'IdenticalPassword123!';
    const hash1 = await hashPassword(raw);
    const hash2 = await hashPassword(raw);

    expect(hash1).not.toBe(hash2);
  });

  it('should successfully verify correct password against hash', async () => {
    const password = 'CorrectPassword99#';
    const hash = await hashPassword(password);

    const isMatch = await comparePassword(password, hash);
    expect(isMatch).toBe(true);
  });

  it('should reject incorrect password', async () => {
    const password = 'ValidPassword123!';
    const hash = await hashPassword(password);

    const isMatch = await comparePassword('WrongPassword123!', hash);
    expect(isMatch).toBe(false);
  });
});

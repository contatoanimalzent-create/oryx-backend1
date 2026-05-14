import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const VALID_DB_URL = 'postgresql://user:pass@localhost:5432/db';
const VALID_JWT_SECRET = 'a'.repeat(32);

function setRequired(): void {
  process.env.DATABASE_URL = VALID_DB_URL;
  process.env.REDIS_URL = 'redis://localhost:6379';
  process.env.JWT_ACCESS_SECRET = VALID_JWT_SECRET;
  process.env.JWT_REFRESH_SECRET = VALID_JWT_SECRET + 'b';
}

const exitImpl = ((code?: number): never => {
  throw new Error(`exit:${code ?? 0}`);
}) as never;

describe('loadEnv', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    vi.resetModules();
    process.env = { ...originalEnv };
    setRequired();
  });

  afterEach(() => {
    process.env = originalEnv;
    vi.restoreAllMocks();
  });

  it('applies defaults when optional env vars are missing', async () => {
    delete process.env.NODE_ENV;
    delete process.env.PORT;
    delete process.env.LOG_LEVEL;

    const { loadEnv } = await import('./env');
    const env = loadEnv();

    expect(env.NODE_ENV).toBe('development');
    expect(env.PORT).toBe(3000);
    expect(env.LOG_LEVEL).toBe('info');
    expect(env.DATABASE_URL).toBe(VALID_DB_URL);
    expect(env.JWT_ACCESS_TTL).toBe('15m');
    expect(env.JWT_REFRESH_TTL).toBe('30d');
  });

  it('coerces PORT to number', async () => {
    process.env.PORT = '8080';
    const { loadEnv } = await import('./env');
    expect(loadEnv().PORT).toBe(8080);
  });

  it('exits the process when PORT is invalid', async () => {
    process.env.PORT = 'not-a-number';
    vi.spyOn(process, 'exit').mockImplementation(exitImpl);
    vi.spyOn(console, 'error').mockImplementation(() => undefined);

    const { loadEnv } = await import('./env');
    expect(() => loadEnv()).toThrow(/exit:1/);
  });

  it('exits when DATABASE_URL is missing', async () => {
    delete process.env.DATABASE_URL;
    vi.spyOn(process, 'exit').mockImplementation(exitImpl);
    vi.spyOn(console, 'error').mockImplementation(() => undefined);

    const { loadEnv } = await import('./env');
    expect(() => loadEnv()).toThrow(/exit:1/);
  });

  it('exits when DATABASE_URL is not a postgres scheme', async () => {
    process.env.DATABASE_URL = 'mysql://user:pass@localhost:3306/db';
    vi.spyOn(process, 'exit').mockImplementation(exitImpl);
    vi.spyOn(console, 'error').mockImplementation(() => undefined);

    const { loadEnv } = await import('./env');
    expect(() => loadEnv()).toThrow(/exit:1/);
  });

  it('exits when JWT_ACCESS_SECRET is shorter than 32 chars', async () => {
    process.env.JWT_ACCESS_SECRET = 'too-short';
    vi.spyOn(process, 'exit').mockImplementation(exitImpl);
    vi.spyOn(console, 'error').mockImplementation(() => undefined);

    const { loadEnv } = await import('./env');
    expect(() => loadEnv()).toThrow(/exit:1/);
  });

  it('exits when JWT_REFRESH_SECRET is missing', async () => {
    delete process.env.JWT_REFRESH_SECRET;
    vi.spyOn(process, 'exit').mockImplementation(exitImpl);
    vi.spyOn(console, 'error').mockImplementation(() => undefined);

    const { loadEnv } = await import('./env');
    expect(() => loadEnv()).toThrow(/exit:1/);
  });

  it('exits when REDIS_URL is missing', async () => {
    delete process.env.REDIS_URL;
    vi.spyOn(process, 'exit').mockImplementation(exitImpl);
    vi.spyOn(console, 'error').mockImplementation(() => undefined);

    const { loadEnv } = await import('./env');
    expect(() => loadEnv()).toThrow(/exit:1/);
  });

  it('exits when REDIS_URL uses a non-redis scheme', async () => {
    process.env.REDIS_URL = 'http://localhost:6379';
    vi.spyOn(process, 'exit').mockImplementation(exitImpl);
    vi.spyOn(console, 'error').mockImplementation(() => undefined);

    const { loadEnv } = await import('./env');
    expect(() => loadEnv()).toThrow(/exit:1/);
  });
});

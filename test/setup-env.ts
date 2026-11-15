/** Environment shared by the e2e suites. Imported first, before the app reads its config. */
export function setTestEnv(overrides: Record<string, string> = {}): void {
  Object.assign(process.env, {
    NODE_ENV: 'test',
    LOG_LEVEL: 'silent',
    SHUTDOWN_DELAY_MS: '0',
    REDIS_URL: '',
    RATE_LIMIT_LIMIT: '100000',
    RATE_LIMIT_BURST_LIMIT: '100000',
    RATE_LIMIT_WRITE_LIMIT: '100000',
    ...overrides,
  });
}

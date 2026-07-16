import request from 'supertest';
import pino from 'pino';
import { buildTestApp } from './helpers/build-test-app';
import { rootLogger } from '../src/infrastructure/logging/pino.logger';

/**
 * The request log is the operator's view of the API, so the path it prints has to
 * be the one the client actually called. Express rewrites `req.url` inside a
 * mounted router, which silently turns `/api/auth/register` into `/register`.
 */
describe('Request logging', () => {
  let lines: string[];
  let write: jest.SpyInstance;

  beforeEach(() => {
    lines = [];
    // The suite runs silent by default; pino-http freezes the level into a child
    // logger when the app is built, so this has to be raised *before* that.
    rootLogger.level = 'info';

    // pino exposes its destination stream under a documented symbol; capture what
    // actually gets written rather than re-implementing the formatting.
    const stream = (rootLogger as unknown as Record<symbol, { write: (s: string) => void }>)[
      pino.symbols.streamSym
    ];
    write = jest.spyOn(stream, 'write').mockImplementation((chunk: string) => {
      lines.push(chunk);
    });
  });

  afterEach(() => {
    write.mockRestore();
    rootLogger.level = 'silent';
  });

  it('logs the full request path, not the router-relative one', async () => {
    const { app } = await buildTestApp();

    await request(app)
      .post('/api/auth/register')
      .send({ name: 'Log', email: 'log@example.com', password: 'Password123' });

    // pino-http logs on response finish, which can land just after supertest resolves.
    await new Promise((resolve) => setTimeout(resolve, 50));

    const requestLines = lines.filter((l) => l.includes('"req"'));
    expect(requestLines.length).toBeGreaterThan(0);

    const logged = requestLines.join('\n');
    expect(logged).toContain('/api/auth/register');
    // The router-relative path must not be what got recorded.
    expect(logged).not.toMatch(/"url":"\/register"/);
  });

  it('keeps the request line terse and free of credentials', async () => {
    const { app } = await buildTestApp();

    await request(app)
      .post('/api/auth/login')
      .send({ email: 'nobody@example.com', password: 'SuperSecret123' });
    await new Promise((resolve) => setTimeout(resolve, 50));

    const logged = lines.join('\n');
    // A password must never reach the logs, whatever the request did.
    expect(logged).not.toContain('SuperSecret123');
    // Header dumps are what made the old logs unreadable.
    expect(logged).not.toContain('user-agent');
    expect(logged).not.toContain('accept-encoding');
  });

  it('does not log health probes or Swagger asset requests', async () => {
    const { app } = await buildTestApp();

    await request(app).get('/health');
    await request(app).get('/');
    await new Promise((resolve) => setTimeout(resolve, 50));

    expect(lines.filter((l) => l.includes('"req"'))).toHaveLength(0);
  });
});

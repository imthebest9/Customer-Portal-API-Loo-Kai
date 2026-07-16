import request from 'supertest';
import { Express } from 'express';
import { buildTestApp } from './helpers/build-test-app';

describe('Auth & profile', () => {
  let app: Express;

  beforeEach(async () => {
    ({ app } = await buildTestApp());
  });

  const newUser = {
    name: 'Alice Doe',
    email: 'alice@example.com',
    password: 'Password123',
  };

  it('sends the base URL to the API docs', async () => {
    const res = await request(app).get('/');
    expect(res.status).toBe(302);
    expect(res.headers.location).toBe('/api-docs');
  });

  it('registers a customer and returns a JWT', async () => {
    const res = await request(app).post('/api/auth/register').send(newUser);
    expect(res.status).toBe(201);
    expect(res.body.token).toEqual(expect.any(String));
    expect(res.body.customer.email).toBe('alice@example.com');
    expect(res.body.customer).not.toHaveProperty('passwordHash');
  });

  it('rejects duplicate registration with 409', async () => {
    await request(app).post('/api/auth/register').send(newUser);
    const res = await request(app).post('/api/auth/register').send(newUser);
    expect(res.status).toBe(409);
  });

  it('rejects invalid input with 422', async () => {
    const res = await request(app)
      .post('/api/auth/register')
      .send({ name: '', email: 'not-an-email', password: 'short' });
    expect(res.status).toBe(422);
    expect(res.body.error.details.length).toBeGreaterThan(0);
  });

  it('logs in with correct credentials and rejects wrong ones', async () => {
    await request(app).post('/api/auth/register').send(newUser);

    const ok = await request(app)
      .post('/api/auth/login')
      .send({ email: newUser.email, password: newUser.password });
    expect(ok.status).toBe(200);
    expect(ok.body.token).toEqual(expect.any(String));

    const bad = await request(app)
      .post('/api/auth/login')
      .send({ email: newUser.email, password: 'wrong' });
    expect(bad.status).toBe(401);
  });

  it('requires authentication for profile endpoints', async () => {
    const res = await request(app).get('/api/customers/me');
    expect(res.status).toBe(401);
  });

  it('views and updates the profile, then changes password', async () => {
    const reg = await request(app).post('/api/auth/register').send(newUser);
    const token = reg.body.token as string;
    const auth = { Authorization: `Bearer ${token}` };

    const me = await request(app).get('/api/customers/me').set(auth);
    expect(me.status).toBe(200);
    expect(me.body.name).toBe('Alice Doe');

    const updated = await request(app)
      .patch('/api/customers/me')
      .set(auth)
      .send({ address: '1 Test Street', phone: '+65 1234 5678' });
    expect(updated.status).toBe(200);
    expect(updated.body.address).toBe('1 Test Street');

    const changed = await request(app)
      .patch('/api/customers/me/password')
      .set(auth)
      .send({ currentPassword: newUser.password, newPassword: 'NewPassword123' });
    expect(changed.status).toBe(204);

    // Old password no longer works; new one does.
    const oldLogin = await request(app)
      .post('/api/auth/login')
      .send({ email: newUser.email, password: newUser.password });
    expect(oldLogin.status).toBe(401);

    const newLogin = await request(app)
      .post('/api/auth/login')
      .send({ email: newUser.email, password: 'NewPassword123' });
    expect(newLogin.status).toBe(200);
  });
});

import request from 'supertest';
import { Express } from 'express';
import { buildTestApp, TestContext } from './helpers/build-test-app';

/**
 * Input the API should reject cleanly. The theme: a client error must never be
 * reported as a 500 — that misleads the caller and buries real server faults.
 */
describe('Input validation & error mapping', () => {
  let app: Express;
  let ctx: TestContext;
  let token: string;

  beforeEach(async () => {
    ctx = await buildTestApp();
    app = ctx.app;
    const reg = await request(app)
      .post('/api/auth/register')
      .send({ name: 'Val', email: 'val@example.com', password: 'Password123' });
    token = reg.body.token;
  });

  const auth = () => ({ Authorization: `Bearer ${token}` });

  it('answers malformed JSON with 400, not 500', async () => {
    const res = await request(app)
      .post('/api/auth/login')
      .set('Content-Type', 'application/json')
      .send('{"email": "a@b.com", ');

    expect(res.status).toBe(400);
    expect(res.body.error.name).toBe('BadRequestError');
    expect(res.body.error.message).toMatch(/malformed json/i);
  });

  it('answers a non-object JSON body with 400, not 500', async () => {
    const res = await request(app)
      .post('/api/auth/login')
      .set('Content-Type', 'application/json')
      .send('null');

    expect(res.status).toBe(400);
    expect(res.body.error.name).toBe('BadRequestError');
  });

  it('rejects an oversized body with 413 rather than buffering it', async () => {
    const res = await request(app)
      .post('/api/auth/register')
      .send({ name: 'X'.repeat(200_000), email: 'big@example.com', password: 'Password123' });

    expect(res.status).toBe(413);
    expect(res.body.error.name).toBe('PayloadTooLargeError');
  });

  it('rejects unknown fields instead of silently dropping them', async () => {
    const res = await request(app).post('/api/auth/register').send({
      name: 'Sneaky',
      email: 'sneaky@example.com',
      password: 'Password123',
      role: 'admin', // not a client-settable field
    });

    expect(res.status).toBe(422);
    // The offending key is named, not reported against an empty parent path.
    expect(res.body.error.details).toEqual([
      { field: 'role', message: 'Unrecognized field: role' },
    ]);
  });

  it('rejects a non-numeric quantity', async () => {
    const res = await request(app)
      .post('/api/orders')
      .set(auth())
      .send({ items: [{ productId: ctx.products[0].id, quantity: '2' }] });

    expect(res.status).toBe(422);
    expect(JSON.stringify(res.body.error.details)).toMatch(/quantity must be a number/i);
  });

  it('rejects fractional and out-of-range quantities', async () => {
    const cases = [1.5, 0, -1, 1001];
    for (const quantity of cases) {
      const res = await request(app)
        .post('/api/orders')
        .set(auth())
        .send({ items: [{ productId: ctx.products[0].id, quantity }] });
      expect(res.status).toBe(422);
    }

    // The boundary itself is still allowed.
    const ok = await request(app)
      .post('/api/orders')
      .set(auth())
      .send({ items: [{ productId: ctx.products[0].id, quantity: 1000 }] });
    expect(ok.status).toBe(201);
  });

  it('rejects a non-integer page and an oversized limit', async () => {
    const badPage = await request(app).get('/api/orders?page=abc').set(auth());
    expect(badPage.status).toBe(422);

    const bigLimit = await request(app).get('/api/orders?limit=5000').set(auth());
    expect(bigLimit.status).toBe(422);
  });

  it('rejects an unknown order status with a message naming the valid ones', async () => {
    const admin = await request(app)
      .post('/api/auth/login')
      .send({ email: ctx.admin.email, password: 'Admin123!' });

    const order = await request(app)
      .post('/api/orders')
      .set(auth())
      .send({ items: [{ productId: ctx.products[0].id, quantity: 1 }] });

    const res = await request(app)
      .patch(`/api/admin/orders/${order.body.id}/status`)
      .set({ Authorization: `Bearer ${admin.body.token}` })
      .send({ status: 'Teleported' });

    expect(res.status).toBe(422);
    expect(JSON.stringify(res.body.error.details)).toMatch(/Pending/);
  });
});

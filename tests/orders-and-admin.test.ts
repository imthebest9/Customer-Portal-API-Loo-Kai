import request from 'supertest';
import { buildTestApp, TestContext } from './helpers/build-test-app';

describe('Orders & admin', () => {
  let ctx: TestContext;
  let customerToken: string;
  let adminToken: string;

  beforeEach(async () => {
    ctx = await buildTestApp();

    const reg = await request(ctx.app)
      .post('/api/auth/register')
      .send({ name: 'Bob', email: 'bob@example.com', password: 'Password123' });
    customerToken = reg.body.token;

    const adminLogin = await request(ctx.app)
      .post('/api/auth/login')
      .send({ email: ctx.admin.email, password: 'Admin123!' });
    adminToken = adminLogin.body.token;
  });

  const asCustomer = () => ({ Authorization: `Bearer ${customerToken}` });
  const asAdmin = () => ({ Authorization: `Bearer ${adminToken}` });

  async function placeOrder(): Promise<string> {
    const res = await request(ctx.app)
      .post('/api/orders')
      .set(asCustomer())
      .send({ items: [{ productId: ctx.products[0].id, quantity: 2 }] });
    expect(res.status).toBe(201);
    return res.body.id as string;
  }

  it('places an order with a server-computed total', async () => {
    const res = await request(ctx.app)
      .post('/api/orders')
      .set(asCustomer())
      .send({ items: [{ productId: ctx.products[0].id, quantity: 2 }] });
    expect(res.status).toBe(201);
    expect(res.body.totalAmount).toBe(20); // 2 x $10 Widget
    expect(res.body.status).toBe('Pending');
    expect(res.body.items).toHaveLength(1);
  });

  it('rejects orders that reference unknown products', async () => {
    const res = await request(ctx.app)
      .post('/api/orders')
      .set(asCustomer())
      .send({ items: [{ productId: '00000000-0000-0000-0000-000000000000', quantity: 1 }] });
    expect(res.status).toBe(400);
  });

  it('lists my orders with pagination metadata', async () => {
    await placeOrder();
    const res = await request(ctx.app).get('/api/orders?page=1&limit=10').set(asCustomer());
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ page: 1, limit: 10, total: 1, totalPages: 1 });
    expect(res.body.data).toHaveLength(1);
  });

  it('cancels a pending order but not a shipped one', async () => {
    const orderId = await placeOrder();

    const cancelled = await request(ctx.app)
      .patch(`/api/orders/${orderId}/cancel`)
      .set(asCustomer());
    expect(cancelled.status).toBe(200);
    expect(cancelled.body.status).toBe('Cancelled');

    // Ship a second order via admin, then try to cancel it -> 409.
    const secondId = await placeOrder();
    const shipped = await request(ctx.app)
      .patch(`/api/admin/orders/${secondId}/status`)
      .set(asAdmin())
      .send({ status: 'Shipped' });
    expect(shipped.status).toBe(200);

    const blocked = await request(ctx.app)
      .patch(`/api/orders/${secondId}/cancel`)
      .set(asCustomer());
    expect(blocked.status).toBe(409);
  });

  it('refuses to move an order out of a terminal status', async () => {
    const orderId = await placeOrder();
    await request(ctx.app).patch(`/api/orders/${orderId}/cancel`).set(asCustomer());

    // A cancelled order must never be shippable again.
    const resurrect = await request(ctx.app)
      .patch(`/api/admin/orders/${orderId}/status`)
      .set(asAdmin())
      .send({ status: 'Shipped' });
    expect(resurrect.status).toBe(409);

    const stillCancelled = await request(ctx.app)
      .get(`/api/orders/${orderId}`)
      .set(asCustomer());
    expect(stillCancelled.body.status).toBe('Cancelled');
  });

  it('refuses to walk an order backwards through its lifecycle', async () => {
    const orderId = await placeOrder();
    await request(ctx.app)
      .patch(`/api/admin/orders/${orderId}/status`)
      .set(asAdmin())
      .send({ status: 'Shipped' });

    const backwards = await request(ctx.app)
      .patch(`/api/admin/orders/${orderId}/status`)
      .set(asAdmin())
      .send({ status: 'Pending' });
    expect(backwards.status).toBe(409);

    // …but the legal next step still works.
    const delivered = await request(ctx.app)
      .patch(`/api/admin/orders/${orderId}/status`)
      .set(asAdmin())
      .send({ status: 'Delivered' });
    expect(delivered.status).toBe(200);
    expect(delivered.body.status).toBe('Delivered');
  });

  it('revokes API access as soon as a customer is deactivated', async () => {
    const me = await request(ctx.app).get('/api/customers/me').set(asCustomer());
    const bobId = me.body.id as string;

    // The token below was issued *before* the deactivation and is still unexpired.
    await request(ctx.app).patch(`/api/admin/customers/${bobId}/deactivate`).set(asAdmin());

    const profile = await request(ctx.app).get('/api/customers/me').set(asCustomer());
    expect(profile.status).toBe(401);

    const order = await request(ctx.app)
      .post('/api/orders')
      .set(asCustomer())
      .send({ items: [{ productId: ctx.products[0].id, quantity: 1 }] });
    expect(order.status).toBe(401);
  });

  it('revokes API access as soon as a customer is deleted', async () => {
    const me = await request(ctx.app).get('/api/customers/me').set(asCustomer());
    const bobId = me.body.id as string;

    await request(ctx.app).delete(`/api/admin/customers/${bobId}`).set(asAdmin());

    const profile = await request(ctx.app).get('/api/customers/me').set(asCustomer());
    expect(profile.status).toBe(401);
  });

  it('prevents a customer from accessing another customer order', async () => {
    const orderId = await placeOrder();
    const other = await request(ctx.app)
      .post('/api/auth/register')
      .send({ name: 'Eve', email: 'eve@example.com', password: 'Password123' });
    const res = await request(ctx.app)
      .get(`/api/orders/${orderId}`)
      .set({ Authorization: `Bearer ${other.body.token}` });
    expect(res.status).toBe(403);
  });

  it('enforces ownership on the cached order-status read', async () => {
    const orderId = await placeOrder();

    // First read populates the cache; second is served from it.
    const first = await request(ctx.app).get(`/api/orders/${orderId}/status`).set(asCustomer());
    expect(first.status).toBe(200);
    expect(first.body).toEqual({ status: 'Pending' });

    const second = await request(ctx.app).get(`/api/orders/${orderId}/status`).set(asCustomer());
    expect(second.body).toEqual({ status: 'Pending' });

    // A cache hit must not leak another customer's order status.
    const other = await request(ctx.app)
      .post('/api/auth/register')
      .send({ name: 'Mallory', email: 'mallory@example.com', password: 'Password123' });
    const leaked = await request(ctx.app)
      .get(`/api/orders/${orderId}/status`)
      .set({ Authorization: `Bearer ${other.body.token}` });
    expect(leaked.status).toBe(403);
  });

  it('reflects an admin status change in the cached status read', async () => {
    const orderId = await placeOrder();
    await request(ctx.app).get(`/api/orders/${orderId}/status`).set(asCustomer()); // warm cache

    await request(ctx.app)
      .patch(`/api/admin/orders/${orderId}/status`)
      .set(asAdmin())
      .send({ status: 'Shipped' });

    const after = await request(ctx.app).get(`/api/orders/${orderId}/status`).set(asCustomer());
    expect(after.body).toEqual({ status: 'Shipped' });
  });

  it('enforces role-based authorization on admin routes', async () => {
    const noToken = await request(ctx.app).get('/api/admin/customers');
    expect(noToken.status).toBe(401);

    const asNonAdmin = await request(ctx.app).get('/api/admin/customers').set(asCustomer());
    expect(asNonAdmin.status).toBe(403);

    const asAdminRes = await request(ctx.app).get('/api/admin/customers').set(asAdmin());
    expect(asAdminRes.status).toBe(200);
    expect(asAdminRes.body.data.length).toBeGreaterThanOrEqual(2); // admin + bob
  });

  it('lets an admin deactivate a customer, blocking their login', async () => {
    const bob = await request(ctx.app)
      .post('/api/auth/login')
      .send({ email: 'bob@example.com', password: 'Password123' });
    const bobId = bob.body.customer.id as string;

    const deactivated = await request(ctx.app)
      .patch(`/api/admin/customers/${bobId}/deactivate`)
      .set(asAdmin());
    expect(deactivated.status).toBe(200);
    expect(deactivated.body.isActive).toBe(false);

    const relogin = await request(ctx.app)
      .post('/api/auth/login')
      .send({ email: 'bob@example.com', password: 'Password123' });
    expect(relogin.status).toBe(401);
  });

  it('lets an admin see all orders across customers', async () => {
    await placeOrder();
    const res = await request(ctx.app).get('/api/admin/orders').set(asAdmin());
    expect(res.status).toBe(200);
    expect(res.body.total).toBeGreaterThanOrEqual(1);
  });
});

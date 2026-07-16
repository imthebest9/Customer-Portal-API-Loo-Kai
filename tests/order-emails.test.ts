import request from 'supertest';
import { buildTestApp, TestContext } from './helpers/build-test-app';

/**
 * Order notifications, asserted against the real service stack with only the
 * SMTP transport swapped for a recorder.
 */
describe('Order notification emails', () => {
  let ctx: TestContext;
  let customerToken: string;
  let adminToken: string;

  beforeEach(async () => {
    ctx = await buildTestApp();

    const reg = await request(ctx.app)
      .post('/api/auth/register')
      .send({ name: 'Ada Lovelace', email: 'ada@example.com', password: 'Password123' });
    customerToken = reg.body.token;

    const adminLogin = await request(ctx.app)
      .post('/api/auth/login')
      .send({ email: ctx.admin.email, password: 'Admin123!' });
    adminToken = adminLogin.body.token;
  });

  const asCustomer = () => ({ Authorization: `Bearer ${customerToken}` });
  const asAdmin = () => ({ Authorization: `Bearer ${adminToken}` });

  /** Widget @ $10 x2 and Gadget @ $20.50 x1 => $40.50. */
  async function placeOrder(): Promise<string> {
    const res = await request(ctx.app)
      .post('/api/orders')
      .set(asCustomer())
      .send({
        items: [
          { productId: ctx.products[0].id, quantity: 2 },
          { productId: ctx.products[1].id, quantity: 1 },
        ],
      });
    expect(res.status).toBe(201);
    return res.body.id as string;
  }

  const setStatus = (orderId: string, status: string) =>
    request(ctx.app).patch(`/api/admin/orders/${orderId}/status`).set(asAdmin()).send({ status });

  it('emails the customer when an order is placed', async () => {
    await placeOrder();

    expect(ctx.emails.sent).toHaveLength(1);
    expect(ctx.emails.last).toMatchObject({
      to: 'ada@example.com',
      subject: expect.stringMatching(/confirmed/i),
    });
    expect(ctx.emails.last?.html).toContain('Thanks for your order, Ada Lovelace!');
  });

  it('emails the customer when an order ships', async () => {
    const orderId = await placeOrder();
    ctx.emails.clear();

    expect((await setStatus(orderId, 'Shipped')).status).toBe(200);

    expect(ctx.emails.sent).toHaveLength(1);
    expect(ctx.emails.last?.subject).toMatch(/has shipped/i);
  });

  it('emails the customer when an order is delivered', async () => {
    const orderId = await placeOrder();
    await setStatus(orderId, 'Shipped');
    ctx.emails.clear();

    expect((await setStatus(orderId, 'Delivered')).status).toBe(200);

    expect(ctx.emails.sent).toHaveLength(1);
    expect(ctx.emails.last?.subject).toMatch(/has been delivered/i);
    expect(ctx.emails.last?.html).toContain('Your order has arrived, Ada Lovelace!');
  });

  it('emails the customer when an admin cancels an order', async () => {
    const orderId = await placeOrder();
    ctx.emails.clear();

    expect((await setStatus(orderId, 'Cancelled')).status).toBe(200);

    expect(ctx.emails.sent).toHaveLength(1);
    expect(ctx.emails.last?.subject).toMatch(/has been cancelled/i);
  });

  it('emails the customer when they cancel the order themselves', async () => {
    const orderId = await placeOrder();
    ctx.emails.clear();

    const res = await request(ctx.app).patch(`/api/orders/${orderId}/cancel`).set(asCustomer());
    expect(res.status).toBe(200);

    // The customer asked for it, but the confirmation is still their receipt —
    // and the same message an admin-initiated cancel would send.
    expect(ctx.emails.sent).toHaveLength(1);
    expect(ctx.emails.last?.subject).toMatch(/has been cancelled/i);
  });

  it('sends nothing for a status change with no news worth mailing', async () => {
    const orderId = await placeOrder();
    await setStatus(orderId, 'Shipped');
    ctx.emails.clear();

    // An illegal transition is refused, so nothing should be announced.
    expect((await setStatus(orderId, 'Pending')).status).toBe(409);
    expect(ctx.emails.sent).toHaveLength(0);
  });

  it('shows the unit price of every item, in both HTML and plain text', async () => {
    const orderId = await placeOrder();

    for (const status of ['Shipped', 'Delivered']) {
      // Every notification carries the same itemisation, not just the first.
      await setStatus(orderId, status);
    }

    expect(ctx.emails.sent).toHaveLength(3); // placed + shipped + delivered
    for (const mail of ctx.emails.sent) {
      // Unit price, quantity and line amount are distinct numbers: $10.00 each,
      // x2, = $20.00. A line total alone wouldn't tell the customer the rate.
      expect(mail.html).toContain('Unit price');
      expect(mail.html).toContain('$10.00'); // Widget unit price
      expect(mail.html).toContain('$20.50'); // Gadget unit price
      expect(mail.html).toContain('$20.00'); // Widget line amount (2 x $10)
      expect(mail.html).toContain('$40.50'); // order total

      expect(mail.text).toContain('Widget — $10.00 each x 2 = $20.00');
      expect(mail.text).toContain('Gadget — $20.50 each x 1 = $20.50');
      expect(mail.text).toContain('Total: $40.50');
    }
  });

  it('never leaves raw HTML tags in the plain-text part', async () => {
    const orderId = await placeOrder();
    await setStatus(orderId, 'Shipped');

    for (const mail of ctx.emails.sent) {
      expect(mail.text).not.toMatch(/<[a-z/][^>]*>/i);
      expect(mail.text?.length).toBeGreaterThan(0);
    }
  });

  it('escapes a customer name that looks like markup', async () => {
    const reg = await request(ctx.app)
      .post('/api/auth/register')
      .send({ name: '<script>alert(1)</script>', email: 'xss@example.com', password: 'Password123' });

    await request(ctx.app)
      .post('/api/orders')
      .set({ Authorization: `Bearer ${reg.body.token}` })
      .send({ items: [{ productId: ctx.products[0].id, quantity: 1 }] });

    const mail = ctx.emails.last;
    expect(mail?.html).not.toContain('<script>');
    expect(mail?.html).toContain('&lt;script&gt;');
  });

  it('does not fail the order when sending the email throws', async () => {
    jest.spyOn(ctx.emails, 'send').mockRejectedValueOnce(new Error('SMTP is down'));

    const res = await request(ctx.app)
      .post('/api/orders')
      .set(asCustomer())
      .send({ items: [{ productId: ctx.products[0].id, quantity: 1 }] });

    // A dead mail server must never cost the customer their order.
    expect(res.status).toBe(201);
  });
});

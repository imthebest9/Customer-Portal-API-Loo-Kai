import { Order } from '../../domain/entities/models';
import { EmailMessage } from '../ports/email.port';

/**
 * Order notification templates.
 *
 * Pure functions: domain data in, an {@link EmailMessage} out. They live in the
 * application layer rather than the Nodemailer adapter because *what* a customer
 * is told is a use-case concern, while *how* it's delivered is infrastructure —
 * the adapter stays a dumb transport and these stay testable with no SMTP.
 *
 * Every message carries both `text` and `html`. Clients that refuse HTML (and
 * some corporate gateways) fall back to the text part, so it has to stand alone
 * rather than say "view this in a browser".
 */

const BRAND = 'Customer Portal';

/** Renders money the way a customer expects to see it, not the way JS prints it. */
function money(amount: number): string {
  return `$${amount.toFixed(2)}`;
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/** Short id for display — a full UUID is unreadable in a subject line. */
function shortId(id: string): string {
  return id.split('-')[0].toUpperCase();
}

const CELL = 'padding:8px 0;border-bottom:1px solid #eaeaea;';
const HEAD =
  'padding:0 0 8px;border-bottom:2px solid #1f2933;font-size:12px;text-transform:uppercase;color:#7b8794;';

/**
 * The itemised table, shared by every notification: what was bought, what each
 * one cost, how many, and the line amount. Unit price gets its own column rather
 * than being folded into the line total — "$90.00" for two hubs doesn't tell the
 * customer whether they were charged $45 each, which is the number they'd query.
 */
function itemsTableHtml(order: Order): string {
  const rows = order.items
    .map(
      (item) => `
        <tr>
          <td style="${CELL}">${escapeHtml(item.productName)}</td>
          <td style="${CELL}text-align:right;">${money(item.unitPrice)}</td>
          <td style="${CELL}text-align:center;">${item.quantity}</td>
          <td style="${CELL}text-align:right;">${money(item.unitPrice * item.quantity)}</td>
        </tr>`,
    )
    .join('');

  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;font-size:14px;">
       <tr>
         <th align="left" style="${HEAD}">Item</th>
         <th align="right" style="${HEAD}">Unit price</th>
         <th align="center" style="${HEAD}">Qty</th>
         <th align="right" style="${HEAD}">Amount</th>
       </tr>
       ${rows}
       <tr>
         <td style="padding:12px 0 0;font-weight:600;">Total</td>
         <td></td>
         <td></td>
         <td style="padding:12px 0 0;text-align:right;font-weight:600;font-size:16px;">${money(order.totalAmount)}</td>
       </tr>
     </table>`;
}

/** Plain-text twin of {@link itemsTableHtml}, for clients that refuse HTML. */
function itemLinesText(order: Order): string {
  const lines = order.items.map(
    (i) =>
      `  - ${i.productName} — ${money(i.unitPrice)} each x ${i.quantity} = ${money(i.unitPrice * i.quantity)}`,
  );
  return [...lines, '', `  Total: ${money(order.totalAmount)}`].join('\n');
}

/**
 * Wraps body content in the shared shell. Inline styles and a table-based layout
 * on purpose: email clients strip <style> blocks and have patchy flexbox support.
 */
function layout(heading: string, bodyHtml: string): string {
  return `<!doctype html>
<html>
  <body style="margin:0;padding:24px;background:#f4f5f7;font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;color:#1f2933;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;margin:0 auto;background:#ffffff;border-radius:8px;overflow:hidden;">
      <tr>
        <td style="background:#1f2933;padding:20px 28px;">
          <span style="color:#ffffff;font-size:18px;font-weight:600;letter-spacing:0.3px;">${BRAND}</span>
        </td>
      </tr>
      <tr>
        <td style="padding:28px;">
          <h1 style="margin:0 0 16px;font-size:20px;font-weight:600;">${heading}</h1>
          ${bodyHtml}
        </td>
      </tr>
      <tr>
        <td style="padding:18px 28px;background:#fafbfc;border-top:1px solid #eaeaea;color:#7b8794;font-size:12px;line-height:1.5;">
          You're receiving this because you placed an order with ${BRAND}.<br />
          This is an automated message — replies aren't monitored.<br />
          <span style="color:#9aa5b1;">&copy; ${new Date().getFullYear()} ${BRAND}</span>
        </td>
      </tr>
    </table>
  </body>
</html>`;
}

/**
 * Assembles a notification from the parts each status varies: the subject line,
 * the heading, and the opening sentence. Everything below that — the itemised
 * table, the reference, the footer — is identical across all four.
 */
function orderEmail(
  to: string,
  order: Order,
  parts: { subject: string; heading: string; intro: string },
): EmailMessage {
  const ref = shortId(order.id);

  const html = layout(
    parts.heading,
    `<p style="margin:0 0 20px;line-height:1.6;">${parts.intro}</p>
     ${itemsTableHtml(order)}
     <p style="margin:24px 0 0;color:#7b8794;font-size:13px;">Order reference <strong style="color:#1f2933;">#${ref}</strong></p>`,
  );

  const text = [
    parts.heading,
    '',
    // The intro is written as HTML; strip the tags for the plain-text twin.
    parts.intro.replace(/<[^>]+>/g, ''),
    '',
    itemLinesText(order),
    '',
    `Order reference: #${ref}`,
    '',
    `— The ${BRAND} team`,
    "This is an automated message — replies aren't monitored.",
  ].join('\n');

  return { to, subject: parts.subject, text, html };
}

export function orderPlacedEmail(customerName: string, to: string, order: Order): EmailMessage {
  const ref = shortId(order.id);
  return orderEmail(to, order, {
    subject: `Order #${ref} confirmed — thanks for your order!`,
    heading: `Thanks for your order, ${escapeHtml(customerName)}!`,
    intro: `We've received your order and it's now <strong>${order.status}</strong>. We'll email you again as soon as it ships.`,
  });
}

export function orderShippedEmail(customerName: string, to: string, order: Order): EmailMessage {
  const ref = shortId(order.id);
  return orderEmail(to, order, {
    subject: `Your order #${ref} has shipped!`,
    heading: `Your order is on its way, ${escapeHtml(customerName)}!`,
    intro: `Good news — order <strong>#${ref}</strong> has shipped and is heading to you now.`,
  });
}

export function orderDeliveredEmail(customerName: string, to: string, order: Order): EmailMessage {
  const ref = shortId(order.id);
  return orderEmail(to, order, {
    subject: `Your order #${ref} has been delivered`,
    heading: `Your order has arrived, ${escapeHtml(customerName)}!`,
    intro: `Order <strong>#${ref}</strong> has been delivered. We hope everything's as you expected — here's what was in it, for your records.`,
  });
}

export function orderCancelledEmail(customerName: string, to: string, order: Order): EmailMessage {
  const ref = shortId(order.id);
  return orderEmail(to, order, {
    // No "thanks" and no exclamation mark: this one may be unwelcome news, and it
    // doubles as the customer's signal if someone *else* cancelled their order.
    subject: `Your order #${ref} has been cancelled`,
    heading: `Order #${ref} has been cancelled`,
    intro: `Hi ${escapeHtml(customerName)}, order <strong>#${ref}</strong> has been cancelled and won't be shipped. Nothing further is owed. If you weren't expecting this, please get in touch.`,
  });
}

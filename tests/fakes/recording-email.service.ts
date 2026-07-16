import { EmailMessage, IEmailService } from '../../src/application/ports/email.port';

/**
 * Captures what the app tried to send instead of sending it. Registered through
 * the same DI token as the real Nodemailer adapter, so the services under test
 * are the production ones — only the transport changes.
 */
export class RecordingEmailService implements IEmailService {
  readonly sent: EmailMessage[] = [];

  async send(message: EmailMessage): Promise<void> {
    this.sent.push(message);
  }

  /** The most recent message, or undefined if nothing was sent. */
  get last(): EmailMessage | undefined {
    return this.sent[this.sent.length - 1];
  }

  bySubject(pattern: RegExp): EmailMessage[] {
    return this.sent.filter((m) => pattern.test(m.subject));
  }

  clear(): void {
    this.sent.length = 0;
  }
}

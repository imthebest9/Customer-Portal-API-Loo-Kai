import nodemailer, { Transporter } from 'nodemailer';
import { EmailMessage, IEmailService } from '../../application/ports/email.port';
import { ILogger } from '../../application/ports/logger.port';
import type { AppConfig } from '../config/env';

/**
 * Email sender (bonus feature). With EMAIL_DRIVER=console (default) it logs the
 * message instead of sending — so local dev needs no SMTP server. With
 * EMAIL_DRIVER=smtp it delivers via the configured SMTP transport.
 */
export class NodemailerEmailService implements IEmailService {
  private readonly transporter: Transporter | null;

  constructor(
    private readonly config: AppConfig,
    private readonly logger: ILogger,
  ) {
    this.transporter =
      config.EMAIL_DRIVER === 'smtp'
        ? nodemailer.createTransport({
            host: config.SMTP_HOST,
            port: config.SMTP_PORT,
            secure: config.SMTP_SECURE,
            auth:
              config.SMTP_USER || config.SMTP_PASSWORD
                ? { user: config.SMTP_USER, pass: config.SMTP_PASSWORD }
                : undefined,
          })
        : null;
  }

  async send(message: EmailMessage): Promise<void> {
    if (!this.transporter) {
      // Console driver: record intent without sending.
      this.logger.info(
        { to: message.to, subject: message.subject, driver: 'console' },
        'Email (not sent — console driver)',
      );
      return;
    }

    await this.transporter.sendMail({
      from: this.config.EMAIL_FROM,
      to: message.to,
      subject: message.subject,
      text: message.text,
      html: message.html,
    });
    this.logger.info({ to: message.to, subject: message.subject }, 'Email sent');
  }
}

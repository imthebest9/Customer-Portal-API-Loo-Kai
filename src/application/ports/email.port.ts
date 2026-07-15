export interface EmailMessage {
  to: string;
  subject: string;
  text: string;
  html?: string;
}

export interface IEmailService {
  send(message: EmailMessage): Promise<void>;
}

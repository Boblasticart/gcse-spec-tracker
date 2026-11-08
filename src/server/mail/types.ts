export interface MailMessage {
  to: string;
  subject: string;
  text: string;
  html: string;
  /** Machine-readable tag for tests and logs, e.g. "otp" or "account-exists". */
  kind: string;
  /** The OTP code, kept only by the file and memory transports so tests can read it. */
  code?: string;
}

export interface MailTransport {
  send(message: MailMessage): Promise<void>;
}

import "server-only";

import { getEnv } from "../env";
import { fileTransport, gmailTransport, memoryTransport } from "./transports";
import type { MailMessage, MailTransport } from "./types";

export type { MailMessage, MailTransport } from "./types";
export { accountExistsEmail, otpEmail } from "./templates";

let transport: MailTransport | undefined;

function getTransport(): MailTransport {
  if (transport) return transport;
  const env = getEnv();
  switch (env.MAIL_TRANSPORT) {
    case "file":
      transport = fileTransport(env.MAIL_DIR);
      break;
    case "memory":
      transport = memoryTransport();
      break;
    case "gmail":
      transport = gmailTransport(env.GMAIL_USER ?? "", env.GMAIL_APP_PASSWORD ?? "", env.MAIL_FROM_NAME);
      break;
  }
  return transport;
}

export async function sendMail(message: MailMessage): Promise<void> {
  await getTransport().send(message);
}

/** For tests. */
export function resetMailTransport(): void {
  transport = undefined;
}

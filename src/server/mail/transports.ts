import "server-only";

import { randomUUID } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";

import nodemailer from "nodemailer";

import type { MailMessage, MailTransport } from "./types";

/** Sends through Gmail SMTP with an app password. */
export function gmailTransport(user: string, appPassword: string, fromName: string): MailTransport {
  const transporter = nodemailer.createTransport({
    host: "smtp.gmail.com",
    port: 465,
    secure: true,
    auth: { user, pass: appPassword },
  });
  return {
    async send(m) {
      await transporter.sendMail({
        from: { name: fromName, address: user },
        to: m.to,
        subject: m.subject,
        text: m.text,
        html: m.html,
      });
    },
  };
}

/** Writes each email as JSON into a folder. Used by e2e tests (`.mail/`). */
export function fileTransport(dir: string): MailTransport {
  const folder = resolve(dir);
  return {
    async send(m) {
      await mkdir(folder, { recursive: true });
      const name = `${Date.now()}-${randomUUID()}.json`;
      await writeFile(join(folder, name), JSON.stringify({ ...m, sentAt: new Date().toISOString() }, null, 2));
    },
  };
}

const globalOutbox = globalThis as unknown as { __memoryMail?: MailMessage[] };

/** Keeps emails in memory. Used by unit tests. */
export function memoryOutbox(): MailMessage[] {
  globalOutbox.__memoryMail ??= [];
  return globalOutbox.__memoryMail;
}

export function memoryTransport(): MailTransport {
  return {
    async send(m) {
      memoryOutbox().push(m);
    },
  };
}

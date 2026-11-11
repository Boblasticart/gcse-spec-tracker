import "server-only";

import { z } from "zod";

import { pruneAuthEventsIfDue } from "../account/service";
import { assertSameOrigin, handler, json, parseJson, requestMeta } from "../http";
import { PASSWORD_MAX } from "./password";
import { me, resendOtp, signIn, signOut, signUp, verifyOtp, type AuthResult } from "./service";

function send<B>(result: AuthResult<B>, status = 200): Response {
  const headers = new Headers();
  if (result.setCookie) headers.append("set-cookie", result.setCookie);
  return json(result.body, { status, headers });
}

const credentials = z.object({
  email: z.email({ error: "Enter a valid email address." }).max(254, { error: "That email is too long." }),
  // Length rules are checked in the service so the message is friendly.
  password: z.string({ error: "Enter a password." }).min(1, { error: "Enter a password." }).max(PASSWORD_MAX * 4),
});

const codeBody = z.object({
  code: z.string({ error: "Enter the 6-digit code." }).trim().max(12),
});

export const signUpRoute = handler(async (request: Request) => {
  assertSameOrigin(request);
  const body = await parseJson(request, credentials);
  void pruneAuthEventsIfDue();
  return send(await signUp(body, requestMeta(request)));
});

export const signInRoute = handler(async (request: Request) => {
  assertSameOrigin(request);
  const body = await parseJson(request, credentials);
  void pruneAuthEventsIfDue();
  return send(await signIn(body, requestMeta(request)));
});

export const verifyOtpRoute = handler(async (request: Request) => {
  assertSameOrigin(request);
  const { code } = await parseJson(request, codeBody);
  return send(await verifyOtp(request, code.replace(/\s+/g, ""), requestMeta(request)));
});

export const resendOtpRoute = handler(async (request: Request) => {
  assertSameOrigin(request);
  return send(await resendOtp(request));
});

export const signOutRoute = handler(async (request: Request) => {
  assertSameOrigin(request);
  return send(await signOut(request, requestMeta(request)));
});

export const meRoute = handler(async (request: Request) => send(await me(request)));

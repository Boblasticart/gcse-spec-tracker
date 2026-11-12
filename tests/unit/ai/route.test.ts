import { afterEach, describe, expect, it } from "vitest";

import { aiJsonRoute } from "@/server/ai/routes";
import { runTask } from "@/server/ai/service";
import { ModelError, type Model } from "@/server/ai/model";
import { signUpRoute, verifyOtpRoute } from "@/server/auth/routes";
import { db } from "@/server/db";
import { putDocsRoute } from "@/server/docs/routes";

import { body, client, hasDb, lastCode, uniqueEmail, type Client } from "../../helpers/http";

async function signedIn(): Promise<{ c: Client; user: { id: string; email: string } }> {
  const c = client();
  const email = uniqueEmail("ai");
  await c.call(signUpRoute, { body: { email, password: "purple turtles dance at noon" } });
  await c.call(verifyOtpRoute, { body: { code: lastCode(email) } });
  const user = await db().user.findUniqueOrThrow({ where: { email } });
  return { c, user };
}

const ask = (c: Client, task: string, input: unknown) => c.call(aiJsonRoute, { body: { task, input } });
const question = { marks: 2, q: "Q", scheme: ["a", "b"] };
const fixed = (text: string): Model => async () => text;

afterEach(() => {
  delete process.env.AI_MOCK;
  delete process.env.AI_ALLOWED_EMAILS;
});

describe.skipIf(!hasDb)("POST /api/ai/json (Postgres)", () => {
  it("needs a fully signed-in student", async () => {
    process.env.AI_MOCK = "1";
    const res = await ask(client(), "markAnswer", { question, answer: "x" });
    expect(res.status).toBe(401);
    const bad = await ask((await signedIn()).c, "hack", {});
    expect(await body(bad)).toMatchObject({ code: "INVALID_INPUT" });
  });

  it("runs every task end to end with the mock model", async () => {
    process.env.AI_MOCK = "1";
    const { c } = await signedIn();
    expect(await body(await ask(c, "todaysSeven", { sid: "phy" }))).toMatchObject({ code: "NOTHING_COVERED" });
    await c.call(putDocsRoute, {
      method: "PUT",
      body: { changes: [{ path: "progress/phy", data: { s: { "phy.0.0": 1 }, c: {}, m: {}, w: {}, v: 2 }, baseVersion: 0 }] },
    });
    const seven = await body<{ result: { questions: { pid: string }[] } }>(await ask(c, "todaysSeven", { sid: "phy" }));
    expect(seven.result.questions).toHaveLength(7);
    expect(seven.result.questions[0]?.pid).toBe("phy.0.0");

    expect(await body(await ask(c, "markAnswer", { question, answer: "the correct answer" }))).toMatchObject({ result: { aw: 2, hit: [1, 2] } });
    expect(await body(await ask(c, "markAnswer", { question, answer: "no idea" }))).toMatchObject({ result: { aw: 0 } });
    const review = await body<{ result: { items: unknown[] } }>(
      await ask(c, "reviewWeaknesses", { sid: "phy", items: [{ label: "L", question, ans: "x", hit: [], aw: 0, mx: 2 }] }),
    );
    expect(review.result.items[0]).toMatchObject({ tip: expect.any(String) });
    expect(await body(await ask(c, "writeNote", { pid: "phy.0.0" }))).toMatchObject({ result: { note: { src: "ai" } } });
    const quiz = await body<{ result: { qs: unknown[] } }>(await ask(c, "writeQuiz", { tid: "phy.0" }));
    expect(quiz.result.qs).toHaveLength(10);
    expect(
      await body(await ask(c, "markQuiz", { tid: "phy.0", questions: [question, question], answers: ["correct", "wrong"] })),
    ).toMatchObject({ result: { aw: 2, mx: 4, pct: 50, pass: false } });
  });

  it("accepts fenced JSON and reports unusable replies kindly", async () => {
    const { user } = await signedIn();
    const fenced = fixed('```json\n{"awarded":1,"hit":[1],"explanation":"e","tip":"t"}\n```');
    expect(await runTask(user, "markAnswer", { question, answer: "x" }, { model: fenced })).toEqual({ aw: 1, hit: [1], expl: "e", tip: "t" });
    await expect(runTask(user, "markAnswer", { question, answer: "x" }, { model: fixed("Sorry, no.") })).rejects.toMatchObject({
      status: 502,
      body: { code: "AI_BAD_OUTPUT", message: "Marking failed. Try again in a moment. (ref OUT)" },
    });
    await expect(runTask(user, "writeQuiz", { tid: "phy.0" }, { model: fixed('{"questions":[]}') })).rejects.toMatchObject({
      body: { code: "AI_BAD_OUTPUT", message: "Could not write the quiz. Try again in a moment. (ref OUT)" },
    });
  });

  it("turns model failures into friendly errors", async () => {
    const { user } = await signedIn();
    const busy: Model = async () => {
      throw new ModelError("rate_limited", "429");
    };
    await expect(runTask(user, "writeNote", { pid: "phy.0.0" }, { model: busy })).rejects.toMatchObject({ status: 429, body: { code: "AI_BUSY" } });
    const broken: Model = async () => {
      throw new Error("socket hang up");
    };
    await expect(runTask(user, "writeNote", { pid: "phy.0.0" }, { model: broken })).rejects.toMatchObject({
      status: 502,
      body: { code: "AI_FAILED", message: "Could not write the notes. Try again in a moment. (ref X)" },
    });
    await expect(runTask(user, "writeNote", { pid: "phy.0.0" }, { model: null })).rejects.toMatchObject({ status: 503 });
  });

  it("caps AI use per student per day", async () => {
    const { user } = await signedIn();
    const ok = fixed('{"awarded":0}');
    await runTask(user, "markAnswer", { question, answer: "x" }, { model: ok, cap: 2 });
    await runTask(user, "markAnswer", { question, answer: "x" }, { model: ok, cap: 2 });
    await expect(runTask(user, "markAnswer", { question, answer: "x" }, { model: ok, cap: 2 })).rejects.toMatchObject({
      status: 429,
      body: { code: "AI_LIMIT" },
    });
    const other = await signedIn();
    await expect(runTask(other.user, "markAnswer", { question, answer: "x" }, { model: ok, cap: 2 })).resolves.toMatchObject({ aw: 0 });
  });

  it("can be limited to some accounts", async () => {
    const { user } = await signedIn();
    process.env.AI_ALLOWED_EMAILS = "someone-else@example.test";
    await expect(runTask(user, "markAnswer", { question, answer: "x" }, { model: fixed("{}") })).rejects.toMatchObject({
      status: 403,
      body: { code: "AI_NOT_ALLOWED" },
    });
    process.env.AI_ALLOWED_EMAILS = `someone-else@example.test, ${user.email.toUpperCase()}`;
    await expect(runTask(user, "markAnswer", { question, answer: "x" }, { model: fixed("{}") })).resolves.toBeTruthy();
  });
});

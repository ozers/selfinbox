import { test } from "node:test";
import assert from "node:assert/strict";

test("sendEmail rejects when FROM_EMAIL is missing so callers can report it", async () => {
  process.env.AWS_ACCESS_KEY_ID = "test";
  delete process.env.FROM_EMAIL;
  const { sendEmail } = await import("../src/lib/send-email.js");
  await assert.rejects(sendEmail("a@example.test", "s", "b"), /FROM_EMAIL/);
});

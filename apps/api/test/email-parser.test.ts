import { test } from "node:test";
import assert from "node:assert/strict";
import { parseRawEmail } from "../src/lib/email-parser.js";

// Covers our own normalization on top of mailparser: address flattening,
// the subject fallback, and empty-array defaults for missing headers.

const RAW = [
  "From: Alice Example <alice@example.com>",
  "To: bob@selfinbox.test, carol@selfinbox.test",
  "Cc: dave@selfinbox.test",
  "Subject: Hello there",
  "Content-Type: text/plain; charset=utf-8",
  "",
  "This is the body.",
  "",
].join("\r\n");

test("parseRawEmail extracts from / to / cc / subject / body", async () => {
  const p = await parseRawEmail(RAW);
  assert.equal(p.from, "alice@example.com");
  assert.deepEqual(p.to, ["bob@selfinbox.test", "carol@selfinbox.test"]);
  assert.deepEqual(p.cc, ["dave@selfinbox.test"]);
  assert.equal(p.subject, "Hello there");
  assert.match(p.bodyText, /This is the body\./);
});

test("parseRawEmail falls back to '(no subject)' when Subject is absent", async () => {
  const raw = [
    "From: alice@example.com",
    "To: bob@selfinbox.test",
    "Content-Type: text/plain",
    "",
    "no subject here",
    "",
  ].join("\r\n");
  const p = await parseRawEmail(raw);
  assert.equal(p.subject, "(no subject)");
});

test("parseRawEmail returns empty arrays when To and Cc are missing", async () => {
  const raw = [
    "From: alice@example.com",
    "Subject: solo",
    "Content-Type: text/plain",
    "",
    "body",
    "",
  ].join("\r\n");
  const p = await parseRawEmail(raw);
  assert.deepEqual(p.to, []);
  assert.deepEqual(p.cc, []);
});

test("parseRawEmail has no attachments for a plain-text message", async () => {
  const p = await parseRawEmail(RAW);
  assert.deepEqual(p.attachments, []);
});

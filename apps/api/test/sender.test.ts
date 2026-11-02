import { test } from "node:test";
import assert from "node:assert/strict";
import { isCatchallSender } from "../src/lib/sender.js";

test("isCatchallSender accepts a concrete mailbox on the domain", () => {
  assert.equal(isCatchallSender("wisp@ozersubasi.com", "ozersubasi.com"), true);
  assert.equal(isCatchallSender("first.last+tag@ozersubasi.com", "ozersubasi.com"), true);
  assert.equal(isCatchallSender("Wisp@OzerSubasi.com", "ozersubasi.com"), true);
});

test("isCatchallSender rejects the wildcard itself", () => {
  assert.equal(isCatchallSender("*@ozersubasi.com", "ozersubasi.com"), false);
});

test("isCatchallSender rejects other domains and smuggled addresses", () => {
  assert.equal(isCatchallSender("wisp@evil.com", "ozersubasi.com"), false);
  assert.equal(isCatchallSender("wisp@ozersubasi.com@evil.com", "ozersubasi.com"), false);
  assert.equal(isCatchallSender("wisp@sub.ozersubasi.com", "ozersubasi.com"), false);
  assert.equal(isCatchallSender("Boss <boss@ozersubasi.com>", "ozersubasi.com"), false);
  assert.equal(isCatchallSender("a b@ozersubasi.com", "ozersubasi.com"), false);
  assert.equal(isCatchallSender("wisp\r\nBcc: x@ozersubasi.com", "ozersubasi.com"), false);
  assert.equal(isCatchallSender("@ozersubasi.com", "ozersubasi.com"), false);
});

import { test } from "node:test";
import assert from "node:assert/strict";
import { isAllowedSubscribeUrl, verifySnsMessage } from "../src/lib/sns-verify.js";

// These guard the SNS webhook trust boundary — the only thing standing between
// "AWS sent this" and "an attacker POSTed this". They must never silently relax.

test("isAllowedSubscribeUrl accepts genuine AWS SNS https hosts", () => {
  assert.equal(isAllowedSubscribeUrl("https://sns.us-east-1.amazonaws.com/?Action=ConfirmSubscription"), true);
  assert.equal(isAllowedSubscribeUrl("https://sns.eu-west-1.amazonaws.com/x"), true);
  assert.equal(isAllowedSubscribeUrl("https://sns.cn-north-1.amazonaws.com.cn/x"), true);
});

test("isAllowedSubscribeUrl rejects non-https schemes", () => {
  assert.equal(isAllowedSubscribeUrl("http://sns.us-east-1.amazonaws.com/x"), false);
});

test("isAllowedSubscribeUrl rejects non-AWS and lookalike hosts", () => {
  assert.equal(isAllowedSubscribeUrl("https://evil.com/x"), false);
  // suffix lookalike — the real domain is a prefix of an attacker domain
  assert.equal(isAllowedSubscribeUrl("https://sns.us-east-1.amazonaws.com.evil.com/x"), false);
  assert.equal(isAllowedSubscribeUrl("https://sns.us-east-1.amazonaws.com.attacker.net/x"), false);
  // multi-label "region" is not a real SNS cert host shape
  assert.equal(isAllowedSubscribeUrl("https://sns.a.b.amazonaws.com/x"), false);
  assert.equal(isAllowedSubscribeUrl("not a url"), false);
});

test("verifySnsMessage rejects a missing or non-AWS SigningCertURL", async () => {
  await assert.rejects(() => verifySnsMessage({ Type: "Notification" } as any), /SigningCertURL/);
  await assert.rejects(
    () =>
      verifySnsMessage({
        Type: "Notification",
        SigningCertURL: "https://evil.com/x.pem",
        Signature: "x",
        SignatureVersion: "1",
      } as any),
    /SigningCertURL/,
  );
});

test("verifySnsMessage rejects a missing Signature", async () => {
  await assert.rejects(
    () =>
      verifySnsMessage({
        Type: "Notification",
        SigningCertURL: "https://sns.us-east-1.amazonaws.com/x.pem",
      } as any),
    /Signature/,
  );
});

test("verifySnsMessage rejects an unsupported SignatureVersion", async () => {
  await assert.rejects(
    () =>
      verifySnsMessage({
        Type: "Notification",
        SigningCertURL: "https://sns.us-east-1.amazonaws.com/x.pem",
        Signature: "abc",
        SignatureVersion: "9",
      } as any),
    /SignatureVersion/,
  );
});

test("verifySnsMessage rejects a stale timestamp before any network fetch", async () => {
  const twoHoursAgo = new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString();
  await assert.rejects(
    () =>
      verifySnsMessage({
        Type: "Notification",
        SigningCertURL: "https://sns.us-east-1.amazonaws.com/x.pem",
        Signature: "abc",
        SignatureVersion: "1",
        Timestamp: twoHoursAgo,
      } as any),
    /Timestamp out of range/,
  );
});

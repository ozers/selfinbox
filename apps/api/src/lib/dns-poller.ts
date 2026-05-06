import { GetIdentityVerificationAttributesCommand } from "@aws-sdk/client-ses";
import sql from "../db.js";
import { ses } from "./aws.js";
import { verifyDomainDns } from "./dns-verify.js";

async function pollPendingDomains() {
  const pending = await sql`SELECT * FROM domains WHERE status = 'pending'`;

  if (pending.length === 0) return;

  for (const domain of pending) {
    try {
      // Auto-expire domains pending for more than 30 days
      const createdAt = new Date(domain.created_at);
      const daysPending = (Date.now() - createdAt.getTime()) / (1000 * 60 * 60 * 24);
      if (daysPending > 30) {
        await sql`UPDATE domains SET status = 'failed' WHERE id = ${domain.id}`;
        console.log(`[dns-poller] Domain ${domain.domain} expired after 30 days`);
        continue;
      }

      const records = await sql`SELECT * FROM dns_records WHERE domain_id = ${domain.id}`;
      const dnsResults = await verifyDomainDns(domain.domain, records as any[]);

      await Promise.all(
        dnsResults.map((result) =>
          sql`UPDATE dns_records SET verified = ${result.verified} WHERE id = ${result.id}`
        )
      );

      const allDnsVerified = dnsResults.every((r) => r.verified);
      if (!allDnsVerified) continue;

      // DNS is all green — check SES
      const sesStatus = await ses.send(
        new GetIdentityVerificationAttributesCommand({ Identities: [domain.domain] })
      );
      const attrs = sesStatus.VerificationAttributes?.[domain.domain];
      const sesVerified = attrs?.VerificationStatus === "Success";

      if (sesVerified) {
        await sql`UPDATE domains SET status = 'active' WHERE id = ${domain.id}`;
        console.log(`[dns-poller] Domain ${domain.domain} is now active`);
      }
    } catch (err) {
      console.error(`[dns-poller] Error checking ${domain.domain}:`, err);
    }
  }
}

export function startDnsPoller(intervalMs = 30_000) {
  pollPendingDomains().catch(console.error);
  const id = setInterval(() => pollPendingDomains().catch(console.error), intervalMs);
  console.log(`[dns-poller] Started (interval: ${intervalMs / 1000}s)`);
  return id;
}

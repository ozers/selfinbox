import sql from "../db.js";

const CF_API = "https://api.cloudflare.com/client/v4";

async function cfFetch(token: string, path: string, options?: RequestInit) {
  const res = await fetch(`${CF_API}${path}`, {
    ...options,
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
  });
  return res.json() as Promise<any>;
}

export async function createCloudflareDnsRecords(token: string, domainName: string, domainId: string) {
  const records = await sql`SELECT * FROM dns_records WHERE domain_id = ${domainId}`;

  const zoneData = await cfFetch(token, `/zones?name=${domainName}`);
  if (!zoneData.success || !zoneData.result?.length) {
    throw new Error(
      "Domain not found in Cloudflare. Make sure it's added to your account and the token has Zone:DNS:Edit permission."
    );
  }

  const zoneId = zoneData.result[0].id;
  let created = 0;
  let skipped = 0;

  for (const rec of records) {
    let payload: Record<string, unknown>;

    if (rec.type === "MX") {
      const spaceIdx = (rec.value as string).indexOf(" ");
      const priority = Number((rec.value as string).slice(0, spaceIdx));
      const content = (rec.value as string).slice(spaceIdx + 1);
      payload = { type: "MX", name: rec.name, content, priority, ttl: 1 };
    } else if (rec.type === "CNAME") {
      payload = { type: "CNAME", name: rec.name, content: rec.value, ttl: 1, proxied: false };
    } else {
      payload = { type: rec.type, name: rec.name, content: rec.value, ttl: 1 };
    }

    const result = await cfFetch(token, `/zones/${zoneId}/dns_records`, {
      method: "POST",
      body: JSON.stringify(payload),
    });

    if (result.success) {
      created++;
    } else if (result.errors?.some((e: any) => e.code === 81057)) {
      skipped++; // record already exists — treat as success
    }
  }

  return { created, skipped, total: records.length };
}

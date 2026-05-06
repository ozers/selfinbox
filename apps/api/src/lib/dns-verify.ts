import dns from "node:dns/promises";

const resolver = new dns.Resolver();
resolver.setServers(["8.8.8.8", "1.1.1.1"]);

interface DnsCheckResult {
  type: string;
  name: string;
  verified: boolean;
}

async function checkMxRecord(domain: string, expected: string): Promise<boolean> {
  try {
    const records = await resolver.resolveMx(domain);
    return records.some((r) => r.exchange.toLowerCase().includes(expected.toLowerCase()));
  } catch {
    return false;
  }
}

async function checkTxtRecord(domain: string, expected: string): Promise<boolean> {
  try {
    const records = await resolver.resolveTxt(domain);
    const flat = records.map((r) => r.join(""));
    return flat.some((r) => r.includes(expected));
  } catch {
    return false;
  }
}

async function checkCnameRecord(name: string, expected: string): Promise<boolean> {
  try {
    const records = await resolver.resolveCname(name);
    return records.some((r) => r.toLowerCase().includes(expected.toLowerCase()));
  } catch {
    return false;
  }
}

export async function verifyDomainDns(
  domain: string,
  records: { id: string; type: string; name: string; value: string }[]
): Promise<{ id: string; verified: boolean }[]> {
  const results: { id: string; verified: boolean }[] = [];

  for (const rec of records) {
    let verified = false;

    if (rec.type === "MX") {
      const exchange = rec.value.replace(/^\d+\s+/, "");
      verified = await checkMxRecord(rec.name, exchange);
    } else if (rec.type === "TXT") {
      const searchValue = rec.value.length > 40 ? rec.value.slice(0, 40) : rec.value;
      verified = await checkTxtRecord(rec.name, searchValue);
    } else if (rec.type === "CNAME") {
      verified = await checkCnameRecord(rec.name, rec.value);
    }

    results.push({ id: rec.id, verified });
  }

  return results;
}

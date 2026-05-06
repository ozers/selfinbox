import { simpleParser, type ParsedMail } from "mailparser";

interface ParsedEmail {
  from: string;
  to: string[];
  cc: string[];
  subject: string;
  bodyText: string;
  bodyHtml: string;
}

export async function parseRawEmail(raw: string | Buffer): Promise<ParsedEmail> {
  const parsed: ParsedMail = await simpleParser(raw);

  const from = parsed.from?.value?.[0]?.address || parsed.from?.text || "";
  const to = parsed.to
    ? (Array.isArray(parsed.to) ? parsed.to : [parsed.to])
        .flatMap((addr) => addr.value.map((v) => v.address || ""))
        .filter(Boolean)
    : [];
  const cc = parsed.cc
    ? (Array.isArray(parsed.cc) ? parsed.cc : [parsed.cc])
        .flatMap((addr) => addr.value.map((v) => v.address || ""))
        .filter(Boolean)
    : [];

  return {
    from,
    to,
    cc,
    subject: parsed.subject || "(no subject)",
    bodyText: parsed.text || "",
    bodyHtml: parsed.html || parsed.textAsHtml || "",
  };
}

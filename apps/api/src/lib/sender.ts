// A catch-all lets the domain owner send from any local part, so `from` is no
// longer pinned to a stored address and reaches the SES Source header as typed.
// Keep this strict: exactly one mailbox on the verified domain, with no display
// name, wildcard, whitespace or second `@` that could change who the mail is from.
export function isCatchallSender(from: string, domain: string): boolean {
  const at = from.indexOf("@");
  if (at <= 0) return false;
  return /^[a-z0-9._+-]+$/i.test(from.slice(0, at)) && from.slice(at + 1).toLowerCase() === domain.toLowerCase();
}

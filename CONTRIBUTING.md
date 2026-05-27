# Contributing

Thanks for taking a look. A few notes before you dive in.

## Stuff that's welcome

- Bug fixes — open a PR directly.
- Docs improvements, typos, missing examples.
- Small features that fit the existing architecture.
- Security findings — see [`SECURITY.md`](SECURITY.md), please don't open
  public issues for those.

## Stuff that's out of scope

Selfinbox is deliberately a thin layer over AWS SES. A few things have
been considered and intentionally left out, so you don't waste an evening
on a PR I can't merge:

- **No queue / Redis / background worker.** The webhook → DB → S3 path
  is synchronous on purpose.
- **No in-process MTA.** SES handles delivery. If you want to run your
  own Postfix/Haraka, fork — that's a different project.
- **No generic transactional-mail features** (templates, scheduled sends,
  A/B testing, analytics).
- **No public API for external apps.** The HTTP API is scoped to the SPA.

If you're not sure whether something fits, open an issue with a short
sketch before writing code — saves us both time.

## Local dev

See [`docs/SELF_HOSTING.md`](docs/SELF_HOSTING.md) for the full setup.
Short version: `npm run init` → fill `apps/api/.env` →
`npm run aws:setup` → `(cd apps/api && npm run dev)` +
`(cd apps/web && npm run dev)`.

## Questions

Usage questions go in
[Discussions](https://github.com/ozers/selfinbox/discussions) rather than
issues. Everything else, just open a PR or an issue and we'll figure it
out from there.

# Contributing

## Ground Rules

- Keep the product narrow. This repo is a cleanup companion for Immich, not a replacement photo manager.
- Optimize for a fast review loop before adding management features.
- Do not expose Immich credentials to the browser.

## Local Setup

```bash
cp .env.example .env
npm install
npm run dev
```

Redis is required for normal local development.

## Verification

Incorporate current main and resolve conflicts, build a runnable preview, and verify affected behavior using isolated state. Use focused tests where they add evidence. Broad suites are on demand, not a pull-request or merge gate. No independent reviewer, owner handoff or draft/ready ceremony is required. Production requires Andre's approval of the tested artifact and target. See [AGENTS.md](AGENTS.md).

## Pull Request Expectations

- Explain the user-visible behavior change.
- Call out any security, auth, cache, or deployment impact.
- Use focused checks for changed queue, review-state or media-proxy behavior when useful; do not add tests that merely mirror the implementation.
- Keep docs current when env vars, Docker behavior, or setup flow changes.

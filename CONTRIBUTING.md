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

## Before Opening a Pull Request

Run all checks:

```bash
npm run typecheck
npm test
npm run test:e2e
npm run build
```

## Pull Request Expectations

- Explain the user-visible behavior change.
- Call out any security, auth, cache, or deployment impact.
- Add or update tests for any queue, review-state, or media-proxy change.
- Keep docs current when env vars, Docker behavior, or setup flow changes.

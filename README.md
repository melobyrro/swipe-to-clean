# Swipe to Clean

Swipe to Clean is a self-hosted Immich companion for one job: show photos and videos from the same month/day across the last `N` years and let you `keep` or `trash` them fast.

It is intentionally thin:

- no dedupe workflow
- no burst grouping
- no backlog mode
- no multi-user support

The app is decisions-first. It is not trying to become a second photo manager.

## Product Behavior

- Exact same month/day only.
- Rolling `last N years`, excluding the current year.
- `Keep` hides an asset from this app forever.
- `Trash` calls Immich soft delete with `force: false`.
- If trash fails, the asset stays out of the main queue and appears in a retry tray.
- Leftovers do not roll forward to tomorrow.

## Architecture

- React frontend
- Express backend
- SQLite for durable truth
- Redis for hot queue/session state
- Immich stays behind the server; the browser never talks to Immich directly

## Production Notes

- Run the app close to Immich. The media proxy is on the critical path.
- Put the app behind HTTPS. Production cookies are `Secure`.
- Set a long random `APP_SECRET`. The server now refuses to boot in production with the example secret or a weak one.
- Set a one-time `SETUP_TOKEN` before exposing a fresh production instance. The first-run setup UI now requires it so strangers cannot claim an unconfigured server.
- Production expects Redis by default. If Redis is unreachable, the server now fails fast instead of silently falling back to in-memory cache.
- Health and readiness probes are available at:
  - `/api/healthz`
  - `/api/readyz`
- The review deck advances optimistically. `Keep` and `Trash` remove the current card immediately while the backend persists the decision in the background.
- API requests emit JSON access logs with an `x-request-id` response header for tracing button clicks through the backend.

## Requirements

- Node 22+
- Redis
- An existing Immich instance on the same host or Docker network
- HTTPS reverse proxy in front of this app for normal remote access

## Quick Start

1. Copy the example env file and generate secrets:

```bash
cp .env.example .env
openssl rand -hex 32
openssl rand -hex 16
```

2. Put the first value into `APP_SECRET` and the second into `SETUP_TOKEN`.
3. Start the app stack:

```bash
docker compose up -d --build
```

4. Open the app through your reverse proxy.
5. Enter the one-time setup token, then connect Immich.
6. Prefer the Immich API key path unless you explicitly want the app to keep an encrypted copy of your Immich password for token refresh.

Local runtime state now lives under `.local/` by default so SQLite files do not accumulate in the repo root.

## Local Development

1. Copy the example env file:

```bash
cp .env.example .env
```

2. Set a strong `APP_SECRET`.

3. Install dependencies and start the app:

```bash
npm install
npm run dev
```

Frontend runs on `http://127.0.0.1:5173`.
Backend runs on `http://127.0.0.1:3001`.
Local SQLite data defaults to `.local/swipe-to-clean.db`.

## Docker Compose

1. Set `APP_SECRET` in your shell or `.env`.
   For a fresh public deployment, also set `SETUP_TOKEN`.
   If you plan to run the bundled Caddy edge, also set `APP_HOST` and `ACME_EMAIL`.

2. Start the app and Redis:

```bash
docker compose up -d --build
```

The app binds to `127.0.0.1:${APP_BIND_PORT:-3001}` so the reverse proxy stays the public entrypoint.
If that host port is already taken on your server, set `APP_BIND_PORT` to another loopback port such as `8510`.
If your reverse proxy already runs in Docker in a separate stack, do not target the host LAN IP for that loopback-bound port. A Dockerized proxy cannot reach a service that only listens on `127.0.0.1`.

## Caddy and Cloudflare

If you already run Caddy on the host, use [deploy/Caddyfile.example](deploy/Caddyfile.example) and point it at `127.0.0.1:3001`.
That file now trusts Cloudflare proxy headers and prefers `CF-Connecting-IP`, so app-side logs and rate limits see the real client IP instead of the Cloudflare edge IP.

If you already run Caddy in Docker in a separate compose project, attach Swipe to the same external Docker network and proxy by container alias instead of host port:

```bash
CADDY_DOCKER_NETWORK=caddy_proxy docker compose -f docker-compose.yml -f docker-compose.existing-caddy.yml up -d --build
```

Then add a site block like:

```caddy
swipe.example.com {
	encode zstd gzip
	reverse_proxy http://swipe-to-clean-app:3001
}
```

That keeps the app private while still making it reachable to the edge proxy.

If you want Caddy in Docker alongside the app, use:

```bash
APP_HOST=swipe.example.com ACME_EMAIL=you@example.com docker compose -f docker-compose.yml -f docker-compose.caddy.yml up -d --build
```

That uses [deploy/Caddyfile.docker](deploy/Caddyfile.docker), where Caddy proxies directly to the `app` container.

For Cloudflare:

1. Create a DNS record for your app host.
   Example: a proxied `CNAME` named `swipe` that points to your main host, which matches the setup shown in your screenshot.
2. Set Cloudflare SSL/TLS mode to `Full (strict)`.
3. Point `APP_HOST` or the host-run Caddy site block at that hostname.
4. Keep ports `80` and `443` reachable on the origin that runs Caddy.
5. Do not publish the app container directly to the internet. The app port is loopback-only on purpose; Caddy should be the only public entrypoint.

## GitHub Readiness

This repo includes:

- CI via GitHub Actions
- `npm run audit:publish` to catch local runtime files, private keys, and leaked workstation paths before upload
- Dependabot config for npm and Docker updates
- contribution and security policy docs
- Docker health checks
- Caddy configuration examples for host and Docker deployments
- a project license

## Reverse Proxy

Expose Swipe to Clean through HTTPS. Keep the app close to Immich. If Immich is also in Docker, connect this container to the same Docker network as your Immich server so media proxying stays cheap.

Example high-level setup:

- public HTTPS endpoint -> reverse proxy -> Swipe to Clean
- Swipe to Clean container -> same Docker network as Immich
- Swipe to Clean container -> Redis

If you proxy through Cloudflare, the Caddy examples in [deploy](deploy) already include Cloudflare IP trust settings. That keeps `CF-Connecting-IP` authoritative once traffic reaches Caddy.

## First Run

1. Open the app.
2. Enter the `SETUP_TOKEN` if this is the first time the server has ever been configured.
3. Connect Immich using either:
   - API key
   - email + password
4. Set your review timezone and years-back value.
5. Use that same Immich auth mode for future logins.
6. Start swiping.

## Commands

```bash
npm run dev
npm run build
npm run typecheck
npm test
npm run test:e2e
npm run audit:publish
```

## Verification

Current implementation has:

- unit tests for year-window generation
- service tests for queue filtering/sorting
- integration tests for first-run Immich setup, CSRF, both Immich auth modes, queueing, action failure persistence, and media proxying
- Playwright coverage for the review deck UI and image/video modal behavior

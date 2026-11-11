# Swipe to Clean agent instructions

Verify this repository and actual task checkout; read README and relevant product guidance. Historical handoffs are context, not authority to resume work.

## Development and delivery

Use one chat: change → resolve merge conflicts against current main → build and stage → check affected behavior → Andre approves production → promote the same tested artifact and verify.

The same chat uses the existing authenticated host tools when host-specific work is needed; no separate release-manager chat, owner designation, handoff acceptance, mandatory independent reviewer, draft/ready ceremony or repeated unchanged review is required. Preserve unrelated work and never force-push over it.

GitHub stores source and pull requests; automated test/review gates are removed. Run only checks needed to build, then verify changed behavior in an isolated staging/preview environment. Use focused tests when they prove calculations, persistence or concurrency that preview checks cannot establish. Broad suites are optional unless explicitly requested or a concrete unresolved defect warrants them. Reuse unchanged evidence.

Production requires one approval for the tested artifact and target; retries within that scope need no repeat approval. No mandatory pre-deployment backup, snapshot or restore rehearsal. Preserve independent disaster-recovery jobs and existing backups. Never claim source rollback restores data.

Keep a short result with artifact, target, affected checks and outcome. Save resumption notes only when pausing or requested. Do not recreate retired gates, backup mandates or ownership roles without Andre's explicit request. Documentation-only changes do not deploy.

## Product and security boundaries

Preserve same-month/day scope, durable Keep/Trash decisions, SQLite state and authentication. Trash uses Immich soft delete (`force: false`), never permanent asset deletion. Credentials remain server-side and out of Git, logs and screenshots. Preview uses isolated synthetic state and must not mutate real Immich assets. Inspect public-source changes for credentials and private runtime files before publication; `npm run audit:publish` is available as a focused tool, not an automatic CI gate.

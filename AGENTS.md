# Swipe to Clean agent instructions

## Session startup

This is Swipe to Clean, the self-hosted Immich photo/video review companion.
Verify this repository's remote and work from its actual task checkout root.
Read this file, [README](README.md), and the current [handoff](HANDOFF.md) before
working. A shared cloud environment named Dev does not make this a Dev app.
Reconcile handoff context with current source and the user's latest request;
recorded next steps are not automatic authorization to execute them.

## Product boundaries

Keep the existing same-month/day review scope and durable Keep/Trash semantics.
Trash uses Immich soft delete (`force: false`); never turn it into permanent
asset deletion. Keep Immich credentials server-side and out of source, logs,
screenshots and handoffs. Preserve SQLite state and existing authentication.

Use focused checks appropriate to the change. Documentation-only changes need
link and diff checks, not deployment. Do not start an Immich mutation or deploy
production merely to validate documentation. Update the existing handoff at
closeout with verified decisions, evidence, ownership and remaining work.

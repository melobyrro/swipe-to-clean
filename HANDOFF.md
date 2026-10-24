# Swipe to Clean handoff

## CI efficiency — October 24, 2026

Andre authorized global Actions optimization. Keep PRs draft during iteration;
mark reviewed candidates ready to run all existing application checks. Returning
to draft or publishing a newer candidate cancels obsolete tests. Plain root/docs
prose uses the scope tests and the existing public-source audit, without dependency
or browser installation. Full checks run on ready code candidates and manual
requests, without a duplicate main-push run. Production/Immich behavior is unchanged.

Validated locally: 12 CI-scope tests, the publish audit, typecheck, 10 existing
unit/integration assertions, production build and actionlint 1.7.12. Browser E2E
was not repeated for these workflow-only changes; its existing CI command remains.
Independent source review found no blocking issues. Hosted CI and the exact merged
workflow readback are tracked in the delivery PR; no app deployment is included.

## Previous startup context

Updated October 10, 2026. Scope: source-project startup documentation.

This project is the self-hosted Immich photo/video review companion. Start with [AGENTS](AGENTS.md)
and [README](README.md). No prior tracked project handoff was found. This
initial handoff does not reconstruct earlier chats or certify runtime/release state.

Added explicit project identity and linked this handoff so sessions can discover
continuity from the repository root. No app, data, build configuration or deployment
behavior changed. Owner: `codex/project-startup-context-20261010`.

Next session: verify the repository and current source, read the project rules,
then establish the requested task and existing owner. Synchronize the local
checkout and verify Codex's launch path separately; neither local configuration
nor fresh-chat automatic loading was verified by this cloud documentation task.
Update this handoff with actual task decisions, evidence and unresolved work.

Validation: relative Markdown links in all changed files and `git diff --check`
passed. Changes were reviewed for project scope and preservation of existing
delivery rules. Runtime checks were not run for this documentation-only task.

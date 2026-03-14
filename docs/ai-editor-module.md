# AI Editor Module (MVP)

## Purpose

This module provides a safe, command-gateway based AI editing loop inside the OpenCut editor sidebar.

## Scope (Current)

1. Parse user text into a strict whitelist of planned actions.
2. Preview actions in a dry-run step.
3. Enforce high-risk confirmation before execute.
4. Execute actions through existing OpenCut actions.
5. Record lightweight audit entries for planned and execution outcomes.
6. Persist audit entries in local storage.
7. Build/serialize/parse versioned audit payloads for export and import handoff.
8. Support audit import in `AIView` with payload parsing validation before applying entries.
9. Support expanded timeline orchestration commands (navigation, selection, clipboard, and visibility/mute controls).
10. Support read-only workspace summary intents (assets/timeline) and caption generation intent in AI sidebar.

## Main Files

1. `apps/web/src/lib/ai-editor/planner.ts`
2. `apps/web/src/lib/ai-editor/executor.ts`
3. `apps/web/src/lib/ai-editor/audit-log.ts`
4. `apps/web/src/lib/ai-editor/risk-policy.ts`
5. `apps/web/src/lib/ai-editor/risk-confirmation.ts`
6. `apps/web/src/lib/ai-editor/session.ts`
7. `apps/web/src/lib/ai-editor/audit-storage.ts`
8. `apps/web/src/lib/ai-editor/audit-export.ts`
9. `apps/web/src/lib/ai-editor/audit-merge.ts`
10. `apps/web/src/lib/ai-editor/telemetry.ts`
11. `apps/web/src/lib/ai-editor/intents.ts`
12. `apps/web/src/lib/ai-editor/analytics-sink.ts`
13. `apps/web/src/lib/ai-editor/ai-view-interaction.ts`
14. `apps/web/src/components/editor/panels/assets/views/ai.tsx`

## Safety Rules

1. Only whitelisted actions are supported.
2. Unknown input returns no action.
3. Execution preserves plan order.
4. Failures are isolated per action and do not stop later actions.
5. High-risk plans require per-action explicit confirmation.
6. Plan/execution messages and audit entry creation are centralized in `session.ts`.
7. Audit export/import payload parsing is schema/version/count validated before acceptance.
8. English keyword matching uses boundary checks to reduce false positives (for example `play` vs `playback`).

## Risk Policy

1. `high`: `delete-selected`
2. `medium`: `split-at-playhead`, `undo`, `redo`, `paste-copied`, `duplicate-selected`, `toggle-elements-muted-selected`, `toggle-elements-visibility-selected`, `toggle-ripple-editing`
3. `low`: `toggle-play`, `stop-playback`, `goto-start`, `goto-end`, `select-all`, `deselect-all`, `copy-selected`, `add-bookmark`, `toggle-snapping`

## Whitelisted Action Mapping

1. `toggle-play` -> `toggle-play`
2. `stop-playback` -> `stop-playback`
3. `goto-start` -> `goto-start`
4. `goto-end` -> `goto-end`
5. `select-all` -> `select-all`
6. `deselect-all` -> `deselect-all`
7. `copy-selected` -> `copy-selected`
8. `paste-copied` -> `paste-copied`
9. `duplicate-selected` -> `duplicate-selected`
10. `undo` -> `undo`
11. `redo` -> `redo`
12. `split-at-playhead` -> `split`
13. `add-bookmark` -> `toggle-bookmark`
14. `delete-selected` -> `delete-selected`
15. `toggle-elements-muted-selected` -> `toggle-elements-muted-selected`
16. `toggle-elements-visibility-selected` -> `toggle-elements-visibility-selected`
17. `toggle-snapping` -> `toggle-snapping`
18. `toggle-ripple-editing` -> `toggle-ripple-editing`

## Audit Entry Model

Each entry stores:

1. `id`
2. `timestamp`
3. `input`
4. `actions`
5. `status` (`planned`, `executed`, `failed`)

## Persistence

1. Storage key: `opencut:ai-editor:audit-entries`
2. Utilities in `audit-storage.ts` are storage-adapter based (no direct browser global dependency).
3. `AIView` loads persisted entries on mount and writes updates after hydration.

## Flow (Current)

1. Input text -> `planner.ts` builds whitelisted action plan.
2. `session.ts` builds dry-run summary and planned audit entry.
3. `risk-confirmation.ts` gates high-risk actions before execution.
4. `executor.ts` runs mapped OpenCut actions and returns executed/failed sets.
5. `session.ts` builds execution summary and execution audit status.
6. `audit-storage.ts` persists audit history.
7. `audit-export.ts` builds/serializes/parses versioned payloads for export.
8. `audit-merge.ts` applies `replace` / `append` / `dedupe` import merge strategies.
9. `AIView` imports audit JSON, validates via payload parser, previews merge result, then applies on explicit confirmation.
10. `telemetry.ts` emits structured plan/execute/export/import events through a pluggable sink.
11. `analytics-sink.ts` bridges telemetry events into browser analytics sink (`databuddy`) with event-name mapping.
12. `intents.ts` detects read-only summary and caption generation intents before command planning.

## Test Commands

```bash
bun test apps/web/src/lib/ai-editor/__tests__/planner.test.ts
bun test apps/web/src/lib/ai-editor/__tests__/executor.test.ts
bun test apps/web/src/lib/ai-editor/__tests__/audit-log.test.ts
bun test apps/web/src/lib/ai-editor/__tests__/risk-policy.test.ts
bun test apps/web/src/lib/ai-editor/__tests__/audit-storage.test.ts
bun test apps/web/src/lib/ai-editor/__tests__/audit-export.test.ts
bun test apps/web/src/lib/ai-editor/__tests__/audit-merge.test.ts
bun test apps/web/src/lib/ai-editor/__tests__/telemetry.test.ts
bun test apps/web/src/lib/ai-editor/__tests__/intents.test.ts
bun test apps/web/src/lib/ai-editor/__tests__/analytics-sink.test.ts
bun test apps/web/src/lib/ai-editor/__tests__/ai-view-interaction.test.ts
bun test apps/web/src/lib/ai-editor/__tests__/risk-confirmation.test.ts
bun test apps/web/src/lib/ai-editor/__tests__/session.test.ts
bun test apps/web/src/lib/ai-editor/__tests__/flow-integration.test.ts
```

## Lint Command

```bash
bunx biome lint apps/web/src/lib/ai-editor apps/web/src/components/editor/panels/assets/views/ai.tsx --max-diagnostics=1000
```

## Next Iteration

1. Add component-level `AIView` interaction tests for dry-run -> confirm -> execute state transitions.
2. Add component-level import preview tests for apply/cancel and strategy switching behavior.
3. Add user-visible import parse error detail (schema mismatch vs malformed JSON).
4. Add analytics sink sampling and privacy filtering policy for payload fields.

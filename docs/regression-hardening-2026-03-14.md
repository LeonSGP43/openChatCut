# Regression Hardening (March 14, 2026)

This document records the MVP stability fixes that were required to make
regression gates pass consistently in local development.

## What Was Fixed

1. `lint:web` now uses repository-local Biome via `bunx` instead of assuming a
   global `biome` binary.
2. Biome CSS parser now supports Tailwind directives
   (`@custom-variant`, `@plugin`, `@apply`, `@theme`, `@utility`).
3. Timeline/asset/core lint findings were fixed:
   - removed array-index-based key in background preview list rendering,
   - added keyboard support for timeline track click target,
   - fixed `forEach` callbacks to avoid returning values implicitly.
4. Blog data fetching now has safe fallbacks so static build does not fail when
   Marble CMS endpoints are unavailable (e.g. `404 Not Found`).
5. Root `tools` scripts no longer fail when `@opencut/tools` workspace is not
   configured.

## Regression Commands

Run these from repository root:

```bash
bun test
bun run lint:web
bun run build:web
bun run build:tools
```


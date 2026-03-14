# OpenChatCut Repository Migration

This repository is the physical merge target for:

- `OpenCut` (web editor runtime)
- `aicut` (AI orchestration pipeline)

The editor remains in `apps/web`, while the imported orchestration code lives in:

- `services/aicut-orchestrator`

## Validation Checklist

Run from repository root:

```bash
bun install
bun test
bun run lint:web
bun run build:web
bun run build:tools
PYTHONPATH=services/aicut-orchestrator/src python3 -m pytest services/aicut-orchestrator/tests -q
```

## Notes

- `build:web` requires web environment variables from `apps/web/.env.local`.
- `build:tools` is intentionally a no-op until a dedicated `@opencut/tools` package is added.

# openChatCut

openChatCut is a productized merge of:

- OpenCut (browser-based multi-track editor)
- aicut (AI orchestration and planning pipeline)

The goal is a single workflow: chat with an AI editor in-app and let it operate directly on timeline, tracks, assets, and captions without exporting/importing intermediate config files.

## What It Supports Today

- Timeline-based editing in `apps/web`
- Multi-track operations (video/audio/image/text)
- AI editor sidebar action planning + safe execution gateway
- Audit import/export and merge preview for AI actions
- Caption generation and timeline/asset summary intents
- AI orchestration service code in `services/aicut-orchestrator`

## Repository Layout

- `apps/web` - Main Next.js editor app
- `packages/ui` - Shared UI package
- `packages/env` - Shared env schema package
- `services/aicut-orchestrator` - Imported orchestration engine from `aicut`
- `docs` - Architecture, migration, and module notes

## Quick Start

1. Install dependencies

```bash
bun install
```

2. Prepare web env

```bash
cp apps/web/.env.example apps/web/.env.local
```

3. Start local dependencies (optional but recommended)

```bash
docker compose up -d db redis serverless-redis-http
```

4. Run web app

```bash
bun run dev:web
```

## Validation Commands

Run from repo root:

```bash
bun test
bun run lint:web
bun run build:web
bun run build:tools
PYTHONPATH=services/aicut-orchestrator/src python3 -m pytest services/aicut-orchestrator/tests -q
```

## Attribution Note

Timeline refactor-related modules in openChatCut are adapted from OpenCut timeline code and then extended for AI-driven editing workflows. openChatCut keeps this technical lineage explicit.

## License

MIT. See [LICENSE](LICENSE).

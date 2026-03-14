# Fast MVP Plan

## Objective

Ship the fastest realistic prototype for `aicut -> OpenCut` handoff.

The prototype goal is narrow:

- `aicut` automatically assembles a strict-duration edit
- `aicut` exports a single portable bundle
- `OpenCut` imports that bundle into its native local storage
- the imported project opens with the correct main video timeline

## Chosen MVP Shape

Use a single `.opencut` zip bundle as the handoff format.

### aicut side

- reuse existing auto-editing pipeline
- reuse existing OpenCut-shaped JSON export
- add bundle writer
- include:
  - `project.json`
  - `manifest.json`
  - `media/*`

### OpenCut side

- add one import entrypoint only
- unzip `.opencut`
- write project JSON into IndexedDB
- write media files into OPFS
- load project through existing `ProjectManager / StorageService`

## Why This Is The Fastest Path

- It does not require a new backend.
- It does not require a plugin system.
- It does not require `aicut` to write into browser storage directly.
- It matches OpenCut issue `#719` and current storage architecture.
- It keeps the OpenCut change set small and local.

## MVP In Scope

### Timeline scope

- one main scene
- one main video track
- video elements only
- preserve:
  - clip order
  - `startTime`
  - `duration`
  - `trimStart`
  - `trimEnd`
  - project FPS
  - canvas size
  - background color

### aicut deliverables

- final rendered mp4
- `.otio`
- `.opencut` bundle
- debug manifest for inspection

### OpenCut deliverables

- import button or import command
- successful project hydration into IndexedDB + OPFS
- imported project appears in project list
- imported project opens without missing media

## MVP Out of Scope

- text tracks
- subtitles
- sticker/effect tracks
- audio bed export
- advanced thumbnails
- polished import UX
- streaming unzip optimization
- cross-browser edge-case hardening

## Work Breakdown

## Phase 1: Finish aicut Bundle Export

Tasks:

1. add real zip bundle generation
2. replace path-first media manifest with bundled file references
3. add tests for bundle layout and manifest consistency
4. keep current JSON export as debug output

Definition of done:

- one command emits `.opencut`
- archive contains `project.json`, `manifest.json`, and media files

## Phase 2: Build OpenCut Import Spike

Tasks:

1. add import entrypoint in OpenCut dashboard or project page
2. unzip archive in browser
3. validate `manifest.json`
4. write files to OPFS
5. write serialized project to IndexedDB
6. trigger normal project load

Definition of done:

- user imports one `.opencut` file
- imported project becomes visible and openable

## Phase 3: End-to-End Validation

Test with:

- 15-second edit
- 30-second edit
- 60-second edit

For each:

- no missing media
- no broken references
- duration preserved
- trim boundaries preserved
- timeline order preserved

## Engineering Risks

### High risk

- browser unzip of large media may be memory-heavy
- OpenCut storage assumptions may shift if upstream changes schema quickly

### Medium risk

- media file naming collisions in the bundle
- import flow may need minor schema normalization before save

### Low risk

- timeline view state mismatch
- cosmetic project metadata issues

## Fastest Prototype Acceptance Criteria

This MVP is successful if:

1. `aicut` exports a `.opencut` bundle from a strict-duration auto-edited project.
2. `OpenCut` imports that bundle with one user action.
3. The imported project opens with the expected main video timeline.
4. The core timing data survives the roundtrip.

## Immediate Next Coding Step

Do this first:

1. implement `.opencut` zip creation in `aicut`

Do this second:

2. implement OpenCut import spike for `project.json + media/*`

Anything else waits until those two steps are proven.

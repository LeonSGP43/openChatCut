# aicut -> OpenCut Implementation Plan

## Goal

Land a practical integration where `aicut` remains the automatic editing pipeline and `OpenCut` becomes the project/timeline host for manual follow-up editing.

The target workflow is:

1. `aicut` analyzes multiple source assets.
2. `aicut` assembles a strict-duration edit.
3. `aicut` exports an OpenCut-compatible project bundle.
4. `OpenCut` imports that bundle into its native local storage.
5. The user opens the imported project and continues editing in OpenCut.

## Verified Facts

- OpenCut stores project state as serialized JSON shaped like `SerializedProject`.
- OpenCut stores media binaries separately from project JSON.
- Project JSON is persisted in browser-local IndexedDB.
- Media files are persisted in browser-local OPFS.
- OpenCut does not currently expose a formal project import/export feature.
- OpenCut issue `#719` explicitly requests a portable `.opencut` project format and import/export path.

## Non-Goals For MVP

- Do not build a general OpenCut plugin system.
- Do not support every OpenCut track/element type.
- Do not solve advanced subtitles, stickers, effects, or audio mixing first.
- Do not attempt direct cross-origin browser storage injection from `aicut`.

## MVP Scope

### aicut side

- Generate strict-duration timeline as today.
- Export OpenCut-compatible project JSON for:
  - project metadata
  - one main scene
  - one main video track
  - video elements with:
    - `mediaId`
    - `startTime`
    - `duration`
    - `trimStart`
    - `trimEnd`
    - `sourceDuration`
    - default transform/opacity/blendMode
- Export media manifest that maps `mediaId` to local asset files.
- Export a single bundle format for handoff.

### OpenCut side

- Add one import entrypoint.
- Parse the bundle.
- Write project JSON to IndexedDB using current `StorageService`.
- Write media files to OPFS using current `OPFSAdapter`.
- Load imported project through current `ProjectManager`.

## Recommended Bundle Format

Use a single archive with extension `.opencut`.

Contents:

- `project.json`
- `media/`
- `media/<mediaId>-<original-name>`
- `manifest.json`

`project.json` is the OpenCut-compatible serialized project.

`manifest.json` is a small bridge manifest owned by `aicut` that records:

- schema version
- project name
- target duration
- exported at
- asset list
- `mediaId -> bundled filename`

This avoids relying on absolute local file paths.

## Why This Path

- It matches OpenCut's actual architecture instead of inventing a fake file import story.
- It keeps the OpenCut change set narrow.
- It avoids writing browser storage from outside OpenCut.
- It creates a portable handoff format for future use.

## Implementation Phases

## Phase 1: Stabilize aicut Export

Deliverables:

- keep current OpenCut JSON export
- replace path-based media manifest with bundle-oriented manifest
- add `.opencut` archive writer
- add tests for bundle structure

Acceptance:

- `aicut build` emits:
  - render mp4
  - `.otio`
  - `.opencut` archive
  - debug manifest

## Phase 2: Add OpenCut Import Entry

Deliverables:

- OpenCut import UI action
- archive parsing
- project JSON validation
- media copy into OPFS
- project save into IndexedDB

Acceptance:

- importing a bundle creates a visible project in OpenCut
- imported media resolves without relinking
- main video track opens correctly

## Phase 3: Tighten Schema Contract

Deliverables:

- document `project.json` schema subset used by `aicut`
- version compatibility notes
- import error messages for missing media or invalid fields

Acceptance:

- schema changes are explicit
- breakage from upstream OpenCut changes is detectable quickly

## Phase 4: Expand Beyond Main Video Track

Deliverables:

- optional text track export
- optional bookmarks/markers
- optional audio bed export

Acceptance:

- extra track types import cleanly
- video-only MVP remains stable

## Biggest Risks

- OpenCut internal schema may change quickly.
- OPFS import may be slow for large files if done on the main thread.
- Media identity rules must be stable enough that imported `mediaId`s always match timeline elements.
- Browser file APIs may create UX limitations for archive import on some environments.

## Success Criteria

The MVP is done when:

- `aicut` can generate a 15s/30s/60s strict-duration edit.
- That edit can be exported as a portable OpenCut bundle.
- OpenCut can import that bundle without manual relinking.
- The imported timeline preserves:
  - clip order
  - clip timing
  - trim boundaries
  - base project settings

## Current Status

- `aicut` already exports an OpenCut-shaped JSON file.
- `aicut` already exports a debug media mapping manifest.
- `aicut` now packages a portable `.opencut` archive with bundled media references.
- bundle layout and portable manifest behavior are covered by export tests.
- a browser-side OpenCut import spike exists in this repo for same-origin prototype validation.
- a formal OpenCut product import still does not exist in the OpenCut repository.

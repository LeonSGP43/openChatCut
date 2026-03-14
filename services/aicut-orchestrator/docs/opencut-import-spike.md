# OpenCut Import Spike

## Purpose

This is the fastest prototype path for testing `.opencut` bundle ingestion
without first patching the OpenCut repository.

It works by running a helper script **inside an OpenCut browser tab** so the
script has access to the same origin's:

- IndexedDB
- OPFS

## File

- [opencut_import_spike.js](/Users/leongong/Desktop/LeonProjects/aicut/scripts/opencut_import_spike.js)

## What It Does

Given a `.opencut` bundle, the script:

1. loads `project.json`
2. loads `manifest.json`
3. extracts media from `media/*`
4. writes media files into OpenCut's OPFS directory
5. writes media metadata into OpenCut's IndexedDB
6. writes project JSON into OpenCut's project store

It uses the current OpenCut storage names discovered from repo inspection:

- projects DB: `video-editor-projects`
- projects store: `projects`
- media DB: `video-editor-media-<projectId>`
- media store: `media-metadata`
- media OPFS directory: `media-files-<projectId>`

## How To Use

1. Export a bundle with `aicut build ...`.
2. Copy the helper script:

```bash
aicut opencut-import-script --copy
```

3. Open OpenCut in the browser.
4. Open DevTools console.
5. Paste the helper once.
6. Use the floating import panel:

- drag a `.opencut` bundle onto the drop zone, or
- click `Choose Bundle`

7. Reload the OpenCut projects page if needed.

You can still call the manual entry point directly:

```js
await importAICutOpenCutBundle()
```

## Limitations

- This is a prototype helper, not a polished OpenCut feature.
- The helper installs a floating overlay inside the current OpenCut tab.
- Import failures are surfaced in-panel with expandable error details, but the
  messaging is still developer-oriented.
- It currently targets the MVP bundle:
  - one main scene
  - one main video track
  - video assets only
- It loads JSZip from CDN at runtime.
- It assumes OpenCut storage keys remain stable.

## Why This Exists

It proves the end-to-end handoff before investing in a formal OpenCut-side import UI.

If this works reliably, the next step is to move the same logic into OpenCut as
a proper import action.

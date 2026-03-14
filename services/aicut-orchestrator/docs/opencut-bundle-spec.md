# OpenCut Bundle Spec

## Status

Draft for MVP integration between `aicut` and `OpenCut`.

## File Extension

`.opencut`

Use a zip container.

## Archive Layout

```text
project.opencut
├── project.json
├── manifest.json
└── media/
    ├── <mediaId>-<original-name>.mp4
    ├── <mediaId>-<original-name>.mov
    └── ...
```

## `project.json`

This is the OpenCut-compatible serialized project payload.

Required MVP fields:

- `metadata`
- `scenes`
- `currentSceneId`
- `settings`
- `version`
- `timelineViewState`

MVP scene constraints:

- exactly one main scene
- exactly one main video track
- only video elements are guaranteed

## `manifest.json`

Owned by `aicut`, not by OpenCut.

Example:

```json
{
  "schemaVersion": 1,
  "projectName": "demo-reel-30s",
  "targetDurationSec": 30,
  "exportedAt": "2026-03-12T10:00:00Z",
  "projectFile": "project.json",
  "assets": [
    {
      "mediaId": "asset-1",
      "bundledFile": "media/asset-1-interview-a.mp4",
      "originalName": "interview-a.mp4",
      "type": "video",
      "duration": 42.13
    }
  ]
}
```

## Import Behavior

OpenCut importer should:

1. unzip archive
2. parse `manifest.json`
3. parse `project.json`
4. validate that every referenced `mediaId` exists in manifest
5. write bundled media files into OPFS
6. write project JSON into IndexedDB
7. load project through normal `ProjectManager`

## Rejected MVP Options

- absolute local file paths as the primary contract
- writing directly into OpenCut browser storage from `aicut`
- embedding large media blobs inside the project JSON

## Compatibility Rule

The importer should reject unknown future major schema versions instead of guessing.

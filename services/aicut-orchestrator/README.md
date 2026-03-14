# aicut

`aicut` is a stitched MVP for automatic highlight editing from multiple video assets.

It is intentionally **not** a new media engine. It reuses mature open-source projects:

- `faster-whisper` or external `WhisperX` JSON for transcript + word timestamps
- `pyannote-audio` for optional speaker diarization
- `PySceneDetect` for visual scene segmentation
- `OpenTimelineIO` for timeline representation
- `ffmpeg` for extraction, concat, and final render
- `AutoCrop-Vertical` remains an optional post-process outside this repo

This repo only owns the thin orchestration layer:

- asset ingest config
- transcript + scene candidate generation
- simple highlight scoring
- duration-constrained clip selection
- internal timeline project assembly
- OTIO export
- ffmpeg render

## What This MVP Does

- takes multiple source assets from a YAML config
- transcribes them with `faster-whisper` or loads existing `WhisperX` JSON
- optionally assigns speakers with `pyannote-audio`
- detects scene boundaries with `PySceneDetect`
- generates candidate clips bounded by transcript segments and scenes
- selects clips to fit a strict target duration
- builds an internal timeline project
- writes an OTIO timeline from that project
- writes an OpenCut-compatible serialized project JSON from that project
- renders the final cut from that project with `ffmpeg`

## Internal Timeline Project

This repo now treats the edit as a first-class project, not just a list of chosen clips.

The internal project model contains:

- project metadata
- one or more tracks
- source in/out points
- timeline in/out points
- clip placement order on the final timeline

That project is the shared contract for:

- manifest export
- OTIO export
- OpenCut project export
- ffmpeg render
- future NLE export adapters

## OpenCut Export

The pipeline now writes:

- `*.opencut`
- `*.opencut-project.json`
- `*.opencut-project.media.json`

The bundle is the intended MVP handoff artifact.
The JSON and media manifest remain as debug artifacts.

Current limitation:

- OpenCut stores media files in browser storage (`IndexedDB` + `OPFS`), so this repo can export the project structure now, but it does not yet inject the media files into OpenCut storage automatically.
- This repo does include a same-origin browser helper that installs a drag-and-drop import panel inside an OpenCut tab for prototype use.

## What This MVP Does Not Do Yet

- strong multimodal highlight ranking
- music beat alignment
- complex narrative planning
- automatic multi-cam sync beyond manual offsets
- built-in vertical reframing

## Install

```bash
python3 -m venv .venv
source .venv/bin/activate
pip install -e .
```

Optional diarization:

```bash
pip install -e ".[diarization]"
```

System dependency:

- `ffmpeg` must be available in `PATH`

## Run

Prepare a config based on [examples/basic.yaml](examples/basic.yaml), then:

```bash
aicut build --config examples/basic.yaml
```

To enable Grok semantic scoring, set:

```bash
export AICUT_GROK_BASE_URL="https://apileon.leonai.top"
export AICUT_GROK_API_KEY="YOUR_API_KEY"
export AICUT_GROK_MODEL="grok-4.1-thinking"
```

Then set `grok.enabled: true` in your build config. The Grok layer sends each top
candidate clip to `/grok/v1/responses`, requests a strict JSON object with:

- `semantic_score`
- `summary`
- `tags`

The adapter also strips `xai:tool_usage_card` blocks and similar XML-like noise
from Grok responses before JSON extraction so stray tool traces do not corrupt
highlight scoring.

Successful Grok responses are cached per candidate prompt under
`output/.cache/grok/`. Cache keys include the prompt text, Grok model,
instructions, and prompt version so repeated builds can reuse prior semantic
analysis without issuing the same request again.

Transient Grok failures now retry automatically for retryable upstream errors
such as `429` and `503`. If a candidate still fails, the failure is cached for a
short TTL so repeated builds do not hammer the same broken request immediately.

For the fastest OpenCut prototype handoff, print or copy the browser import helper:

```bash
aicut opencut-import-script --copy
```

Then open OpenCut, paste the script into DevTools once, and drop the exported
`.opencut` bundle onto the floating import panel.

## Open-Source Projects This Repo Is Built Around

- `faster-whisper`: https://github.com/SYSTRAN/faster-whisper
- `WhisperX`: https://github.com/m-bain/whisperX
- `pyannote-audio`: https://github.com/pyannote/pyannote-audio
- `PySceneDetect`: https://github.com/Breakthrough/PySceneDetect
- `OpenTimelineIO`: https://github.com/AcademySoftwareFoundation/OpenTimelineIO
- `auto-editor`: https://github.com/WyattBlue/auto-editor
- `AutoCrop-Vertical`: https://github.com/kamilstanuch/Autocrop-vertical

## Practical Notes

- If you already have `WhisperX` outputs, point each asset to `transcript_path` and skip internal ASR.
- If you need strict 15s/30s/60s output, the selector targets that duration and can accept a small tolerance via `assembly.target_tolerance_sec` after safe trim/extension.
- For assets that need manual sync, use per-asset `offset_sec`.

## Planning Docs

- [Implementation Plan](docs/implementation-plan.md)
- [Fast MVP Plan](docs/fast-mvp-plan.md)
- [Development Log](docs/development-log.md)
- [OpenCut Bundle Spec](docs/opencut-bundle-spec.md)
- [OpenCut Import Spike](docs/opencut-import-spike.md)
- [Landing Checklist](docs/landing-checklist.md)

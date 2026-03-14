# Development Log

## 2026-03-13

### Repository Setup

- Initialized Git history for this project locally.
- Reconstructed the recent work into atomic commits so the feature history is readable and reviewable.

### Commit Timeline

1. `baab500` `feat(core): bootstrap auto editing pipeline`
2. `00e4b1b` `feat(grok): add semantic clip scoring integration`
3. `bc86044` `fix(selector): allow near-target duration tolerance`
4. `3f509cb` `feat(cache): persist grok candidate analysis results`

### Core MVP Status

- Automatic multi-asset edit pipeline is implemented.
- OpenCut export bundle generation is implemented.
- Browser-side OpenCut import spike script is included for same-origin prototype validation.

### Grok Integration Status

- Added candidate-level Grok semantic scoring through `/grok/v1/responses`.
- Prompt contract now requires structured JSON output:
  - `semantic_score`
  - `summary`
  - `tags`
- Added cleanup for `xai:tool_usage_card` and related XML-like response noise before JSON extraction.
- Added local Grok response caching under `output/.cache/grok/`.

### Selector Stability

- Relaxed the selector from exact-only duration matching to near-target matching with tolerance.
- This prevents real-world candidate sets from failing when they miss the target by only a few frames.

### Real Video Validation

Validated against:

- `/Users/leongong/Downloads/视频测试/模板视频1.mp4`

Observed pipeline behavior:

- scene detection completed
- candidate generation completed
- Grok semantic analysis completed
- final render completed
- OTIO / OpenCut / manifest outputs generated

Generated example output:

- `output/real-video-test/template_video_1_cut.mp4`

### Current Known Gaps

- OpenCut formal in-product import is still not implemented in the OpenCut repository.
- `av` and `cv2` emit duplicate FFmpeg dylib warnings on macOS during local runs, but current builds still complete.
- Grok upstream may still return transient `503` failures for some candidates; successful responses are cached, but retry policy is still basic.

### Verification Snapshot

- Full test suite passed locally: `12 passed`

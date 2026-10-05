# OPT-029A-HOTFIX-02B — Asset Card Multi-View Preview

EXPERIMENTAL / HUMAN PILOT PENDING. Frontend-only.

Asset cards select authoritative current first, followed by usable kind-specific Reference Pack views. MAIN_PREVIEW fills missing views. Deduplication uses artifact/attachment identity, including the current baseline source job. FAILED/STALE/REJECTED jobs are excluded using existing job/candidate metadata. No generation, adoption or Truth semantics changed.

1 image stays single; 2/3 use columns; 4 use a compact 160px 2x2 grid. Subject images use intrinsic contain sizing. Environment remains a single cover image. Image click opens the existing shared Lightbox without opening Drawer; caption/blank card opens Drawer. Drawer, Candidate and Storyboard Lightbox remain unchanged.

IntersectionObserver requests pack artifacts only for visible cards. Scope guards reject late responses. Existing main/baseline loading is unchanged. Visible artifacts are full-resolution and cached until scope reset; no new thumbnail API or backend changes. Browsers without IntersectionObserver do not prefetch reference pack artifacts; Drawer can still load its references.

Validation:
- Focused card/interaction tests: 18 passing.
- Full frontend tests: 196 passing.
- Frontend build-only with explicit vite.config.ts: passing.
- Standard type-check: BLOCKED by pre-existing TS5103. Supplemental no-emit diagnostic reports existing non-pilot errors; not claimed passing.
- Browser visual Human Pilot not executed; mounted interaction tests are engineering evidence.

Backend unchanged: 0ff265a3f99b3c818f33ce7bdb31b8deae87eaad. Stable branches unchanged. No model/Comfy calls, downloads, image generation, protected DB access or Project Truth edits. No PR.

Human Pilot: Ctrl+F5; inspect Pegasus/whale/ship card views; click each view to inspect same-asset Lightbox arrows; click caption to open Drawer and verify Current Version + Other References remain.

FOLLOW-UP STILL OPEN: non-human DERIVE_VIEW routing consistency.

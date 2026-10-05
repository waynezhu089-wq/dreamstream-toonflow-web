# OPT-029A-HOTFIX-02C — Hero card layout and click-away Drawer

EXPERIMENTAL / HUMAN PILOT PENDING. Frontend-only.

Hero priority: confirmed baseline/current, type main (human FRONT then FACE; creature/vehicle/prop HERO_3Q), MAIN_PREVIEW, other usable image. Existing identity dedup and rejected/stale/failed exclusion remain. No adoption or Project Truth changes.

Layout: single full area; two 65/35; three 62/38 with hero spanning both rows; four 60/40 with hero spanning three rows. Subject previews remain intrinsic contain; tooltip labels and same-asset shared Lightbox remain.

Studio blank-click closes Drawer only outside Drawer, Agent, cards, interactive elements, images/Lightbox and resize boundaries. Another card switches directly. Capture-phase Escape checks whether Lightbox is open before its close handler: first Esc closes Lightbox only; subsequent Esc closes Drawer.

Validation: full frontend 198 passing; focused card/interaction 20 passing; build passing. Standard type-check remains BLOCKED by pre-existing TS5103. Browser visual Human Pilot not performed.

Backend unchanged 0ff265a3f99b3c818f33ce7bdb31b8deae87eaad. No generation, model/Comfy calls, DB writes, schema or workflow changes. Stable unchanged. Existing visible-card lazy loading retained.

Human Pilot: Ctrl+F5; check readable hero plus smaller complete references; image clicks open Lightbox only; caption opens Drawer; blank Studio closes it; Drawer/Agent/buttons/resize do not close it; first Esc closes Lightbox and second closes Drawer; select another asset to switch Drawer directly.

FOLLOW-UP STILL OPEN: non-human DERIVE_VIEW routing consistency.

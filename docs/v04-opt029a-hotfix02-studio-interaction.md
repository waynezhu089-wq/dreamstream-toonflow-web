# OPT-029A-HOTFIX-02 — Studio interaction cleanup

Status: EXPERIMENTAL / HUMAN PILOT PENDING

Frontend-only implementation: unified Agent feed with exact turn-linked candidates and lazy history; scoped action feedback; persisted-job activity and elapsed time; shared image lightbox; simultaneous reference gallery; human-readable Studio chrome; independently resizable composer; scope-safe response and image recovery.

No Project Truth, workflow, generation routing, backend or database changes. Backend remains 35accfc76ddf8877d15d7cbfc800054288b37c9c. No model/Comfy calls, downloads, installations or protected database access. Existing local Vite config overrides are excluded.

## Verification

- `node --test tests/v04-studio-interaction.test.cjs`: 12/12 passing mounted/focused tests.
- `node --test tests/*.test.cjs`: 190/190 passing.
- Backend unchanged regression `node --test tests/v04-asset-image-edit.test.cjs`: 29 passing, 3 skipped, 0 failed.
- `npm run build-only -- --config vite.config.ts`: passing.
- `npm run type-check`: blocked by pre-existing TS5103 in tsconfig.app.json. Diagnostic run with ignoreDeprecations 5.0 and no incremental emit still reports existing errors outside pilot; no pilot errors. Type checking is not claimed passing.
- Mounted tests cover turn association, candidate settlement, duplicate prevention, preview/adopt feedback, failure retention, lightbox, reference gallery, lazy loading, composer persistence and stale scope responses.
- Browser visual Human Pilot has not been performed. Automated checks do not establish visual acceptance.

## Human Pilot

1. Refresh Studio: verify historical main preview, shared Agent conversation and pending job state restore.
2. Send one image-edit request: verify a single continuous feed, original-turn result and truthful working/failure/success feedback.
3. Open main image from Card, Drawer or Agent: verify Fit/100%, wheel zoom, pan, Escape and same-group arrows.
4. Open character references: verify all available views appear together, without promoting a viewed reference to current truth.
5. Resize composer, refresh, then change project/unit during a pending request: verify height restores and old results never mutate the new scope.

FOLLOW-UP REQUIRED: non-human derive routing consistency. Intentionally not changed by this UX ticket.

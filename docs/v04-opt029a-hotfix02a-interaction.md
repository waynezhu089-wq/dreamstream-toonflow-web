# OPT-029A-HOTFIX-02A — Interaction feedback and candidate semantics

EXPERIMENTAL / HUMAN PILOT PENDING.

- Independent candidate action keys: adopt-preview, adopt-confirm, continue, reject. Each button reads only its own state; duplicate in-flight requests remain blocked. Failures and explicit confirmation remain at the original picture.
- Agent edit history filters generationIntent=ASSET_IMAGE_EDIT and excludes automatic jobs. Asset World/Drawer/Reference Gallery APIs and rendering remain unchanged. A manual edit based on an automatic first draft is still a genuine edit candidate.
- Public draft/candidate DTOs expose nullable startedAt/completedAt, preserve createdAt/updatedAt and expose generationIntent for classification. No historical row backfill, schema, generation routing or Truth changes.
- RUNNING uses startedAt then createdAt. Completed duration requires finite startedAt and completedAt; unknown historical duration is omitted.

Validation: frontend focused 15 passing; full 193 passing; build passing. Standard type check remains BLOCKED by pre-existing TS5103. Backend focused 30 passing, 3 live tests skipped; tsc/build passing. Full backend first run encountered post-test ENOENT removing a temporary worker lease; serial rerun reproduced the same cleanup race. Final full rerun after test-only cleanup fix: 374 passing, 6 skipped, 0 failed (380 total). Test fixture cleanup now waits for the actual temporary lease release before deleting its directory; no production worker implementation change.

Stable branches, protected DB, accepted semantics, Visual Spec/Prompt IR and Comfy workflows untouched. No real model, Comfy or image generation executed. No PR.

FOLLOW-UP STILL OPEN: non-human DERIVE_VIEW routing consistency.

Human Pilot: refresh Studio; Continue changes only its own button and focuses composer; whale automatic views stay in Other References; a deliberate manual edit appears as Candidate; adopt uses original-picture preview then confirmation. No visual acceptance claimed by automated tests.

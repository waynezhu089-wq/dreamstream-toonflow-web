# OPT-028C-HOTFIX-03A — Legacy MAIN_PREVIEW Recovery

Status: EXPERIMENTAL / HUMAN PILOT PENDING

Root cause: legacy display required the session-local imageJobId and WAITING_IMAGE_EXECUTOR stage. Persisted successful outputs remained intact, but absent draft state hid them after reload.

Fix: retain exact-ID behavior when an ID exists. Otherwise recover first valid persisted MAIN_PREVIEW job in server createdAt DESC order, scoped by projectId/scriptId/canonicalKey/sourceAssetRevision. Accept null or SUBJECT_MAIN_PREVIEW purpose; exclude STALE/CANCELLED and known non-main output roles. Studio supplies its current scope even when no draft package remains. A successful recovered job no longer needs the transient draft stage to display.

Priority unchanged: selected purpose, Reference Pack display, legacy main, review output, confirmed real reference. No enqueue, generation, backend or truth changes.

Verification:
- node --test tests/v04-studio.test.cjs tests/v04-main-preview-restore.test.cjs: 15/15 PASS.
- node --test tests/*.test.cjs: 165/165 PASS.
- npm run build-only: PASS (2m37s).
- npm run type-check: FAILED, existing TS5103 ignoreDeprecations configuration; sandbox also reports TS5033 shared build-info permission errors.
- Diagnostic vue-tsc with ignoreDeprecations 5.0 / nonincremental: existing unrelated errors remain; no error in modified modules. Not a type-check pass.
- Read-only actual experimental DB: CHAR-001 revision 2, project 1790941805789310/script 4, successful Z_IMAGE_TURBO_SUBJECT_DRAFT_V1 job db90523c-674c-41a9-b120-c3f9693f310b, artifact f19bbdd3-109b-4cfa-bd29-b334217b66df MAIN_PREVIEW. Updated helper recovers this actual job with draftPackage=null.
- Mounted Vue/jsdom test unmounts/remounts a fresh card with no draft, runs actual Studio imageFor, and verifies image visible. Identity, scope, statuses, latest valid ordering, non-main roles and priority covered.
- Existing live frontend and module HTTP 200, backend 10589 and frontend 50189 remain running. Browser automation unavailable (kernel assets error); actual human page visual verification remains pending.

Backend unchanged: 76d9beb3036eae8a594efadf919dd9de279ba4a2.
Stable backend: 194340d6a37c6ef03a6d157f5848490f67c2e834.
Stable frontend: 986fb0ff32fd257498974c6c87cf4c47f360cb03.
No Stable userdata access, no model/Comfy calls, no image regeneration.

Human retest: reload existing Studio project/script, confirm CHAR-001 main image restores automatically. Open Reference Pack purposes and confirm their explicit selection remains independent. No regeneration required.

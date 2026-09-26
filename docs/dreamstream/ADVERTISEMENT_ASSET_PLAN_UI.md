# Advertisement Asset Plan UI (DS-FE-002)

Only advertisement projects use the new asset preparation page. Legacy asset center and asset-selector mode keep their existing UI; the short-drama asset generation page is unchanged.

The page shows each material's name, category, required/optional setting, readable source requirement, bound asset and server-derived readiness. Users can add/edit/delete items, bind/unbind current-unit assets, or upload a real image through the existing uploadClip endpoint and bind the returned asset. AI-allowed items can use existing assets or open the existing asset-generation page; there is no new generation workflow.

## Context and Gate

- Navigation carries scriptId in the route query and remembers selection by project for the current session. The asset preparation page validates the selection against the project's unit list. A sole unit can be selected directly; multiple units require the current selection or a user choice. Invalid explicit IDs never fall back to another unit.
- All Plan, workflow-state and confirmation requests send numeric projectId + scriptId. The project entry, workbench navigation and Production mount guard use the new Gate contract. Advertisement Production initialization preserves the selected unit instead of resetting to the first unit; switching units re-enters that same guarded route.
- Bind choices come from the selected unit's relatedAssets returned by script/getScrptApi. There is no client inference of source provenance. Real-source choices are explicitly marked as requiring server validation; AI images are not advertised as valid real material. Missing old upload evidence requires re-upload under the existing backend policy.
- Only server prepared=true enables confirmation. The confirmation response must match the submitted project/unit and return ready=true before navigation. Production independently rechecks Gate; a local readiness count never grants access.
- Plan mutations refresh Plan, Gate and candidate assets. Users can refresh status after external asset generation. Errors remain visible, including upload-success/binding-failure. Backend enum identifiers are translated in displayed errors.
- Unit changes clear old rows, drafts, choices, errors and confirmation state. Request generations discard late reads, saves and confirmations from previous contexts; delayed file reads do not upload into a newly selected unit. Editing locks the unit selector until saved/cancelled, and operation controls prevent duplicate submissions.

## Validation

Run `npm run test:advertisement-asset-plan` and `npm run test:generate-flow-image` (Node 22+). The new suite mounts the actual Vue component in jsdom, executes the actual reactive controller and navigation functions, and checks UI actions/API payloads with deterministic server responses. jsdom ~19.0.0 is explicitly declared as a dev dependency; that exact range was already present transitively in yarn.lock, so the lockfile does not change.

12 new tests and 7 existing tests pass. Coverage includes CRUD/stable keys, binding/unbinding, real upload and source rejection, source-specific actions, prepared/ready guards, explicit current scriptId, late responses after switching units, current-unit assets, Production selection preservation and non-advertisement navigation/legacy rendering isolation.

The new component/controller/context helper pass a focused strict vue-tsc check using an isolated axios boundary declaration. Actual changed Vue scripts/templates compile. Vite production build passes. Full repository type-check remains blocked by the pre-existing tsconfig.app.json ignoreDeprecations=6.0 incompatibility; this task does not change that configuration or claim the full Gate audit passes.

A local Edge browser preview of the actual component with synthetic API responses was inspected at desktop and narrow widths, including the editor. This is not a fresh-project user-flow acceptance run. No real business database, paid models or backend changes were used.

No Brief-to-plan generation, auto planning, version locks, confirmation snapshots or other Audit repairs. The fresh-advertisement Brief → Plan → Preparation → Gate user-flow validation remains the next task, pending acceptance.

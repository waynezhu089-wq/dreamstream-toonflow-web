const assert = require('node:assert/strict');
const { test } = require('node:test');
const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');
const root = path.resolve(__dirname, '..');
const cache = new Map();
function load(file) {
  file = path.resolve(root, file);
  if (cache.has(file)) return cache.get(file);
  const module = { exports: {} };
  const code = ts.transpileModule(fs.readFileSync(file, 'utf8'), { compilerOptions: {
    module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022,
  } }).outputText;
  new Function('module', 'exports', 'require', code)(module, module.exports, name => {
    if (name.startsWith('.')) return load(path.join(path.dirname(file), name + '.ts'));
    return require(name);
  });
  cache.set(file, module.exports);
  return module.exports;
}
const { runStudioAssetDraftPipeline, freshStudioPackage } = load('src/views/pilot/studioAssetDraftPipeline.ts');
const asset = (i, extra = {}) => ({ canonicalKey: `CHAR-${i}`, name: `Asset ${i}`, revision: 1,
  status: 'ACTIVE', sourcePolicy: 'AI_ALLOWED', category: 'CHAR', assetKind: 'HUMAN_CHARACTER', ...extra });
function harness(assets, extra = {}) {
  const calls = { propose: [], compile: [], packages: [], visual: [], progress: [], writes: 0 };
  const proposals = extra.proposals || {};
  const packages = extra.packages || {};
  let current = true;
  const input = { projectId: 11, scriptId: 2, assets, visualSpecs: extra.visualSpecs || [], proposals, packages,
    isCurrent: () => current,
    propose: async keys => {
      calls.propose.push(keys);
      if (extra.onPropose) await extra.onPropose(keys, () => { current = false; });
      const failed = keys.filter(key => extra.failKeys?.includes(key));
      return { candidates: keys.filter(key => !failed.includes(key)).map(canonicalKey => ({ canonicalKey,
        sourceAssetRevision: 1, spec: { visualIdentitySummary: canonicalKey }, qualityWarnings: [] })),
        failures: failed.map(canonicalKey => ({ canonicalKey, name: canonicalKey, code: 'MODEL_FAILED', message: 'safe failure' })) };
    },
    compile: async items => { calls.compile.push(items); return { candidates: items.map(item => ({
      canonicalKey: item.canonicalKey, generationIntent: 'CHARACTER_TURNAROUND',
      draftPromptIR: { identityBlock: { canonicalKey: item.canonicalKey } },
      draftRenderedPrompt: { text: item.canonicalKey }, previewPlan: { previewKind: 'CHARACTER' },
      completenessIssues: extra.incompleteKeys?.includes(item.canonicalKey) ? ['silhouette'] : [],
    })), failures: [] }; },
    onVisual: value => { calls.visual.push(value); proposals[value.canonicalKey] = value; },
    onPackage: value => { calls.packages.push({ ...value }); packages[value.canonicalKey] = value; },
    onProgress: value => calls.progress.push(value),
  };
  return { input, calls, packages, setCurrent: value => { current = value; } };
}

for (const count of [0, 1, 6, 7, 13]) test(`Studio prepares ${count} assets in bounded sequential batches`, async () => {
  const h = harness(Array.from({ length: count }, (_, i) => asset(i + 1)));
  const result = await runStudioAssetDraftPipeline(h.input);
  assert.equal(result.aborted, false);
  assert.deepEqual(h.calls.propose.map(batch => batch.length), count === 0 ? [] : count === 1 ? [1] : count === 6 ? [6] : count === 7 ? [6, 1] : [6, 6, 1]);
  assert.ok(h.calls.propose.every(batch => batch.length <= 6));
  assert.ok(h.calls.compile.every(batch => batch.length <= 6));
  assert.equal(result.progress.ready, count);
  assert.equal(result.progress.remaining, 0);
  assert.equal(Object.values(h.packages).filter(x => x.stage === 'WAITING_IMAGE_EXECUTOR').length, count);
  assert.equal(h.calls.writes, 0, 'pipeline has no Apply or confirmed-truth write callback');
});

test('confirmed/current spec and fresh proposal are reused; stale draft is regenerated; real assets are excluded', async () => {
  const confirmed = { canonicalKey: 'CHAR-1', sourceAssetRevision: 1, revision: 3, effectiveStatus: 'CONFIRMED', spec: { visualIdentitySummary: 'Confirmed' } };
  const proposal = { canonicalKey: 'CHAR-2', sourceAssetRevision: 1, spec: { visualIdentitySummary: 'Existing draft' } };
  const stale = { canonicalKey: 'CHAR-3', sourceAssetRevision: 0, spec: { visualIdentitySummary: 'Stale draft' } };
  const h = harness([asset(1), asset(2), asset(3), asset(4, { status: 'RETIRED' }), asset(5, { category: 'BRAND', sourcePolicy: 'REAL_REQUIRED', assetKind: 'BRAND_MARK' })],
    { visualSpecs: [confirmed], proposals: { 'CHAR-2': proposal, 'CHAR-3': stale } });
  const result = await runStudioAssetDraftPipeline(h.input);
  assert.deepEqual(h.calls.propose, [['CHAR-3']]);
  assert.equal(h.packages['CHAR-1'].visualSource, 'CONFIRMED');
  assert.equal(h.packages['CHAR-1'].sourceVisualRevision, 3);
  assert.equal(h.packages['CHAR-2'].visualSource, 'PROPOSAL');
  assert.equal(h.packages['CHAR-2'].visualSpecDraft.visualIdentitySummary, 'Existing draft');
  assert.equal(h.packages['CHAR-4'], undefined);
  assert.equal(h.packages['CHAR-5'], undefined);
  assert.equal(result.progress.total, 3);
  const again = await runStudioAssetDraftPipeline({ ...h.input, visualSpecs: [confirmed] });
  assert.equal(again.progress.ready, 3);
  assert.deepEqual(h.calls.propose, [['CHAR-3']], 'fresh packages do not repeat model calls');
  assert.equal(freshStudioPackage(asset(1), confirmed, null, h.packages['CHAR-1']), true);
});

test('partial failures and quality issues retain all successful drafts and continue later batches', async () => {
  const h = harness(Array.from({ length: 13 }, (_, i) => asset(i + 1)),
    { failKeys: ['CHAR-2', 'CHAR-8'], incompleteKeys: ['CHAR-10'] });
  const result = await runStudioAssetDraftPipeline(h.input);
  assert.deepEqual(h.calls.propose.map(batch => batch.length), [6, 6, 1]);
  assert.deepEqual([result.progress.ready, result.progress.attention, result.progress.failed, result.progress.remaining], [10, 1, 2, 0]);
  assert.equal(h.packages['CHAR-13'].stage, 'WAITING_IMAGE_EXECUTOR');
  assert.equal(h.packages['CHAR-10'].stage, 'NEEDS_ATTENTION');
  assert.equal(h.packages['CHAR-8'].stage, 'FAILED');
  assert.equal(h.packages['CHAR-8'].error.code, 'MODEL_FAILED');
});

test('late batch response cannot write a switched project or unit', async () => {
  const h = harness([asset(1), asset(2)], { onPropose: async (_keys, switchScope) => switchScope() });
  const result = await runStudioAssetDraftPipeline(h.input);
  assert.equal(result.aborted, true);
  assert.deepEqual(h.calls.compile, []);
  assert.deepEqual(h.calls.visual, []);
  assert.equal(h.packages['CHAR-1'].stage, 'GENERATING_SPEC');
  assert.equal(h.packages['CHAR-2'].stage, 'GENERATING_SPEC');
});

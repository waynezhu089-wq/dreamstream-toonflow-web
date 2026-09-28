const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');

function load(relative, requests = async () => { throw Error('unexpected request'); }) {
  const filename = path.resolve(__dirname, '..', relative);
  const compiled = ts.transpileModule(fs.readFileSync(filename, 'utf8'), { compilerOptions: {
    module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true,
  } }).outputText;
  const mod = { exports: {} };
  const localRequire = name => name === '@/utils/axios' ? { post: async (url, body) => ({ data: await requests(url, body) }) } :
    name === 'vue' ? require('vue') : require(name);
  new Function('require', 'module', 'exports', compiled)(localRequire, mod, mod.exports);
  return mod.exports;
}
const coordinatorFile = 'src/views/production/revision/coordinator.ts';
const proposalFile = 'src/views/production/revision/proposalPlan.ts';
const controlled = { managed: true, definition: { schemaVersion: 2, stages: [{ stageKey: 'storyboard-board' }] } };
const review = { gateDriving: true, targetAdapterKey: 'storyboard.semantic.v2' };

async function setup(t, responder) {
  const calls = [];
  const revision = load(coordinatorFile, async (url, body) => { calls.push({ url, body: JSON.parse(JSON.stringify(body)) });
    if (url === '/productionProfiles/resolve') return controlled;
    if (url === '/supervisor/current/resolve') return review;
    return responder(url, body); }).useStoryboardRevision();
  let generation = 1, refreshes = 0;
  const token = () => ({ projectId: 1, scriptId: 2, generation });
  revision.bind({ current: token, isCurrent: value => value?.projectId === 1 && value?.scriptId === 2 && value?.generation === generation,
    invalidate: () => { generation++; revision.setScope(token()); }, refresh: async () => { refreshes++; } });
  revision.setScope(token());
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(revision.state.mode, 'CONTROLLED_V2');
  return { revision, calls, token, get refreshes() { return refreshes; } };
}

test('controlled EDIT previews then retries identical frozen Confirm and refreshes only after APPLIED', async t => {
  let confirms = 0;
  const fixture = await setup(t, (url) => {
    if (url.endsWith('/preview')) return { previewHash: 'hash', baseRevisionEpoch: 3, proposedSemantic: [] };
    if (url.endsWith('/confirm')) { confirms++; if (confirms === 1) throw { data: { reason: 'REVISION_CONCURRENT_UPDATE' } };
      return { delivery: 'APPLIED', epochAfter: 4 }; }
  });
  const { revision, calls } = fixture;
  revision.open('MANUAL_EDIT', [{ type: 'EDIT', storyboardId: 7, patch: { prompt: 'new' } }]);
  await revision.previewDraft();
  revision.state.humanReason = 'Human reviewed';
  await revision.confirm();
  const bodies = calls.filter(call => call.url.endsWith('/confirm')).map(call => call.body);
  assert.equal(bodies.length, 2); assert.deepEqual(bodies[0], bodies[1]);
  assert.equal(revision.state.status, 'APPLIED'); assert.equal(fixture.refreshes, 1);
});

test('response lost replays same ID/body; stale re-preview needs a new ID and keeps draft', async t => {
  let confirms = 0;
  const { revision, calls } = await setup(t, url => {
    if (url.endsWith('/preview')) return { previewHash: 'hash', baseRevisionEpoch: 0 };
    if (url.endsWith('/confirm')) { confirms++; if (confirms === 1) throw Error('network'); return { delivery: 'REPLAYED' }; }
  });
  revision.open('MANUAL_EDIT', [{ type: 'EDIT', storyboardId: 7, patch: { videoDesc: 'new' } }]);
  const firstId = revision.state.revisionId;
  await revision.previewDraft(); revision.state.humanReason = 'Reason'; await revision.confirm();
  const bodies = calls.filter(call => call.url.endsWith('/confirm')).map(call => call.body);
  assert.deepEqual(bodies[0], bodies[1]); assert.equal(revision.state.status, 'APPLIED');
  revision.open('MANUAL_EDIT', [{ type: 'EDIT', storyboardId: 7, patch: { videoDesc: 'newer' } }]);
  await revision.previewDraft(); await revision.previewDraft(true);
  assert.notEqual(firstId, revision.state.revisionId);
  assert.equal(revision.state.draft.operations[0].patch.videoDesc, 'newer');
});

test('Agent proposal dedupes, rejects busy/cross-unit, and never edits authoritative rows', async t => {
  const { revision } = await setup(t, () => ({}));
  const candidate = { prompt: 'p' };
  const proposal = { proposalId: 'id-1', projectId: 1, scriptId: 2, kind: 'ADD', candidate };
  assert.equal(revision.receiveProposal(proposal).status, 'PENDING_HUMAN');
  assert.equal(revision.receiveProposal(proposal).status, 'PENDING_HUMAN');
  assert.equal(revision.receiveProposal({ ...proposal, proposalId: 'id-2' }).status, 'PROPOSAL_BUSY');
  assert.equal(revision.receiveProposal({ ...proposal, scriptId: 3 }).status, 'CONTEXT_MISMATCH');
  assert.deepEqual(revision.state.proposal.candidate, candidate);
});

test('cancel keeps the local draft; applying a separate manual edit does not discard a pending Agent proposal', async t => {
  const { revision } = await setup(t, url => url.endsWith('/preview')
    ? { previewHash: 'hash', baseRevisionEpoch: 0 } : { delivery: 'APPLIED' });
  const proposal = { proposalId: 'p1', projectId: 1, scriptId: 2, kind: 'ADD', candidate: { prompt: 'agent' } };
  revision.receiveProposal(proposal);
  revision.open('MANUAL_EDIT', [{ type: 'EDIT', storyboardId: 7, patch: { prompt: 'manual' } }]);
  revision.close();
  assert.equal(revision.state.draft.operations[0].patch.prompt, 'manual');
  await revision.previewDraft();
  revision.state.humanReason = 'reviewed';
  await revision.confirm();
  assert.equal(revision.state.status, 'APPLIED');
  assert.equal(revision.state.proposal.proposalId, 'p1');
});

test('semantic-first ADD omits index and uses complete REORDER; invalid Agent candidate refused', () => {
  const proposal = load(proposalFile);
  const item = { track: 'main', duration: 3, prompt: '', videoDesc: '', productionMode: 'AI_TEXT_TO_IMAGE',
    primaryAssetId: null, associateAssetsIds: [], referenceAssetIds: [], referenceAssetGroupIds: [] };
  const add = proposal.proposalOperations('ADD', item, [1, 2]);
  assert.equal(add.length, 1); assert.equal('index' in add[0].storyboard, false);
  const replace = proposal.proposalOperations('REPLACE', [item, item], [1, 2]);
  assert.deepEqual(replace.map(op => op.type), ['RETIRE', 'RETIRE', 'ADD', 'ADD', 'REORDER']);
  assert.deepEqual(replace.at(-1).order.map(row => row.clientRef), ['agentShot1', 'agentShot2']);
  assert.throws(() => proposal.semanticCandidate({ ...item, duration: 0 }), /时长/);
  assert.throws(() => proposal.semanticCandidate({ ...item, productionMode: undefined }), /生产方式/);
  assert.throws(() => proposal.semanticCandidate({ ...item, referenceAssetGroupIds: ['group'] }), /Asset Group/);
});

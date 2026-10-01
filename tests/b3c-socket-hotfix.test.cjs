const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');

const source = fs.readFileSync(path.resolve(__dirname, '../src/stores/productionAgent.ts'), 'utf8');
const ast = ts.createSourceFile('productionAgent.ts', source, ts.ScriptTarget.Latest, true);
const compile = value => ts.transpileModule(value, { compilerOptions: { target: ts.ScriptTarget.ES2022,
  module: ts.ModuleKind.CommonJS } }).outputText;
function find(check) {
  let found;
  const visit = node => { if (check(node)) found = node; ts.forEachChild(node, visit); };
  visit(ast); assert.ok(found); return found.getText(ast);
}
function method(name, scope) {
  const text = find(node => ts.isFunctionDeclaration(node) && node.name?.text === name);
  return new Function(...Object.keys(scope), `${compile(text)};return ${name};`)(...Object.values(scope));
}
function handler(event, scope) {
  const text = find(node => ts.isCallExpression(node) && node.expression.getText(ast) === 's.on' && node.arguments[0].text === event);
  const parsed = ts.createSourceFile('handler.ts', text, ts.ScriptTarget.Latest, true);
  const callback = parsed.statements[0].expression.arguments[1].getText(parsed);
  return new Function(...Object.keys(scope), `return ${compile(`(${callback})`).trim().replace(/;$/, '')}`)(...Object.values(scope));
}
function unit() {
  let scriptId = 10, projectId = 1, generation = 1;
  const captureUnit = () => ({ projectId: 1, scriptId, generation });
  const isCurrentUnit = token => !!token && token.projectId === projectId && token.scriptId === scriptId && token.generation === generation;
  const socketUnit = method('socketUnit', { captureUnit, isCurrentUnit });
  return { socketUnit, isCurrentUnit, switchScript: () => { scriptId = 11; generation++; },
    switchProject: () => { projectId = 2; generation++; } };
}
const payload = { projectId: 1, scriptId: 10, proposalId: 'p1' };
const legacy = () => ({ state: { mode: 'LEGACY' } });
const reply = () => { let result; return { callback: value => { result = value; }, get value() { return result; } }; };

test('generate from old unit ACKs mismatch immediately and never enters image production', async () => {
  const f = unit(); f.switchScript(); let calls = 0;
  const run = handler('generateStoryboard', { socketUnit: f.socketUnit, isCurrentUnit: f.isCurrentUnit,
    batchGenerateStoryboard: async () => { calls++; } });
  const ack = reply(); await run({ ...payload, ids: [7] }, ack.callback);
  assert.deepEqual(ack.value, { status: 'CONTEXT_MISMATCH', applied: false });
  assert.equal(calls, 0);
});

test('generate production failure ACKs explicitly, and late A success is acknowledged without touching B', async () => {
  const f = unit(); let release, calls = 0;
  const pending = new Promise(resolve => { release = resolve; });
  const run = handler('generateStoryboard', { socketUnit: f.socketUnit, isCurrentUnit: f.isCurrentUnit,
    batchGenerateStoryboard: async () => { calls++; return pending; } });
  const firstAck = reply(); const first = run({ ...payload, ids: [7] }, firstAck.callback);
  f.switchScript(); release([{ id: 7 }]); await first;
  assert.equal(calls, 1);
  assert.equal(firstAck.value.success, true);
  assert.equal(firstAck.value.accepted, true);
  assert.equal(firstAck.value.applied, true);
  assert.equal(firstAck.value.scopeChanged, true);
  const second = unit(), failed = handler('generateStoryboard', { socketUnit: second.socketUnit, isCurrentUnit: second.isCurrentUnit,
    batchGenerateStoryboard: async () => { throw Error('provider rejected'); } });
  const failureAck = reply(); await failed({ ...payload, ids: [7] }, failureAck.callback);
  assert.deepEqual(failureAck.value, { success: false, applied: false, error: 'provider rejected' });
});

test('Legacy ADD dispatched in A uses A scope but never pushes its late result into B', async () => {
  const f = unit(), flowData = { value: { storyboard: [] } }; let release, sent;
  const pending = new Promise(resolve => { release = resolve; });
  const run = handler('addStoryboard', { socketUnit: f.socketUnit, isCurrentUnit: f.isCurrentUnit,
    useStoryboardRevision: legacy, storyboardProductionFields: () => ({}), flowData,
    addStoryboardInfo: async (items, token) => { sent = { items, token }; return pending; },
    throttledFn: () => { throw Error('stale save'); }, $t: value => value });
  const ack = reply(); const operation = run({ ...payload, prompt: 'A', duration: 3, videoDesc: 'A', shouldGenerateImage: 'false' }, ack.callback);
  assert.equal(flowData.value.storyboard.length, 0);
  assert.deepEqual(sent.token, { projectId: 1, scriptId: 10, generation: 1 });
  f.switchScript(); flowData.value = { storyboard: [{ id: 99, prompt: 'B' }] };
  release({ dispatched: true, data: [{ id: 7, prompt: 'A' }], current: false }); await operation;
  assert.deepEqual(flowData.value.storyboard, [{ id: 99, prompt: 'B' }]);
  assert.equal(ack.value.success, true);
  assert.equal(ack.value.applied, true);
  assert.equal(ack.value.scopeChanged, true);
});

test('Legacy ADD preserves a successful HTTP result after scope changes', async () => {
  const f = unit(); let release;
  const pending = new Promise(resolve => { release = resolve; });
  const addStoryboardInfo = method('addStoryboardInfo', {
    axios: { post: async () => pending }, isCurrentUnit: f.isCurrentUnit,
  });
  const result = addStoryboardInfo([{ prompt: 'A' }], { projectId: 1, scriptId: 10, generation: 1 });
  f.switchScript(); release({ data: [{ id: 7, prompt: 'A' }] });
  assert.deepEqual(await result, { dispatched: true, data: [{ id: 7, prompt: 'A' }], current: false });
});

test('Legacy REPLACE dispatched in A uses A scope but never installs its late result in B', async () => {
  const f = unit(), flowData = { value: { storyboard: [{ id: 1 }] } }; let release, sent, saves = 0;
  const pending = new Promise(resolve => { release = resolve; });
  const run = handler('replaceStoryboard', { socketUnit: f.socketUnit, isCurrentUnit: f.isCurrentUnit,
    useStoryboardRevision: legacy, flowData, axios: { post: async (_url, body) => { sent = body; return pending; } },
    setFlowData: async () => { saves++; } });
  const ack = reply(); const operation = run({ ...payload, items: [{ prompt: 'A' }] }, ack.callback);
  assert.deepEqual(sent, { projectId: 1, scriptId: 10, data: [{ prompt: 'A' }] });
  f.switchScript(); flowData.value = { storyboard: [{ id: 99, prompt: 'B' }] };
  release({ data: [{ id: 7, prompt: 'A' }] }); await operation;
  assert.deepEqual(flowData.value.storyboard, [{ id: 99, prompt: 'B' }]);
  assert.equal(saves, 0);
  assert.equal(ack.value.success, true);
  assert.equal(ack.value.applied, true);
  assert.equal(ack.value.scopeChanged, true);
});

test('old-project ADD and REPLACE events reject before any Legacy write', async () => {
  const f = unit(); f.switchProject(); let writes = 0;
  const shared = { socketUnit: f.socketUnit, isCurrentUnit: f.isCurrentUnit, useStoryboardRevision: legacy,
    storyboardProductionFields: () => ({}), flowData: { value: { storyboard: [] } },
    addStoryboardInfo: async () => { writes++; }, axios: { post: async () => { writes++; } } };
  for (const event of ['addStoryboard', 'replaceStoryboard']) {
    const ack = reply(); await handler(event, shared)({ ...payload, items: [{ prompt: 'A' }] }, ack.callback);
    assert.deepEqual(ack.value, { status: 'CONTEXT_MISMATCH', applied: false });
  }
  assert.equal(writes, 0);
});

test('after dispatch a failed A request stays a failure, not a context mismatch', async () => {
  const f = unit(), flowData = { value: { storyboard: [] } }; let reject;
  const pending = new Promise((_resolve, fail) => { reject = fail; });
  const run = handler('replaceStoryboard', { socketUnit: f.socketUnit, isCurrentUnit: f.isCurrentUnit,
    useStoryboardRevision: legacy, flowData, axios: { post: async () => pending }, setFlowData: async () => {} });
  const ack = reply(); const operation = run({ ...payload, items: [{ prompt: 'A' }] }, ack.callback);
  f.switchScript(); reject(Error('server rejected')); await operation;
  assert.deepEqual(ack.value, { success: false, applied: false, error: 'server rejected' });
});

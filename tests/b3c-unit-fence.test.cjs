const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');
const source = fs.readFileSync(path.join(__dirname, '../src/stores/productionAgent.ts'), 'utf8');
const ast = ts.createSourceFile('productionAgent.ts', source, ts.ScriptTarget.Latest, true);
function method(name, scope) {
  let found;
  const visit = node => { if (ts.isFunctionDeclaration(node) && node.name?.text === name) found = node.getText(ast); ts.forEachChild(node, visit); };
  visit(ast); assert.ok(found, name);
  const code = ts.transpileModule(found, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS } }).outputText;
  return new Function(...Object.keys(scope), `${code}; return ${name};`)(...Object.values(scope));
}
const A = { projectId: 1, scriptId: 10, generation: 1 };

test('A image response after switch to empty B cannot install A storyboards', async () => {
  const flowData = { value: { storyboard: [] } }, episodesId = { value: 10 };
  let release;
  const response = new Promise(resolve => { release = resolve; });
  const run = method('batchGenerateStoryboard', { captureUnit: () => ({ ...A }), isCurrentUnit: token => token.scriptId === episodesId.value,
    axios: { post: () => response }, episodesId, projectId: 1, settingStore: () => ({ otherSetting: { assetsBatchGenereateSize: 1 } }), flowData });
  const pending = run([7]);
  episodesId.value = 11;
  release({ data: [{ id: 7, src: '/A.png', state: '已完成' }] });
  await pending;
  assert.deepEqual(flowData.value.storyboard, []);
});

test('A polling result after B switch is discarded', async () => {
  const flowData = { value: { storyboard: [{ id: 7, state: '生成中', src: '/old.png' }] } }, episodesId = { value: 10 };
  let release; const response = new Promise(resolve => { release = resolve; });
  const run = method('pollStoryboardImages', { captureUnit: () => ({ ...A }), isCurrentUnit: token => token.scriptId === episodesId.value,
    storyboardNotStateImageIds: { value: [7] }, storyboardPollingInFlight: false, axios: { post: () => response },
    flowData, getFlowData: async () => { throw Error('should not refresh'); } });
  const pending = run(); episodesId.value = 11;
  release({ data: [{ id: 7, state: '已完成', src: '/A-new.png' }] }); await pending;
  assert.equal(flowData.value.storyboard[0].src, '/old.png');
});

test('A scheduled save cannot write A payload under B or after Confirm generation invalidation', async () => {
  const calls = [], episodesId = { value: 10 }, unitGeneration = { value: 1 };
  const flowData = { value: { storyboard: [], script: 'A' } };
  const isCurrentUnit = token => !!token && token.scriptId === episodesId.value && token.generation === unitGeneration.value;
  const run = method('setFlowData', { captureUnit: () => ({ projectId: 1, scriptId: episodesId.value, generation: unitGeneration.value }),
    isCurrentUnit, axios: { post: async (_url, body) => calls.push(body) }, flowData, window: { $message: { error() {} } } });
  episodesId.value = 11;
  await run(10, A);
  assert.equal(calls.length, 0);
  episodesId.value = 10; unitGeneration.value = 2;
  await run(10, A);
  assert.equal(calls.length, 0);
  await run(10, { ...A, generation: 2 });
  assert.equal(calls.length, 1); assert.equal(calls[0].episodesId, 10);
});

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');
const vue = require('@vue/compiler-sfc');
const root = path.resolve(__dirname, '..');

test('Storyboard card keeps the retained image visible while generating and marks currentness honestly', () => {
  const file = path.join(root, 'src/views/production/node/storyboard.vue');
  const descriptor = vue.parse(fs.readFileSync(file, 'utf8'), { filename: file }).descriptor;
  const compiled = vue.compileTemplate({ source: descriptor.template.content, filename: file, id: 'attempt-card' });
  assert.deepEqual(compiled.errors, []);
  assert.match(descriptor.template.content, /item\.state === '已完成' \|\| item\.imageProvenance\?\.currentAttemptId/);
  for (const label of ['STALE', 'LEGACY', 'CURRENT', '正在生成新任务', '最近一次重试失败']) assert.ok(descriptor.template.content.includes(label), label);
  assert.match(descriptor.template.content, /item\.imageProvenance\?\.activeAttemptId/);
});

test('batch start retains the old image and records the new active attempt', async () => {
  const source = fs.readFileSync(path.join(root, 'src/stores/productionAgent.ts'), 'utf8');
  const ast = ts.createSourceFile('productionAgent.ts', source, ts.ScriptTarget.Latest, true);
  let method;
  function visit(node) {
    if (ts.isFunctionDeclaration(node) && node.name?.text === 'batchGenerateStoryboard') method = node.getText(ast);
    ts.forEachChild(node, visit);
  }
  visit(ast);
  assert.ok(method);
  const js = ts.transpileModule(method, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  const item = { id: 7, src: '/existing.jpg', state: '已完成', imageProvenance: { freshness: 'CURRENT', currentAttemptId: 'old', activeAttemptId: null, latestAttemptStatus: 'SUCCEEDED' } };
  const flowData = { value: { storyboard: [item] } };
  const run = new Function('axios', 'episodesId', 'projectId', 'settingStore', 'flowData', `${js};return batchGenerateStoryboard;`)(
    { post: async () => ({ data: [{ id: 7, src: null, state: '生成中', attemptId: 'new' }] }) }, { value: 10 }, 1,
    () => ({ otherSetting: { assetsBatchGenereateSize: 1 } }), flowData);
  await run([7], true);
  assert.equal(item.src, '/existing.jpg');
  assert.equal(item.imageProvenance.currentAttemptId, 'old');
  assert.equal(item.imageProvenance.activeAttemptId, 'new');
  const legacy = { id: 8, src: '/legacy.jpg', state: '已完成' };
  flowData.value.storyboard = [legacy];
  const legacyRun = new Function('axios', 'episodesId', 'projectId', 'settingStore', 'flowData', `${js};return batchGenerateStoryboard;`)(
    { post: async () => ({ data: [{ id: 8, src: null, state: '生成中' }] }) }, { value: 10 }, 1,
    () => ({ otherSetting: { assetsBatchGenereateSize: 1 } }), flowData);
  await legacyRun([8], true);
  assert.equal(legacy.src, null);
});

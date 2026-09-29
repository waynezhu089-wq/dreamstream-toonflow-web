const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');
const vue = require('vue');
const { parse } = require('vue/compiler-sfc');

const file = path.resolve(__dirname, '../src/views/production/node/storyboard.vue');
const setup = parse(fs.readFileSync(file, 'utf8'), { filename: file }).descriptor.scriptSetup.content;
const ast = ts.createSourceFile('storyboard.ts', setup, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
const watches = [];
function visit(node) {
  if (ts.isCallExpression(node) && node.expression.getText(ast) === 'watch') {
    const body = node.getText(ast);
    if (body.includes('selectedIds.value = []') || body.includes('selectedIds.value = selectedIds.value.filter')) watches.push(body);
  }
  ts.forEachChild(node, visit);
}
visit(ast);
assert.equal(watches.length, 2);
const compiled = ts.transpileModule(watches.join(';'), { compilerOptions: { target: ts.ScriptTarget.ES2022,
  module: ts.ModuleKind.CommonJS } }).outputText;

test('retired shot selection disappears after authoritative rows refresh and unit switch clears the rest', async () => {
  const storyboard = vue.ref([{ id: 7 }, { id: 8 }]);
  const selectedIds = vue.ref([7, 8]);
  const project = vue.ref({ id: 1 }), episodesId = vue.ref(10);
  const compositeShot = vue.ref({ id: 7 }), skillShot = vue.ref({ id: 7 }), capabilityShot = vue.ref({ id: 7 });
  new Function('watch', 'storyboard', 'selectedIds', 'project', 'episodesId', 'compositeShot', 'skillShot', 'capabilityShot', compiled)(
    vue.watch, storyboard, selectedIds, project, episodesId, compositeShot, skillShot, capabilityShot);
  storyboard.value = [{ id: 8 }];
  await vue.nextTick();
  assert.deepEqual(selectedIds.value, [8]);
  episodesId.value = 11;
  await vue.nextTick();
  assert.deepEqual(selectedIds.value, []);
  assert.equal(compositeShot.value, null);
  assert.equal(skillShot.value, null);
  assert.equal(capabilityShot.value, null);
});

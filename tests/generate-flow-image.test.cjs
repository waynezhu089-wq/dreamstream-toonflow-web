const assert = require('node:assert/strict');
const { test } = require('node:test');
const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');
const { ref } = require('vue');
const { parse, compileScript } = require('vue/compiler-sfc');

const filename = path.resolve(__dirname, '../src/views/production/components/editImage/generatedNode.vue');
const { descriptor, errors } = parse(fs.readFileSync(filename, 'utf8'), { filename });
assert.deepEqual(errors, []);
const source = ts.createSourceFile(filename + '.ts', descriptor.scriptSetup.content, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
const handler = source.statements.find(statement => ts.isFunctionDeclaration(statement) && statement.name?.text === 'handleGenerate');
assert.ok(handler, 'exercise the actual component handler, not a copied request builder');
const compiledHandler = ts.transpileModule(handler.getText(source), {
  compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS },
}).outputText;

function fixture(profile = { projectType: 'general_video', type: 'advertisement' }, scriptId = 11) {
  const project = ref(profile);
  const episodesId = ref(scriptId);
  const generating = ref(false);
  const props = {
    projectId: 7,
    data: { references: [{ image: 'logo.png' }, { image: '' }], model: 'fixture-model', quality: '1K', ratio: '16:9', prompt: 'fixture prompt', generatedImage: 'existing.png' },
  };
  const requests = [], errors = [];
  const response = { run: async () => ({ data: { url: 'generated.png' } }) };
  const axios = { post: async (url, body) => { requests.push({ url, body }); return response.run(); } };
  const handleGenerate = new Function('props', 'project', 'episodesId', 'generating', 'axios', 'window', '$t',
    compiledHandler + '\nreturn handleGenerate;')(
    props, project, episodesId, generating, axios, { $message: { error: message => errors.push(message) } }, key => key,
  );
  return { project, episodesId, generating, props, requests, errors, response, handleGenerate };
}

const originalPayload = {
  references: ['logo.png'], model: 'fixture-model', quality: '1K', ratio: '16:9', prompt: 'fixture prompt', projectId: 7,
};

test('the component script compiles with the existing Vue compiler', () => {
  assert.doesNotThrow(() => compileScript(descriptor, { id: 'ds-fe-001' }));
});

test('advertisement request includes current scriptId and preserves every existing field', async () => {
  const h = fixture();
  await h.handleGenerate();
  assert.deepEqual(h.requests, [{ url: '/production/editImage/generateFlowImage', body: { ...originalPayload, scriptId: 11 } }]);
  assert.equal(h.props.data.generatedImage, 'generated.png');
  assert.equal(h.generating.value, false);
  assert.deepEqual(h.errors, []);
});

test('switching the selected unit uses its latest ID on the next request', async () => {
  const h = fixture();
  await h.handleGenerate();
  h.episodesId.value = 12;
  await h.handleGenerate();
  assert.deepEqual(h.requests.map(request => request.body.scriptId), [11, 12]);
});

test('advertisement without a valid current unit never sends an unscoped request', async () => {
  for (const scriptId of [undefined, null, 0, -1, 1.5, NaN, Infinity, Number.MAX_SAFE_INTEGER + 1]) {
    const h = fixture();
    h.episodesId.value = scriptId;
    await h.handleGenerate();
    assert.equal(h.requests.length, 0, `invalid scriptId: ${scriptId}`);
    assert.equal(h.props.data.generatedImage, 'existing.png');
    assert.equal(h.generating.value, false);
    assert.equal(h.errors.length, 1);
  }
});

test('short drama and other non-advertisement profiles keep the original request shape', async () => {
  for (const profile of [
    { projectType: 'short_drama', type: 'short_drama' },
    { projectType: 'general_video', type: 'mv' },
    { projectType: 'short_drama', type: 'advertisement' },
  ]) {
    const h = fixture(profile);
    h.episodesId.value = undefined;
    await h.handleGenerate();
    assert.deepEqual(h.requests, [{ url: '/production/editImage/generateFlowImage', body: originalPayload }]);
    assert.equal(Object.hasOwn(h.requests[0].body, 'scriptId'), false);
    assert.equal(h.props.data.generatedImage, 'generated.png');
    assert.deepEqual(h.errors, []);
  }
});

test('backend Gate rejection does not retry without scriptId or replace the existing image', async () => {
  const h = fixture();
  h.response.run = async () => { throw new Error('ADVERTISEMENT_ASSET_GATE_BLOCKED'); };
  await h.handleGenerate();
  assert.equal(h.requests.length, 1);
  assert.equal(h.requests[0].body.scriptId, 11);
  assert.deepEqual(h.errors, ['ADVERTISEMENT_ASSET_GATE_BLOCKED']);
  assert.equal(h.props.data.generatedImage, 'existing.png');
  assert.equal(h.generating.value, false);
});

test('an in-flight request keeps its selected unit; the next request uses the new unit', async () => {
  const h = fixture();
  let resolve;
  h.response.run = () => new Promise(done => { resolve = done; });
  const pending = h.handleGenerate();
  assert.equal(h.generating.value, true);
  h.episodesId.value = 12;
  assert.equal(h.requests[0].body.scriptId, 11);
  resolve({ data: { url: 'first.png' } });
  await pending;
  h.response.run = async () => ({ data: { url: 'next.png' } });
  await h.handleGenerate();
  assert.equal(h.requests[1].body.scriptId, 12);
});

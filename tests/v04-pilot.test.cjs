const assert = require('node:assert/strict');
const { test } = require('node:test');
const fs = require('node:fs');
const path = require('node:path');
const { parse, compileTemplate } = require('@vue/compiler-sfc');
const root = path.resolve(__dirname, '..');
const read = name => fs.readFileSync(path.join(root, name), 'utf8');

test('pilot workspace and persistent Agent templates compile', () => {
  for (const name of ['src/views/pilot/PilotShell.vue', 'src/views/pilot/ProjectAgentPanel.vue']) {
    const parsed = parse(read(name), { filename: name });
    assert.equal(parsed.errors.length, 0, name);
    const result = compileTemplate({ source: parsed.descriptor.template.content, filename: name, id: name });
    assert.equal(result.errors.length, 0, name);
  }
});

test('canonical asset and storyboard writes retain preview and accepted authority', () => {
  const source = read('src/views/pilot/PilotShell.vue');
  assert.match(source, /api\("\/assets\/preview"/);
  assert.match(source, /api\("\/assets\/apply"/);
  assert.match(source, /previewHash:assetPreview\.value\.previewHash/);
  assert.match(source, /api\("\/assets\/resolve"/);
  assert.match(source, /revision\.open\("PILOT_BATCH",operations\)/);
  assert.match(source, /await revision\.previewDraft\(\)/);
  assert.match(source, /await revision\.confirm\(\)/);
  assert.doesNotMatch(source, /\/production\/storyboard\/(?:addStoryboard|replaceStoryboard|editStoryboardInfo)/);
});

test('Agent follows project across pages without changing production authority', () => {
  const pilot = read('src/views/pilot/PilotShell.vue');
  const workbench = read('src/pages/workbench/index.vue');
  const production = read('src/views/production/index.vue');
  assert.match(pilot, /<ProjectAgentPanel :key="state\.project\.id"/);
  assert.match(pilot, /:stage="tab" :route-name="`pilot\/\$\{tab\}`" :selected="selected"/);
  assert.match(workbench, /<ProjectAgentPanel :project-id="pilotScope\.projectId"/);
  assert.match(production, /v-if="!isV04Pilot"/);
});

test('pilot login selects the isolated API before the first request and enters Creative', () => {
  const app = read('src/App.vue');
  const login = read('src/pages/login/index.vue');
  const router = read('src/router/index.ts');
  assert.match(app, /if \(window\.location\.port === "50189"\) baseUrl\.value = "http:\/\/127\.0\.0\.1:10589\/api"/);
  assert.match(login, /Router\.push\(window\.location\.port === "50189" \? "\/pilot" : "\/project"\)/);
  assert.match(router, /path: "\/pilot",\s*component: \(\) => import\("@\/views\/pilot\/PilotShell\.vue"\)/);
});

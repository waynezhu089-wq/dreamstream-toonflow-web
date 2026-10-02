const assert = require('node:assert/strict');
const { test } = require('node:test');
const fs = require('node:fs');
const path = require('node:path');
const { parse, compileTemplate } = require('@vue/compiler-sfc');
const ts = require('typescript');
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

test('Creative is authoritative content first, with Agent proposals entering preview before apply', () => {
  const pilot = read('src/views/pilot/PilotShell.vue');
  const panel = read('src/views/pilot/ProjectAgentPanel.vue');
  assert.match(pilot, /state\.creative\[field\.key\]/);
  assert.match(pilot, /v-if="creativeEditing" class="editor"/);
  assert.match(panel, /suggest\('brief'\)/);
  assert.match(panel, /suggest\('treatment'\)/);
  assert.match(panel, /suggest\('script'\)/);
  assert.match(pilot, /@creative-candidate="onCreativeCandidate"/);
  assert.match(pilot, /creativeDraft\[proposal\.target\]=proposal\.candidate\.proposedText/);
  assert.match(pilot, /await previewCreative\(\)/);
  assert.match(pilot, /previewHash:creativePreview\.value\.previewHash/);
  assert.doesNotMatch(pilot, /class="context-id">\{\{ state\.project\.id/);
});

test('OPT-019 duration travels through Creative draft, proposal, preview, confirm and refreshed truth', () => {
  const pilot = read('src/views/pilot/PilotShell.vue');
  const template = parse(pilot, { filename: 'PilotShell.vue' }).descriptor.template.content;
  assert.match(pilot, /reactive\(\{brief:"",treatment:"",script:"",targetDuration:30\}\)/);
  assert.match(pilot, /targetDuration:next\.creative\.targetDuration/,'project read restores the confirmed duration');
  assert.match(template, /目标时长（秒）<input v-model\.number="creativeDraft\.targetDuration" type="number" min="1" max="600" step="1" @input="creativePreview=null"/);
  assert.match(pilot, /creativeDraft\.targetDuration=proposal\.candidate\.proposedTargetDuration \?\? state\.value\.creative\.targetDuration/,'null proposal keeps confirmed duration instead of stale draft state');
  assert.match(pilot, /api\("\/creative\/preview",\{\.\.\.scope\(\),\.\.\.creativeDraft,expectedVersion:state\.value\.creative\.version\}\)/);
  assert.match(template, /creativePreview\.current\.targetDuration/);
  assert.match(template, /creativePreview\.proposed\.targetDuration/);
  assert.match(pilot, /api\("\/creative\/apply",\{\.\.\.scope\(\),\.\.\.creativeDraft,expectedVersion:state\.value\.creative\.version,previewHash:creativePreview\.value\.previewHash\}\);await reload\(\)/);
  assert.match(template, /state\.creative\.targetDuration \}\} 秒/,'confirmed truth and header display server duration');
});

test('image composer uploads bytes, sends attachment IDs and requires reference preview plus confirm', () => {
  const panel = read('src/views/pilot/ProjectAgentPanel.vue');
  assert.match(panel, /type="file" accept="image\/png,image\/jpeg,image\/webp"/);
  assert.match(panel, /@drop\.prevent="onDrop"/);
  assert.match(panel, /await asDataUrl\(file\)/);
  assert.match(panel, /post\("\/v04\/agent\/image\/upload"/);
  assert.match(panel, /post\("\/v04\/agent\/chat", \{ context: request\.ctx, message: request\.content, attachmentIds: request\.attachmentIds \}\)/);
  assert.match(panel, /responseType: "blob"/);
  assert.match(panel, /post\("\/v04\/agent\/reference\/preview"/);
  assert.match(panel, /post\("\/v04\/agent\/reference\/apply"/);
  assert.match(panel, /previewHash: p\.previewHash/);
  assert.match(panel, /PRODUCTION_ASSET/);
});

test('pilot login selects the isolated API before the first request and enters Creative', () => {
  const app = read('src/App.vue');
  const login = read('src/pages/login/index.vue');
  const router = read('src/router/index.ts');
  assert.match(app, /if \(window\.location\.port === "50189"\) baseUrl\.value = "http:\/\/127\.0\.0\.1:10589\/api"/);
  assert.match(login, /Router\.push\(window\.location\.port === "50189" \? "\/pilot" : "\/project"\)/);
  assert.match(router, /path: "\/pilot",\s*component: \(\) => import\("@\/views\/pilot\/PilotShell\.vue"\)/);
});

test('Assets and Video/Edit handoff load the real general project route before navigating', async () => {
  const shell = read('src/views/pilot/PilotShell.vue');
  assert.match(shell, /@click="openAssetPreparation"/);
  assert.match(shell, /tab === 'video' \|\| tab === 'edit'/);
  assert.match(shell, /@click="openProduction"/);
  assert.match(shell, /function openAssetPreparation\(\)\{return handoff\("assets"\);\}/);
  assert.match(shell, /function openProduction\(\)\{return handoff\("production"\);\}/);
  assert.match(shell, /<p v-if="error" class="error" role="alert">\{\{ error \}\}<\/p>/);
  assert.match(shell, /catch\(e:any\) \{\s*error\.value=`无法打开/);
  assert.doesNotMatch(shell, /\/project\/getSingleProject/);

  const code = ts.transpileModule(read('src/views/pilot/projectHandoff.ts'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  const module = { exports: {} };
  new Function('module', 'exports', code)(module, module.exports);
  const { handoffToProjectPage } = module.exports;
  for (const target of ['assets', 'production']) {
    const calls = [];
    const project = { id: 17, name: 'V0.4 Pilot' };
    await handoffToProjectPage(17, 42, target, {
      post: async (route, body) => { calls.push(['post', route, body]); return { data: [project] }; },
      setProject: value => calls.push(['setProject', value]),
      selectUnit: (projectId, scriptId) => calls.push(['selectUnit', projectId, scriptId]),
      navigate: async route => calls.push(['navigate', route]),
    });
    assert.deepEqual(calls, [
      ['post', '/general/getSingleProject', { id: 17 }],
      ['setProject', project],
      ['selectUnit', 17, 42],
      ['navigate', `/${target}?scriptId=42`],
    ]);
  }
});

test('handoff failure does not navigate or replace the selected project', async () => {
  const code = ts.transpileModule(read('src/views/pilot/projectHandoff.ts'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  const module = { exports: {} };
  new Function('module', 'exports', code)(module, module.exports);
  const calls = [];
  await assert.rejects(module.exports.handoffToProjectPage(17, 42, 'assets', {
    post: async () => { throw new Error('route unavailable'); },
    setProject: () => calls.push('setProject'),
    selectUnit: () => calls.push('selectUnit'),
    navigate: async () => calls.push('navigate'),
  }), /route unavailable/);
  assert.deepEqual(calls, []);
});

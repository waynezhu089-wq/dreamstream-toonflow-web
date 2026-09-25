const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { parse, compileScript, compileTemplate } = require('vue/compiler-sfc');

const root = path.resolve(__dirname, '../src');
function source(relative) { return fs.readFileSync(path.join(root, relative), 'utf8'); }
function validComponent(relative) {
  const filename = path.join(root, relative), descriptor = parse(source(relative), { filename }).descriptor;
  assert.ok(descriptor.template); assert.ok(descriptor.scriptSetup);
  assert.doesNotThrow(() => compileScript(descriptor, { id: relative }));
  const template = compileTemplate({ source: descriptor.template.content, filename, id: relative });
  assert.deepEqual(template.errors, []);
}

test('Recipe Library has generic structured exact selectors and Draft lifecycle', () => {
  validComponent('components/RecipeLibrary.vue');
  const text = source('components/RecipeLibrary.vue');
  for (const phrase of ['Draft Builder','Production Profile','Skill 推荐','Capability 推荐','素材清单模板','saveDraft','activate','deprecate','sourcePolicy','profileVersion','skillVersion']) assert.match(text, new RegExp(phrase));
  assert.match(source('components/setting/index.vue'), /RecipeLibrary v-if="activeMenu === 'recipeLibrary'"/);
  assert.doesNotMatch(text, /睿译读|Logo ID6|advertisement\.asset-ready/);
});

test('Project Recipe picker uses current project context and requires alignment confirmation', () => {
  validComponent('components/ProjectRecipePicker.vue');
  const text = source('components/ProjectRecipePicker.vue');
  assert.match(text, /defineProps<\{ projectId: number \}>/);
  assert.match(text, /projectId: props\.projectId/g);
  assert.match(text, /project\/preview-bind/);
  assert.match(text, /confirmProfileAlignment: confirmAlignment\.value/);
  assert.match(text, /previewData\.alignmentRequired && !confirmAlignment/);
  assert.match(text, /不会自动应用 Skill、Capability 或素材清单/);
  assert.match(source('views/project/index.vue'), /project\.projectType === 'general_video'.*recipeProjectId = Number\(project\.id\)/);
  assert.doesNotMatch(text, /projectId\s*=\s*\d+/);
});

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
const read = p => fs.readFileSync(path.join(root, p), 'utf8');

test('Workbench Accept uses durable acceptanceId and refreshes authoritative server state', () => {
  const source = read('src/views/production/components/workbench/generate/components/video.vue');
  assert.match(source, /uuidv4\(\)/);
  assert.match(source, /acceptanceId/);
  assert.match(source, /acceptCommandIds\.get\(key\)/);
  assert.match(source, /transportUncertain/);
  assert.match(source, /emit\("refresh"\)/);
  const post = source.indexOf('axios.post("/production/workbench/selectVideo"');
  const refresh = source.indexOf('emit("refresh")', post);
  assert.ok(post >= 0 && refresh > post);
});

test('accepted-current production identity is carried from material response into editor MediaItem', () => {
  const workbench = read('src/views/production/components/workbench/index.vue');
  const media = read('src/views/production/components/workbench/editVideo/utils/mediaData.ts');
  assert.match(media, /interface ProductionVideoIdentity/);
  for (const field of ['projectId','scriptId','trackId','videoId','acceptedSourceHash','acceptedOutputSha256'])
    assert.match(media, new RegExp(field));
  assert.match(workbench, /productionVideo:\s*subItem\.productionVideo/);
});

test('editor persists production identity on clip and validates before local export', () => {
  const source = read('src/views/production/components/workbench/editVideo/index.vue');
  assert.match(source, /config:\s*\{ dsProductionVideo: mediaData\.productionVideo \}/);
  assert.match(source, /validateAcceptedVideoMaterial/);
  assert.match(source, /VIDEO_EDITOR|受控视频身份|剪辑台/);
  const validateCall = source.indexOf('await validateProductionVideoClips()');
  const exportCall = source.indexOf('await videoPreviewRef.value.exportVideo()');
  assert.ok(validateCall >= 0 && exportCall > validateCall, 'server validation must precede local export');
  assert.match(source, /acceptedSourceHash/);
  assert.match(source, /acceptedOutputSha256/);
});

test('ordinary non-production media stays optional and production marker is fail-closed when present', () => {
  const source = read('src/views/production/components/workbench/editVideo/index.vue');
  assert.match(source, /if \(marker === undefined\) continue/);
  assert.match(source, /if \(!parsed\) throw new Error/);
});


test('Workbench adopts server effective video model so inherited presets can drive real generation UI', () => {
  const source = read('src/views/production/components/workbench/generate/index.vue');
  assert.match(source, /data\.effectiveVideoModel/);
  assert.match(source, /modelParmas\.value\.model = data\.effectiveVideoModel/);
});

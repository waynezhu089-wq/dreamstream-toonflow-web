const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');
const { parse } = require('vue/compiler-sfc');
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

test('editor validation payload keeps project/script scope outside strict material items', () => {
  const file = 'src/views/production/components/workbench/editVideo/index.vue';
  const setup = parse(read(file), { filename: file }).descriptor.scriptSetup.content;
  const ast = ts.createSourceFile(file, setup, ts.ScriptTarget.Latest, true);
  const fn = ast.statements.find(node => ts.isFunctionDeclaration(node) && node.name?.text === 'validateProductionVideoClips');
  assert.ok(fn, 'expected the real editor validation function');
  const calls = [];
  const visit = node => { if (ts.isCallExpression(node)) calls.push(node); ts.forEachChild(node, visit); };
  visit(fn);
  const push = calls.filter(call => call.expression.getText(ast) === 'items.push');
  assert.equal(push.length, 1, 'only one path may append strict material items');
  const item = push[0].arguments[0];
  assert.ok(ts.isObjectLiteralExpression(item), 'never send the entire parsed production identity');
  const expected = ['trackId', 'videoId', 'acceptedSourceHash', 'acceptedOutputSha256'];
  assert.deepEqual(item.properties.map(property => property.name?.getText(ast)), expected);
  assert.deepEqual(item.properties.map(property => property.initializer?.getText(ast)), expected.map(key => `parsed.${key}`));
  assert.doesNotMatch(fn.getText(ast), /items\.push\(parsed\)/);

  const validate = calls.find(call => call.expression.getText(ast) === 'axios.post' &&
    call.arguments[0]?.text === '/production/workbench/validateAcceptedVideoMaterial');
  assert.ok(validate, 'server validation must remain before local export');
  const body = validate.arguments[1];
  assert.ok(ts.isObjectLiteralExpression(body));
  assert.deepEqual(body.properties.map(property => property.getText(ast)), ['...scope', 'items']);
  assert.match(fn.getText(ast), /scope = \{ projectId: parsed\.projectId, scriptId: parsed\.scriptId \}/);
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


test('Accept cache keeps the same ambiguous action ID but clears the whole track after definite success', () => {
  const source = read('src/views/production/components/workbench/generate/components/video.vue');
  assert.match(source, /function clearAcceptCommandIdsForTrack\(trackId: number\)/);
  assert.match(source, /const prefix = `\$\{trackId\}:`/);
  assert.match(source, /if \(key\.startsWith\(prefix\)\) acceptCommandIds\.delete\(key\)/);
  assert.match(source, /const acceptanceId = acceptCommandIds\.get\(key\) \?\? uuidv4\(\)/);
  assert.match(source, /if \(!transportUncertain\) acceptCommandIds\.delete\(key\)/);

  const post = source.indexOf('await axios.post("/production/workbench/selectVideo"');
  const reconcile = source.indexOf('clearAcceptCommandIdsForTrack(trackId)', post);
  const refresh = source.indexOf('emit("refresh")', reconcile);
  assert.ok(post >= 0 && reconcile > post && refresh > reconcile,
    'a definite Accept response must clear stale same-track command IDs before authoritative refresh');

  // State-model the exact frozen command lifecycle.
  const cache = new Map();
  const trackId = 7;
  const aKey = `${trackId}:101`, bKey = `${trackId}:102`;
  const oldA = 'accept-A1';
  cache.set(aKey, oldA); // A transport-ambiguous.
  assert.equal(cache.get(aKey) ?? 'fresh-A', oldA, 'immediate retry of A reuses the same ID');

  cache.set(bKey, 'accept-B1');
  const prefix = `${trackId}:`;
  for (const key of cache.keys()) if (key.startsWith(prefix)) cache.delete(key); // B definite success.
  assert.equal(cache.has(aKey), false);
  assert.equal(cache.has(bKey), false);
  const newA = cache.get(aKey) ?? 'accept-A2';
  assert.notEqual(newA, oldA, 'later intentional re-Accept of A must obtain a fresh ID');
});

test('response-less Axios timeout remains transport-ambiguous and keeps the same Accept command ID', () => {
  const axiosSource = read('src/utils/axios.ts');
  const videoSource = read('src/views/production/components/workbench/generate/components/video.vue');

  // Guard the real shared interceptor against reintroducing an unsafe no-response dereference.
  assert.match(axiosSource, /error\?\.response\?\.data\?\.message === "Network Error"/);
  assert.doesNotMatch(axiosSource, /error\.response\.data\?\.message/);
  assert.match(axiosSource, /Promise\.reject\(error\?\.response\?\.data \?\? error\)/);

  // Isolate the interceptor's rejection semantics with the same expressions used in src/utils/axios.ts.
  const rejectValue = error => {
    const isNetworkError =
      error?.message?.includes?.('Network Error') ||
      error?.response?.data?.message === 'Network Error';
    void isNetworkError;
    return error?.response?.data ?? error;
  };

  const timeout = {
    name: 'AxiosError',
    code: 'ECONNABORTED',
    message: 'timeout of 30000ms exceeded',
  };
  const propagatedTimeout = rejectValue(timeout);
  assert.equal(propagatedTimeout, timeout, 'response-less timeout must preserve the original AxiosError');
  const timeoutUncertain = propagatedTimeout?.name === 'AxiosError' && !propagatedTimeout?.response;
  assert.equal(timeoutUncertain, true);

  const cache = new Map([['7:101', 'accept-A1']]);
  if (!timeoutUncertain) cache.delete('7:101');
  assert.equal(cache.get('7:101'), 'accept-A1', 'ambiguous timeout must retain the original acceptanceId');
  assert.equal(cache.get('7:101') ?? 'accept-A2', 'accept-A1', 'immediate retry must reuse the same acceptanceId');

  const httpFailure = {
    name: 'AxiosError',
    message: 'Request failed with status code 409',
    response: { status: 409, data: { message: 'conflict' } },
  };
  const propagatedHttpFailure = rejectValue(httpFailure);
  const httpUncertain = propagatedHttpFailure?.name === 'AxiosError' && !propagatedHttpFailure?.response;
  assert.equal(httpUncertain, false);
  if (!httpUncertain) cache.delete('7:101');
  assert.equal(cache.has('7:101'), false, 'definite HTTP failure must clear the current command ID');

  // Keep the consumer contract tied to the actual Accept implementation.
  assert.match(videoSource, /const transportUncertain = error\?\.name === "AxiosError" && !error\?\.response/);
  assert.match(videoSource, /if \(!transportUncertain\) acceptCommandIds\.delete\(key\)/);
});


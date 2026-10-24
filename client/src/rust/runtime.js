import packageInfo from '../../package.json';
let wasm, loading, lastPoints, sampler;
const names = ['lng', 'lat', 'zoom', 'pitch', 'bearing', 'pathProgress'];
export function loadRustTimeline() {
  if (!loading) loading = (async () => {
    const url = new URL(`${process.env.PUBLIC_URL || '.'}/rust/mapanimator_web.js?v=${packageInfo.version}`, document.baseURI).href;
    const module = await import(/* webpackIgnore: true */ url);
    await module.default({ module_or_path: new URL(`${process.env.PUBLIC_URL || '.'}/rust/mapanimator_web_bg.wasm?v=${packageInfo.version}`, document.baseURI).href }); wasm = module;
    return module;
  })().catch(error => { loading = null; throw error; });
  return loading;
}
export function sampleRust(points, time) {
  if (!wasm) {
    return null;
  }
  if (lastPoints !== points) { sampler?.free(); sampler = new wasm.Sampler(JSON.stringify(points)); lastPoints = points; }
  const values = JSON.parse(sampler.sample(time));
  return Object.fromEntries(names.map((name, i) => [name, values[i]]));
}
export function cameraValues(camera) { return camera && names.map(name => camera[name]); }

let sceneSampler, sceneInputs;
export function sampleSceneRust(points, catalog, animation, time) {
  if(!wasm) throw Error('Aguarde o motor Rust carregar.');
  if(!sceneInputs || sceneInputs[0]!==points || sceneInputs[1]!==catalog || sceneInputs[2]!==animation) {
    sceneSampler?.free();sceneSampler=new wasm.SceneSampler(JSON.stringify(points),JSON.stringify(catalog),JSON.stringify(animation));sceneInputs=[points,catalog,animation];
  }
  return JSON.parse(sceneSampler.sample(time));
}

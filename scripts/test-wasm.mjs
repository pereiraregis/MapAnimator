import fs from 'node:fs';
import assert from 'node:assert/strict';
import { pathToFileURL } from 'node:url';
import path from 'node:path';
const root=path.resolve('client/public/rust');
const wasm=await import(pathToFileURL(path.join(root,'mapanimator_web.js')));
await wasm.default({module_or_path:fs.readFileSync(path.join(root,'mapanimator_web_bg.wasm'))});
const a={id:'a',time:0,lng:170,lat:-23,zoom:4,pitch:0,bearing:170,pathProgress:0,easing:'linear'};
const b={...a,id:'b',time:3,lng:-170,lat:-20,zoom:10,pitch:30,bearing:-170,pathProgress:1};
const sampler=new wasm.Sampler(JSON.stringify([a,b]));
assert.deepEqual(JSON.parse(sampler.sample(1.5)),[-180,-21.5,7,15,-180,0.5]);sampler.free();
for(let frame=0;frame<=90;frame++){const u=frame/90;const v=JSON.parse(wasm.sample_points(JSON.stringify([a,b]),frame/30));assert.ok(Math.abs(v[2]-(4+6*u))<1e-9);assert.ok(Math.abs(v[5]-u)<1e-9);}
const native=[{...a,native:{zoom:{time:0,value:{t:'Scalar',v:4},out_interp:'Bezier',out_ease:[{speed:0,influence:1/3}]}}},b];
assert.ok(JSON.parse(wasm.sample_points(JSON.stringify(native),0.75))[2]<5.5);
assert.throws(()=>new wasm.Sampler('[{"time":0}]'));
console.log('WASM smoke passed: actual compiled Rust sampler, 91 frame samples, angular wrapping, route progress, native outgoing ease and invalid input.');

const catalog=[{id:'pin:a',name:'Cidade',kind:'pin',values:{lng:-46,lat:-23,opacity:1,scale:1,rotation:0}}];
const key=(id,time,value)=>({id,data:{time:Math.round(time*254016000000),value:{t:'Scalar',v:value},in_interp:'Linear',out_interp:'Linear',in_ease:[],out_ease:[]}});
const animation={version:1,layers:[{id:'pin:a',name:'Cidade',kind:'pin',muted:false,locked:false,start:.25,end:1.75}],tracks:[{property:'pin:a/opacity',keys:[key('p0',0,1),key('p1',2,0)]}],constants:{}};
const scene=new wasm.SceneSampler('[]',JSON.stringify(catalog),JSON.stringify(animation));
for(let frame=0;frame<=90;frame++){const t=frame/30,s=JSON.parse(scene.sample(t));assert.equal(s.cameraAnimated,false);assert.equal(s.routeAnimated,false);assert.equal(s.layers[0].visible,t>=.25&&t<1.75);assert.ok(Math.abs(s.layers[0].values.opacity-Math.max(0,1-t/2))<1e-9);}
scene.free();
const frozen=new wasm.SceneSampler('[]',JSON.stringify(catalog),JSON.stringify({version:1,layers:[],tracks:[],constants:{'pin:a/opacity':.3}}));assert.equal(JSON.parse(frozen.sample(1)).layers[0].values.opacity,.3);frozen.free();
console.log('Layer WASM smoke passed: 91 object-only frames, visibility interval, independent opacity and persisted static override; camera remains unanimated.');
const staticRoute=new wasm.SceneSampler('[]',JSON.stringify(catalog),JSON.stringify({version:1,layers:[],tracks:[],constants:{'route/pathProgress':.3}}));const staticState=JSON.parse(staticRoute.sample(1));assert.equal(staticState.routeAnimated,true);assert.equal(staticState.values[5],.3);staticRoute.free();

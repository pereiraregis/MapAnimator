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

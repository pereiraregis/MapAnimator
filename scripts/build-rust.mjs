import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
const run=(exe,args,opts={})=>{const p=spawnSync(exe,args,{stdio:'inherit',...opts});if(p.status!==0)throw Error(`${exe} failed (${p.status})`);return p;};
const upstream=JSON.parse(fs.readFileSync('rust/vendor/effectcraft/UPSTREAM.json','utf8'));
for(const item of upstream.files){const file=path.join('rust/vendor/effectcraft',item.path.replace(/^crates\//,''));const data=fs.readFileSync(file);const actual=crypto.createHash('sha1').update(Buffer.from(`blob ${data.length}\0`)).update(data).digest('hex');if(actual!==item.gitBlob)throw Error('Vendored source modified: '+item.path);}
const bindgen=process.env.WASM_BINDGEN||'wasm-bindgen';
const lock=fs.readFileSync('rust/Cargo.lock','utf8');
const required=lock.match(/name = "wasm-bindgen"\r?\nversion = "([^"]+)"/)[1];
const version=spawnSync(bindgen,['--version'],{encoding:'utf8'});if(version.status!==0||!version.stdout.includes(required))throw Error(`Install wasm-bindgen-cli ${required} or set WASM_BINDGEN to its executable.`);
run('cargo',['build','--manifest-path','rust/Cargo.toml','-p','mapanimator-web','--target','wasm32-unknown-unknown','--release','--locked']);
fs.mkdirSync('client/public/rust',{recursive:true});
run(bindgen,['rust/target/wasm32-unknown-unknown/release/mapanimator_web.wasm','--target','web','--out-dir','client/public/rust']);
fs.writeFileSync('client/public/rust/package.json','{"type":"module"}\n');
const hash=crypto.createHash('sha256');
for(const file of ['rust/Cargo.toml','rust/Cargo.lock','rust/timeline-core/src/lib.rs','rust/timeline-core/Cargo.toml','rust/timeline-web/src/lib.rs','rust/timeline-web/Cargo.toml'])hash.update(fs.readFileSync(file,'utf8').replaceAll('\r\n','\n'));
const sha=crypto.createHash('sha256').update(fs.readFileSync('client/public/rust/mapanimator_web_bg.wasm')).digest('hex');
fs.writeFileSync('client/public/rust/build-info.json',JSON.stringify({version:'0.7.0',upstream:'357b4c5bd531f9032ad6dc02937dcc75ab293ee9',bindings:required,compiler:spawnSync('rustc',['--version'],{encoding:'utf8'}).stdout.trim(),sourceSha256:hash.digest('hex'),wasmSha256:sha},null,2)+'\n');
const cargoHome=process.env.CARGO_HOME||path.join(process.env.USERPROFILE||process.env.HOME,'.cargo');
const registries=fs.readdirSync(path.join(cargoHome,'registry/src')).map(d=>path.join(cargoHome,'registry/src',d));
let notices='Rust dependency notices — MapAnimator v0.7.0\nIncludes resolved Cargo.lock dependencies; some platform-specific crates are not in the web binary.\n';
const missing=[];
for(const entry of lock.split('[[package]]').slice(1)){
  if(!entry.includes('registry+'))continue;const name=entry.match(/name = "([^"]+)"/)[1],v=entry.match(/version = "([^"]+)"/)[1];const dir=registries.map(r=>path.join(r,`${name}-${v}`)).find(fs.existsSync);if(!dir)continue;
  const licenses=fs.readdirSync(dir).filter(f=>/^(licen[cs]e|copying|notice)/i.test(f)&&fs.statSync(path.join(dir,f)).isFile());if(!licenses.length){const override=path.join('scripts/license-overrides',`${name}-${v}.txt`);if(fs.existsSync(override)){notices+=`\n\n========== ${name} ${v} ==========\n`+fs.readFileSync(override,'utf8');continue;}missing.push(`${name} ${v}`);continue;}
  notices+=`\n\n========== ${name} ${v} ==========\n`;for(const file of licenses)notices+=`\n--- ${file} ---\n`+fs.readFileSync(path.join(dir,file),'utf8')+'\n';
}
fs.mkdirSync('client/public/licenses',{recursive:true});fs.writeFileSync('client/public/licenses/rust-dependencies.txt',notices);
console.log('Rust build completed; WASM sha256:',sha);if(missing.length)throw Error('Missing dependency notices: '+missing.join(', '));

import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import RustTimeline from './RustTimeline';
import { loadRustTimeline } from './rust/runtime';
jest.mock('./rust/runtime', () => ({ loadRustTimeline: jest.fn(), cameraValues: c => c && ['lng','lat','zoom','pitch','bearing','pathProgress'].map(k => c[k]) }));
let root, host, props, runner, events, tick, previousRaf, previousCancel;
beforeEach(() => {
  global.IS_REACT_ACT_ENVIRONMENT = true;
  host=document.createElement('div');document.body.appendChild(host);root=createRoot(host);events=[];
  runner={set_scene:jest.fn(),configure:jest.fn(),start:jest.fn().mockResolvedValue(),command:jest.fn(),destroy:jest.fn(),free:jest.fn(),take_events:jest.fn(()=>JSON.stringify(events.splice(0)))};
  loadRustTimeline.mockResolvedValue({TimelineRunner:jest.fn(()=>runner)});
  previousRaf=global.requestAnimationFrame;previousCancel=global.cancelAnimationFrame;global.requestAnimationFrame=jest.fn(cb=>{tick=cb;return 1;});global.cancelAnimationFrame=jest.fn();
  props={points:[],duration:3,fps:30,enabled:true,visible:true,disabled:false,setPoints:jest.fn(),onSeek:jest.fn(),onCapture:jest.fn(()=>({lng:-46,lat:-23,zoom:8,pitch:0,bearing:0,pathProgress:.5})),onEnabled:jest.fn(),onStatus:jest.fn(),onResize:jest.fn(),nativePause:jest.fn()};
});
afterEach(()=>{act(()=>root.unmount());host.remove();global.requestAnimationFrame=previousRaf;global.cancelAnimationFrame=previousCancel;});
async function render(){await act(async()=>{root.render(<RustTimeline {...props}/>);});}
test('Rust edits and sampled camera values cross the bridge without resetting Rust undo history', async()=>{
  await render();expect(host.textContent).toContain('WebAssembly');expect(runner.start.mock.calls[0][0]).toBeInstanceOf(HTMLCanvasElement);
  const points=[{id:'rust-key'}];events.push({type:'points',points},{type:'seek',time:1,values:[-46,-23,9,0,0,.5]});act(()=>tick());expect(props.setPoints).toHaveBeenCalledWith(points);expect(props.onSeek).toHaveBeenCalledWith(1,[-46,-23,9,0,0,.5]);
  const writes=runner.set_scene.mock.calls.length;props={...props,points:props.setPoints.mock.calls[0][0]};await render();expect(runner.set_scene).toHaveBeenCalledTimes(writes);
  props={...props,points:[{id:'external'}]};await render();expect(runner.set_scene).toHaveBeenCalledTimes(writes+1);
  props={...props,disabled:true};await render();expect(runner.configure).toHaveBeenLastCalledWith(3,30,true,true);
});
test('a property capture uses actual map values and explicitly enables the Rust animation mode',async()=>{
  props.enabled=false;await render();events.push({type:'capture',channels:[2]});act(()=>tick());expect(props.onEnabled).toHaveBeenCalledWith(true);expect(runner.configure).toHaveBeenCalledWith(3,30,true,false);expect(JSON.parse(runner.command.mock.calls.at(-1)[0])).toEqual({op:'capture',channels:[2],values:[-46,-23,8,0,0,.5]});
});

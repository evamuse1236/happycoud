import test from 'node:test';
import assert from 'node:assert/strict';
import { NavigationControls } from '../src/controls.js';

test('two taps retain focus for the reader, while dragging clears it',()=>{
  const canvas=new EventTarget();
  Object.assign(canvas,{classList:{add(){},remove(){}},setPointerCapture(){},hasPointerCapture(){return false;}});
  const rig={current:{x:0,y:0,z:100},interrupt(){},pan(){},zoom(){},coast(){}};
  let cancelled=0,selections=0;
  const controls=new NavigationControls(canvas,rig,{onSelect(){selections++;},onHover(){},onInteract(){},onCancelFocus(){cancelled++;},isBlocked:()=>false});
  const send=(type,x=20)=>{const e=new Event(type);Object.assign(e,{button:0,pointerId:1,pointerType:'mouse',clientX:x,clientY:20});canvas.dispatchEvent(e);};
  send('pointerdown');send('pointerup');send('pointerdown');send('pointerup');
  assert.equal(selections,2);assert.equal(cancelled,0);
  send('pointerdown');send('pointermove',45);send('pointerup',45);
  assert.equal(cancelled,1);assert.equal(selections,2);
  controls.dispose();
});

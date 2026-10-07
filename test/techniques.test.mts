import test from 'node:test';
import assert from 'node:assert/strict';
// @ts-expect-error Shared browser module.
import { createTechniqueDetector, techniqueAt, inputTokens } from '../src/techniques.mjs';
const entry = (state: number, extra: any = {}, pre: any = {}) => ({ pre, post: { actionStateId: state, actionStateCounter: 1, ...extra } });
test('offense and defense use executed states, not button presses', () => {
  const d = createTechniqueDetector();
  d.push(0, entry(14)); d.push(1, entry(14, {}, { physicalButtons: 0x100 }));
  assert.equal(d.events.length, 0);
  d.push(2, entry(67, {}, { cStickX: -1 }));
  d.push(3, entry(178)); d.push(4, entry(179)); d.push(5, entry(235)); d.push(6, entry(200));
  assert.deepEqual(d.events.map((e: any) => e.label), ['Back air','Shield','Spot dodge','Tech roll forward']);
  assert.deepEqual(d.events[0].inputs, ['C ←']);
});
test('wavedash requires air dodge landing and recent ground jump at same height', () => {
  const d = createTechniqueDetector();
  [14,24,25,236,43].forEach((s,i) => d.push(i, entry(s, {positionY: 0}, s === 236 ? {joystickX: 1, joystickY: -1, physicalButtons: 0x20} : {})));
  assert.equal(d.events.at(-1).label, 'Wavedash');
  assert.deepEqual(d.events.at(-1).inputs, ['◉ ↘','R']);
  const w = createTechniqueDetector();
  [29,236,43].forEach((s,i) => w.push(i, entry(s)));
  assert.equal(w.events.at(-1).label, 'Waveland');
  const special = createTechniqueDetector();
  special.push(0,entry(35)); special.push(1,entry(43));
  assert.equal(special.events.length, 0);
});
test('shine and jump cancel are gated by internal character', () => {
  for (const id of [1,22,9]) {
    const d = createTechniqueDetector();
    [14,360,361,24].forEach((s,i) => d.push(i,entry(s,{internalCharacterId:id})));
    assert.deepEqual(d.events.map((e: any) => e.label), id === 9 ? ['Side-B','Up-B'] : ['Down-B','Jump cancel']);
  }
});
test('L-cancel status distinguishes success and failure without repeating', () => {
  for (const status of [1,2,undefined]) {
    const d = createTechniqueDetector();
    d.push(0,entry(67)); d.push(1,entry(67,{}, {physicalButtons:0x40}));
    d.push(2,entry(72,{lCancelStatus:status})); d.push(3,entry(72,{lCancelStatus:status}));
    assert.deepEqual(d.events.map((e: any) => e.label), status === undefined ? [] : [status === 1 ? 'L-cancel' : 'Missed L-cancel']);
    if (status) assert.deepEqual(d.events[0].inputs,['L']);
  }
});
test('frame gaps reset detection; seeks never show future or expired labels', () => {
  const d = createTechniqueDetector();
  d.push(0,entry(14)); d.push(2,entry(67)); assert.equal(d.events.length,0);
  d.push(3,entry(235)); d.push(4,entry(14)); d.push(40,entry(14)); d.push(41,entry(212));
  assert.equal(techniqueAt(d.events,2),null);
  assert.equal(techniqueAt(d.events,3).label,'Spot dodge');
  assert.equal(techniqueAt(d.events,33),null);
  assert.equal(techniqueAt(d.events,41).label,'Grab');
  assert.equal(techniqueAt(d.events,4).label,'Spot dodge');
});
test('input symbols preserve actual buttons and analog triggers', () => {
  assert.deepEqual(inputTokens({joystickY:1,physicalButtons:0x800,physicalLTrigger:.8}),['◉ ↑','Y','L']);
});

test('autocancel is distinct from a successful or missed L-cancel', () => {
  const d = createTechniqueDetector();
  d.push(0,entry(14));d.push(1,entry(69));d.push(2,entry(42,{lCancelStatus:0}));d.push(3,entry(56));
  assert.equal(techniqueAt(d.events,2).label,'Auto-cancel');
  assert.equal(techniqueAt(d.events,3).label,'Up tilt');
  assert.ok(!d.events.some((e:any)=>e.label==='L-cancel'));
});
test('interrupted aerial labels end at the hit, including after landing and on seeks', () => {
  const d=createTechniqueDetector();
  d.push(513,entry(29));d.push(514,entry(67));
  for(let f=515;f<519;f++)d.push(f,entry(67,{actionStateCounter:f-513}));
  d.push(519,entry(86));d.push(520,entry(42));
  assert.equal(techniqueAt(d.events,518).label,'Back air');
  assert.equal(techniqueAt(d.events,519),null);
  assert.equal(techniqueAt(d.events,520),null);
});
test('fast fall uses engine flag onset, not downward input, and does not repeat', () => {
  const d=createTechniqueDetector();
  d.push(0,entry(29,{isFastfalling:false}));
  d.push(1,entry(29,{isFastfalling:false},{joystickY:-1}));
  d.push(2,entry(29,{isFastfalling:true},{joystickY:-1}));
  d.push(3,entry(29,{isFastfalling:true}));
  assert.deepEqual(d.events.map((e:any)=>e.label),['Fast fall']);
  const legacy=createTechniqueDetector();legacy.push(0,entry(29));legacy.push(1,entry(29,{}, {joystickY:-1}));
  assert.equal(legacy.events.length,0);
});
test('specials are character-specific and do not repeat between phases', () => {
  const d=createTechniqueDetector();
  [14,353,354,355,356,14,347,348,349,14,360].forEach((state,i)=>d.push(i,entry(state,{internalCharacterId:22})));
  assert.deepEqual(d.events.map((e:any)=>e.label),['Up-B','Side-B','Down-B']);
  const luigi=createTechniqueDetector();[14,341,14,355].forEach((state,i)=>luigi.push(i,entry(state,{internalCharacterId:17})));
  assert.deepEqual(luigi.events.map((e:any)=>e.label),['Neutral-B','Up-B']);
});
test('double laser counts projectile spawns within the same airtime', () => {
  const d=createTechniqueDetector(), air={internalCharacterId:22,isAirborne:true};
  d.push(0,entry(29,air));d.push(1,entry(344,air,{physicalButtons:0x200}));
  d.push(2,entry(345,air),[{typeId:55}]);
  d.push(3,entry(345,{...air,actionStateCounter:2}),[]);
  assert.equal(d.events.at(-1).label,'Laser');
  d.push(4,entry(345,{...air,actionStateCounter:3}),[{typeId:55}]);
  assert.equal(d.events.at(-1).label,'Double Laser');
  d.push(5,entry(14,{internalCharacterId:22,isAirborne:false}));
  d.push(6,entry(345,air),[{typeId:55}]);
  assert.equal(d.events.at(-1).label,'Laser');
});

test('same-frame air dodge landing detects wavedash and keeps its input', () => {
  const d=createTechniqueDetector();
  [14,24,24,24,24,43].forEach((s,i)=>d.push(i,entry(s,{positionY:0},s===43?{joystickX:-.71,joystickY:-.69,physicalButtons:0x20}:{})));
  assert.equal(d.events.at(-1).label,'Wavedash');
  assert.deepEqual(d.events.at(-1).inputs,['◉ ↙','R']);
});
test('same-frame falling dodge landing is a waveland, recovery landing is not', () => {
  for(const state of [25,26,27,28,29,30,31,32,33,34]){
    const d=createTechniqueDetector();d.push(0,entry(state));d.push(1,entry(43,{}, {physicalButtons:0x40,joystickY:-1}));
    assert.equal(d.events.at(-1).label,'Waveland');
  }
  for(const state of [35,36,37,352,244]){
    const d=createTechniqueDetector();d.push(0,entry(state));d.push(1,entry(43));assert.equal(d.events.length,0);
  }
});
test('short jump to sloped surface is a wavedash; travel to platform is a waveland', () => {
  for(const jumps of [1,6]){
    const d=createTechniqueDetector();d.push(0,entry(24,{positionY:0}));
    for(let f=1;f<=jumps;f++)d.push(f,entry(25,{positionY:f,actionStateCounter:f}));
    d.push(jumps+1,entry(43,{positionY:jumps}));
    assert.equal(d.events.at(-1).label,jumps===1?'Wavedash':'Waveland');
  }
});
test('long air dodge landing and normal landing do not manufacture wavedashes', () => {
  const d=createTechniqueDetector();d.push(0,entry(29));
  for(let f=1;f<=20;f++)d.push(f,entry(236,{actionStateCounter:f}));
  d.push(21,entry(43));assert.ok(!d.events.some((e:any)=>['Wavedash','Waveland'].includes(e.label)));
  const normal=createTechniqueDetector();normal.push(0,entry(25));normal.push(1,entry(42));assert.equal(normal.events.length,0);
});

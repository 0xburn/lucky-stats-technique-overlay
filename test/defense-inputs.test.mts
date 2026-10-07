import test from 'node:test';
import assert from 'node:assert/strict';
// @ts-expect-error Shared browser module.
import {createDefenseInputDetector, diDirection, sdiInput, buildDefenseCombos, liveDefenseAt, defenseLabel, isReceivingCombo} from '../src/defense-inputs.mjs';
// @ts-expect-error Shared browser module.
import {techniqueAt} from '../src/techniques.mjs';
const sample = (lag: number | undefined, x = 0, y = 0, percent = 10, state = 87) => ({
  pre: {joystickX:x,joystickY:y}, post:{hitlagRemaining:lag,percent,actionStateId:state,positionX:20},
});
test('DI in/out mirrors with attacker side, with neutral and vertical fallbacks',()=>{
  assert.equal(diDirection({x:-1,y:0},-1),'in');
  assert.equal(diDirection({x:1,y:0},-1),'out');
  assert.equal(diDirection({x:1,y:0},1),'in');
  assert.equal(diDirection({x:0,y:1},-1),'up');
  assert.equal(diDirection({x:0,y:0},-1),'neutral');
  assert.equal(diDirection({x:-1,y:0},0),'left');
  assert.equal(diDirection(null,-1),null);
});
test('SDI inputs require a new stick excursion, not held or C-stick inputs',()=>{
  assert.equal(sdiInput({x:0,y:0},{x:1,y:0}),true);
  assert.equal(sdiInput({x:1,y:0},{x:1,y:0}),false);
  assert.equal(sdiInput({x:0,y:0},{x:.2,y:.2}),false);
  assert.equal(sdiInput({x:1,y:0},{x:.7,y:.7}),true);
  assert.equal(sdiInput({x:.7,y:.7},{x:1,y:0}),false);
  assert.equal(sdiInput({x:1,y:0},{x:-1,y:0}),true);
});
test('count progresses per hit; DI samples hitlag exit and backward seeks do not reveal future counts',()=>{
  const d=createDefenseInputDetector();
  d.push(0,sample(0,0,0,0,14));
  d.push(1,sample(5,1,0),{positionX:0}); // initial hit is not SDI
  d.push(2,sample(4,1,0));
  d.push(3,sample(3,0,0));
  d.push(4,sample(2,1,0));
  d.push(5,sample(1,-1,0));
  d.push(6,sample(0,1,0)); // exit input is DI, not another SDI
  assert.equal(techniqueAt(d.events,2).sdiInputs,0);
  assert.equal(techniqueAt(d.events,4).sdiInputs,1);
  assert.equal(techniqueAt(d.events,5).sdiInputs,2);
  assert.equal(techniqueAt(d.events,6).diDirection,'out');
  assert.equal(techniqueAt(d.events,6).sdiInputs,2);
  assert.equal(techniqueAt(d.events,1).sdiInputs,0);
  d.push(7,sample(2,0,0,20),{positionX:40});
  assert.equal(techniqueAt(d.events,7).sdiInputs,0);
});
test('attacker hitlag and shield hitlag are not damage DI opportunities',()=>{
  for(const state of [65,180]){
    const d=createDefenseInputDetector();
    d.push(0,sample(0,0,0,10,state));d.push(1,sample(2,0,0,10,state));
    d.push(2,sample(1,1,0,10,state));d.push(3,sample(0,-1,0,10,state));
    assert.deepEqual(d.events,[]);
  }
});
test('missing telemetry and discontinuous frames never manufacture DI or SDI',()=>{
  const d=createDefenseInputDetector();
  d.push(0,sample(0,0,0,0,14));d.push(1,sample(3),{positionX:0});
  d.push(2,sample(undefined));d.push(3,sample(0,1));
  assert.equal(d.events.some((e:any)=>e.phase==='launch'),false);
  d.push(10,sample(2,1,0,20));d.push(11,sample(0,-1,0,20));
  assert.equal(d.events.some((e:any)=>e.phase==='launch'),false);
});
test('throws without hitlag report DI on release and no SDI inputs',()=>{
  const d=createDefenseInputDetector();
  d.push(0,sample(0,1,0,10,239));
  d.push(1,sample(0,-1,0,10,87),{positionX:0});
  assert.equal(d.events[0].diDirection,'in');
  assert.equal(d.events[0].sdiInputs,0);
  assert.equal(d.events[0].frame,1);
});

test('zero SDI inputs are omitted, including when no DI is available',()=>{
  assert.equal(defenseLabel({sdiInputs:0,diDirection:'in'}),'DI in');
  assert.equal(defenseLabel({sdiInputs:0,diDirection:null}),'');
  assert.equal(defenseLabel({sdiInputs:2,diDirection:'out'}),'DI out · SDI ~2 inputs');
  assert.equal(defenseLabel({sdiInputs:1}),'SDI ~1 input');
});

test('live DI changes between hits, persists beyond 30 frames, and clears at combo end',()=>{
  const inputs = new Float32Array(201 * 12), opponentInputs = new Float32Array(201 * 12);
  for (let f=0;f<=200;f++) {
    inputs[f*12]=opponentInputs[f*12]=1; inputs[f*12+11]=1;
    inputs[f*12+1]=f < 50 ? -1 : 1;
    inputs[f*12+10]=20; opponentInputs[f*12+10]=f < 80 ? 0 : 40;
  }
  const combos=buildDefenseCombos([{playerIndex:1,startFrame:5,endFrame:120,lastHitBy:0},
    {playerIndex:0,startFrame:0,endFrame:200,lastHitBy:1}],1,200);
  const victim={index:1,inputs,defenseCombos:combos,defense:[{frame:10,sdiInputs:0}]};
  const players=[{index:0,inputs:opponentInputs},victim];
  const at=(f:number)=>liveDefenseAt(victim,players,f,0,12);
  assert.equal(at(49).diDirection,'in');
  assert.equal(at(50).diDirection,'out'); // no hit or damage-state transition
  assert.equal(at(79).diDirection,'out');
  assert.equal(at(80).diDirection,'in'); // attacker crossed sides
  assert.equal(at(119).diDirection,'in');
  assert.equal(at(120),null);
  assert.equal(at(49).diDirection,'in'); // backwards seek
  assert.equal(at(4),null);
  assert.equal(defenseLabel(at(49)),'DI in'); // no zero-SDI label
  inputs[60*12+1]=0; assert.equal(at(60).diDirection,'neutral');
  inputs[61*12]=0; assert.equal(at(61),null);
});
test('incomplete combos end after the last frame; later combos cannot inherit old SDI',()=>{
  const combos=buildDefenseCombos([{playerIndex:0,startFrame:50,lastHitBy:1}],0,200);
  assert.equal(combos[0].endFrame,201);
  const inputs=new Float32Array(201*12);inputs[50*12]=1; inputs[50*12+11]=1;
  const p={index:0,inputs,defenseCombos:combos,defense:[{frame:10,sdiInputs:3}]};
  assert.equal(liveDefenseAt(p,[p],50,0,12).sdiInputs,0);
  assert.equal(liveDefenseAt(p,[p],201,0,12),null);
});

test('neutral and offense never qualify even with stale damage or hitlag data',()=>{
  for(const state of [14,20,25,29,50,65,178,212,219,360,0,12]) {
    assert.equal(isReceivingCombo({actionStateId:state,isInHitstun:true,hitlagRemaining:4,miscActionState:30}),false,`state ${state}`);
  }
  assert.equal(isReceivingCombo({actionStateId:87,isInHitstun:true}),true);
  assert.equal(isReceivingCombo({actionStateId:87,isInHitstun:false,miscActionState:30}),false);
  assert.equal(isReceivingCombo({actionStateId:38,isInHitstun:false}),false);
  assert.equal(isReceivingCombo({actionStateId:87,isInHitstun:false,hitlagRemaining:2}),true);
  assert.equal(isReceivingCombo({actionStateId:223}),true);
  assert.equal(isReceivingCombo({actionStateId:239}),true);
});
test('DI hides immediately in neutral or on offense inside a lingering combo window',()=>{
  const inputs=new Float32Array(80*12);
  for(let f=0;f<80;f++){inputs[f*12]=1;inputs[f*12+1]=-1;inputs[f*12+11]=Number(f<20||f>=40);}
  const p={index:0,inputs,defenseCombos:[{frame:0,endFrame:80,attacker:1}],defense:[{frame:1,sdiInputs:2}]};
  assert.ok(liveDefenseAt(p,[p],19,0,12));
  assert.equal(liveDefenseAt(p,[p],20,0,12),null);
  assert.equal(liveDefenseAt(p,[p],39,0,12),null);
  assert.ok(liveDefenseAt(p,[p],40,0,12));
  assert.equal(liveDefenseAt(p,[p],20,0,12),null); // backwards seek
});

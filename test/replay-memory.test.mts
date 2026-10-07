import test from 'node:test';
import assert from 'node:assert/strict';
import { SlippiGame } from '@slippi/slippi-js';
// @ts-ignore Browser module
import { analyzeReplay } from '../src/stream-analysis.mjs';

function recording(count = 2000, rollback = false, complete = true, defenseFixture = false) {
  const sizes = [[0x36, 0x340], [0x37, 0x3f], [0x38, 0x54], [0x3a, 8], [0x3c, 8], [0x39, 2]];
  const parts: Uint8Array[] = [new Uint8Array([0x35, sizes.length * 3 + 1, ...sizes.flatMap(([c,n]) => [c,n>>8,n&255])])];
  function message(command: number, write: (v: DataView, b: Uint8Array) => void) {
    const b = new Uint8Array(sizes.find(([c]) => c === command)![1] + 1); b[0] = command;
    write(new DataView(b.buffer), b); parts.push(b);
  }
  message(0x36, (_v,b) => {
    b.set([3,16,0],1);
    for (let p=0;p<4;p++) { b[0x65+p*36] = p === 0 ? 2 : 20; b[0x66+p*36] = p<2 ? 0 : 3; }
  });
  function frame(f: number) {
    message(0x3a, v => v.setInt32(1,f));
    for(let p=0;p<2;p++) {
      message(0x37,(v,b) => { v.setInt32(1,f); b[5]=p; v.setUint16(8,14); v.setFloat32(25, Math.sin(f)); });
      message(0x38,(v,b) => { v.setInt32(1,f); b[5]=p; b[7]=p===0?1:22; v.setUint16(8,14);
        if (defenseFixture && p===0) {
          v.setUint16(8, f>=20 && f<=30 ? 87 : 20);
          b[0x29] = f>=20 && f<25 ? 0x02 : 0;
          b[0x27] = f>=10 && f<15 ? 0x08 : 0;
        }
        v.setFloat32(22, Math.max(0,f)%200); b[32]=1-p; b[33]=4-Math.min(3,Math.floor(Math.max(0,f)/500)); });
    }
    message(0x3c,v => { v.setInt32(1,f); v.setInt32(5,f-7); });
  }
  for(let f=-123;f<count;f++) { frame(f); if(rollback && f===100) { frame(99);frame(100); } }
  if(complete) message(0x39,(_v,b) => { b[1]=2; });
  const body = Buffer.concat(parts); const header=Buffer.from([0x7b,0x55,3,0x72,0x61,0x77,0x5b,0x24,0x55,0x23,0x6c,0,0,0,0]);
  header.writeUInt32BE(body.length,11);return Buffer.concat([header,body]);
}

for (const rollback of [false,true]) for(const complete of [false,true]) {
  test(`streamed analysis preserves inputs and stats (rollback=${rollback}, complete=${complete})`, async () => {
    const bytes=recording(2000,rollback,complete), game=new SlippiGame(bytes);
    const frames=game.getFrames(), stats=game.getStats()!; let peak=0;
    const result=await analyzeReplay(new Blob([bytes]), (m: any) => { peak=Math.max(peak,m.analysisRetainedFrames); });
    assert.ok(peak<=8, `retained ${peak} frame trees`);
    assert.equal(result.first,-123); assert.equal(result.last,1999);
    assert.equal(result.combos.length,stats.combos.filter(c=>c.moves.length).length);
    assert.equal(result.liveStats.every((p: any)=>p.summary.incomplete),!complete);
    for(const p of result.players) {
      assert.deepEqual(p.overall,stats.overall.find(o=>o.playerIndex===p.index));
      for(let f=result.first;f<=result.last;f++) {
        const entry=frames[f].players[p.index]!;
        const pre=entry.pre!, post=entry.post!;
        const expected=new Float32Array([1,pre.joystickX||0,pre.joystickY||0,pre.cStickX||0,pre.cStickY||0,
          pre.physicalButtons??pre.buttons??0,pre.physicalLTrigger||0,pre.physicalRTrigger||0,post.percent||0,post.stocksRemaining||0,post.positionX??NaN,0]);
        assert.deepEqual(p.inputs.subarray((f-result.first)*result.stride,(f-result.first+1)*result.stride),expected);
      }
    }
  });
}
test('streaming preserves actual hitstun flags and rejects neutral during combo grace', async()=>{
  const result=await analyzeReplay(new Blob([recording(100,false,true,true)]));
  const p=result.players.find((p:any)=>p.index===0);
  const eligible=(frame:number)=>p.inputs[(frame-result.first)*result.stride+11];
  assert.deepEqual(p.techniques.filter((e:any)=>e.label==='Fast fall').map((e:any)=>e.frame),[10]);
  assert.equal(eligible(19),0);
  assert.equal(eligible(20),1);
  assert.equal(eligible(24),1);
  assert.equal(eligible(25),0); // damage animation persists, actual hitstun ended
  assert.equal(eligible(31),0); // dash while combo statistics remain open
  assert.ok(p.defenseCombos.some((c:any)=>c.frame<=31&&c.endFrame>31));
});

import test from 'node:test';
import assert from 'node:assert/strict';
import { overlayAt } from '../src/index.mjs';
test('pure overlay model hides interrupted attacks even after defense clears', () => {
 const analysis={first:0,last:50,stride:12,players:[{index:0,port:1,name:'Player',inputs:new Float32Array(51*12),defense:[],defenseCombos:[],techniques:[{frame:5,label:'Back air',category:'offense',inputs:['C ←'],endFrame:9}]}]};
 assert.equal(overlayAt(analysis,8)[0].technique,'Back air');
 assert.equal(overlayAt(analysis,10)[0].technique,'');
 assert.equal(overlayAt(analysis,8)[0].technique,'Back air');
 assert.deepEqual(overlayAt(analysis,-1),[]);
 assert.deepEqual(overlayAt(analysis,51),[]);
 assert.deepEqual(overlayAt(analysis,1.5),[]);
});

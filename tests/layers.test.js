import test from 'node:test';
import assert from 'node:assert/strict';
import {initialState,options} from '../src/engine.js';
import {decisionLayers,analyze,manage,monteCarlo,execute} from '../src/manager-options.js';
test('layer selections validate, remain immutable, and execute one hold',()=>{
  const s=initialState(),n=execute(s,{offense:'motion',defense:'double',action:'drive'});
  assert.equal(n.sets.LAL,'motion'); assert.equal(n.defense.SAC,'double'); assert.equal(n.turn,1); assert.equal(s.turn,0);
  assert.throws(()=>manage(s,{defense:'bad'})); s.phase='final'; assert.deepEqual(decisionLayers(s),[]);
});
test('all arguments cite source-tagged facts and include both sides and contingencies',()=>{
  const s=initialState();
  for(const o of options(s)) { const a=analyze(s,{action:o.id}); for(const key of ['pro','con','attack','contingency']) assert.ok(a[key].length); for(const f of a.facts) assert.ok(['實際','估計'].includes(f.source)); assert.deepEqual(a.points.map(p=>p.sign),['+','−']); }
});
test('paired seeded full-game comparisons are reproducible and reject empty sample',()=>{
  const s=initialState(); s.quarter=4; s.clock=18;
  const a=monteCarlo(s,{action:'three'},12,9); assert.deepEqual(a,monteCarlo(s,{action:'three'},12,9));
  for(const side of ['selected','baseline']) { assert.ok(a[side].winProbability>=0&&a[side].winProbability<=1); assert.ok(a[side].expectedPoints>=0&&a[side].expectedPoints<=4); }
  assert.equal(monteCarlo(s,{action:'pullup'},12).delta,0); assert.throws(()=>monteCarlo(s,{},0));
});

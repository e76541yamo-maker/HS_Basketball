import test from 'node:test';
import assert from 'node:assert/strict';
import {initialState,play,options,substitute,timeout,bench,TEAMS} from '../src/engine.js';

test('real rosters contain players only and sourced season rates',()=>{
  assert.equal(TEAMS.LAL.length,15); assert.equal(TEAMS.SAC.length,14);
  for(const p of Object.values(TEAMS).flat()) { assert.ok(p.g>0); assert.ok(p.fg_pct>=0&&p.fg_pct<=1); assert.equal(p.source,'實際'); }
});
test('pass ends exactly one hold and changes handler; deterministic immutable state',()=>{
  for(let seed=1;seed<100;seed++) { const s=initialState(seed), before=structuredClone(s), n=play(s,options(s)[0].id); assert.deepEqual(s,before); assert.equal(n.turn,1); assert.notEqual(n.handler,s.handler); assert.ok(n.elapsed>0); assert.deepEqual(n,play(s,options(s)[0].id)); }
});
test('substitutions and timeouts preserve clocks and validate resources',()=>{
  let s=initialState(); const incoming=bench(s,'LAL')[0].id, outgoing=s.handler;
  s=substitute(s,'LAL',outgoing,incoming); assert.equal(s.handler,incoming); assert.equal(s.clock,720);
  assert.throws(()=>substitute(s,'LAL',outgoing,incoming));
  for(let i=0;i<6;i++) s=timeout(s,'LAL'); assert.throws(()=>timeout(s,'LAL')); assert.equal(s.turn,0);
  assert.throws(()=>play(s,'bad'));
});
test('regulation ties enter overtime and overtime decides a winner',()=>{
  let s=initialState(2); s.quarter=4; s.clock=1; s.score={LAL:80,SAC:80}; s=play(s,'hold'); assert.equal(s.quarter,5); assert.equal(s.clock,300); assert.equal(s.phase,'playing');
  s.clock=1; s.score.LAL++; s=play(s,'hold'); assert.equal(s.phase,'final'); assert.throws(()=>play(s,'hold')); assert.deepEqual(options(s),[]);
});
test('seeded many-game sweep: legal increments, monotonic clocks, floor/stamina invariants and finals',()=>{
  const kinds=new Set();
  for(let seed=1;seed<=100;seed++) {
    let s=initialState(seed);
    while(s.phase==='playing'&&s.turn<2500) {
      const acts=options(s), action=acts[(s.turn+seed)%acts.length].id, n=play(s,action);
      kinds.add(n.last.kind);
      for(const team of ['LAL','SAC']) { const delta=n.score[team]-s.score[team]; assert.ok(delta>=0&&delta<=4); if(team!==s.possession) assert.equal(delta,0); assert.equal(new Set(n.lineups[team]).size,5); }
      assert.ok(n.elapsed>s.elapsed); assert.ok(n.quarter>s.quarter||n.clock<s.clock); assert.ok(n.shotClock>0&&n.shotClock<=24); assert.ok(n.lineups[n.possession].includes(n.handler));
      for(const x of Object.values(n.stamina)) assert.ok(x>=0&&x<=100);
      if(action.startsWith('pass:')) assert.notEqual(n.handler,s.handler);
      s=n;
    }
    assert.equal(s.phase,'final'); assert.notEqual(s.score.LAL,s.score.SAC); assert.equal(s.clock,0);
  }
  for(const word of ['進算加罰','投籃犯規','進攻籃板','防守籃板','失誤']) assert.ok([...kinds].some(k=>k.includes(word)),word);
});

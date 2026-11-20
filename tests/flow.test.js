import test from 'node:test';
import assert from 'node:assert/strict';
import {initialState,DATA,play,copy,simulatePossession,manage,freeThrowsRemaining,replayState,distribution} from '../src/engine.js';
import {MOMENTS,momentState} from '../src/scenarios.js';
import {restore,addBranch,validState,STORAGE_KEY} from '../src/branch-tree.js';
test('situation tabs are real PBP windows; alternatives, undo snapshots and safe autosave branches',()=>{
 const s=initialState();assert.equal(STORAGE_KEY,'courtside.possession.2015.v3');assert.ok(validState(s));
 for(const m of MOMENTS){const n=momentState(m.id);assert.ok(validState(n));assert.ok(DATA.windows[n.cursor].decision);}
 const before=copy(s),n=play(s,'transition');assert.deepEqual(s,before);assert.equal(n.mode,'simulation');
 assert.ok(validState(n));assert.ok(n.turn>=1);assert.throws(()=>play(n,'replay'));
 const saved={state:n,previous:s,branches:addBranch([],s)};
 assert.deepEqual(restore(JSON.stringify(saved)),saved);
 for(const state of [{...n,version:2},{...n,clock:-1},{...n,score:{CLE:-1,GSW:0}},{...n,lineups:{CLE:[],GSW:[]}},{...n,timeouts:{CLE:99,GSW:0}}])assert.equal(restore(JSON.stringify({...saved,state})),null);
 assert.equal(restore('bad json'),null);assert.equal(restore(null),null);
});
test('simulated non-decision possessions auto-advance, with a bounded short log',()=>{
 const candidates=Array.from({length:40},(_,seed)=>({s:initialState(seed),seed})).find(({s})=>{const n=simulatePossession(s,'transition');return n.phase==='playing'&&!n.decisionReasons.length;});
 assert.ok(candidates);const s=play(candidates.s,'transition');assert.ok(s.turn>=2);assert.ok(s.autoAdvanced>0);assert.ok(s.decisionReasons.length);
 assert.ok(s.log.length>0&&s.log.length<=12);assert.ok(s.log.every(x=>x.startsWith('估計')));
});
test('timeouts/substitutions fork without changing score or possession; invalid resources are rejected',()=>{
 const s=initialState(),id=s.lineups.CLE[0],bench=Object.keys(DATA.players).find(id=>DATA.players[id].team==='CLE'&&!s.lineups.CLE.includes(id));
 const t=manage(s,{type:'timeout',team:'CLE'});assert.equal(t.timeouts.CLE,7);assert.equal(s.timeouts.CLE,8);assert.equal(t.mode,'simulation');assert.deepEqual(t.score,s.score);
 const n=manage(s,{type:'substitution',team:'CLE',out:id,in:bench});assert.ok(n.lineups.CLE.includes(bench));assert.equal(n.lineups.CLE.length,5);assert.ok(validState(n));
 assert.throws(()=>manage({...s,timeouts:{CLE:0,GSW:8}},{type:'timeout',team:'CLE'}));
 assert.throws(()=>manage(s,{type:'substitution',team:'CLE',out:id,in:s.lineups.CLE[1]}));
 assert.throws(()=>manage({...s,decisionReasons:['末節每回合']},{type:'substitution',team:'CLE',out:id,in:bench}));
});
test('foul-window remaining free throws survive management branches and forbid live play types',()=>{
 const index=DATA.windows.findIndex((_,i)=>freeThrowsRemaining(replayState(i))>0);
 const s=replayState(index),count=freeThrowsRemaining(s);assert.ok(count>0);
 const d=distribution(s,'freeThrows');assert.equal(d.turnover,0);assert.equal(d.seconds,0);assert.ok(Math.abs(d.points.reduce((a,b)=>a+b,0)-1)<1e-10);assert.ok(d.points.slice(count+1).every(x=>x===0));
 assert.throws(()=>play(s,'pnr'));
 const t=manage(s,{type:'timeout',team:s.possession});assert.equal(freeThrowsRemaining(t),count);
 const n=simulatePossession(t,'freeThrows');assert.equal(n.turn,t.turn+1);assert.equal(n.pendingFreeThrows,0);
 assert.throws(()=>play({...n,phase:'final'},'pnr'));assert.throws(()=>simulatePossession(n,'freeThrows'));
});

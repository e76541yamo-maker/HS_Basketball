import test from 'node:test';
import assert from 'node:assert/strict';
import {MOMENTS,momentState} from '../src/scenarios.js';
import {restore,addBranch,validState} from '../src/branch-tree.js';
import {play} from '../src/engine.js';
test('real key moments roundtrip and branch without overwriting replay',()=>{
 for(const m of MOMENTS) {const state=momentState(m.id),previous=structuredClone(state),next=play(state,'shoot'),branches=addBranch([],state);assert.equal(next.mode,'simulation');assert.deepEqual(state,previous);assert.deepEqual(restore(JSON.stringify({state:next,previous,branches})),{state:next,previous,branches});}
});
test('old/corrupt saves reject; branch cap and no mutable snapshot sharing',()=>{
 for(const text of [null,'','{','{}','{"state":{"version":1}}'])assert.equal(restore(text),null);
 const s=momentState('start');s.positions[0][1]='bad';assert.equal(validState(s),false);
 let b=[];for(let i=0;i<40;i++)b=addBranch(b,momentState('start'));assert.equal(b.length,30);assert.throws(()=>momentState('bad'));
});

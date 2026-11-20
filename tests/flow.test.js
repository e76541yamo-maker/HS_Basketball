import test from 'node:test';
import assert from 'node:assert/strict';
import {MOMENTS,momentState} from '../src/scenarios.js';
import {restore,addBranch,validState} from '../src/branch-tree.js';
import {execute} from '../src/manager-options.js';
import {options} from '../src/engine.js';

test('all scenario flows play, branch, undo, roundtrip without mutating roots',()=>{
  for(const m of MOMENTS) {
    const state=momentState(m.id), previous=structuredClone(state), branches=addBranch([],state);
    const next=execute(state,{action:options(state)[0].id});
    assert.equal(next.turn,state.turn+1); assert.deepEqual(state,previous); assert.deepEqual(branches[0].state,state);
    assert.deepEqual(restore(JSON.stringify({state:next,branches,previous})),{state:next,branches,previous});
  }
});
test('invalid and empty autosave safely reject; branch retention bounded',()=>{
  for(const text of [null,'','{','{}','{"state":{"version":1}}']) assert.equal(restore(text),null);
  const s=momentState('start'); s.lineups.LAL[0]='bad'; assert.equal(validState(s),false);
  let branches=[]; for(let i=0;i<40;i++) branches=addBranch(branches,momentState('start')); assert.equal(branches.length,30);
  assert.throws(()=>momentState('bad'));
});

import test from 'node:test';
import assert from 'node:assert/strict';
import {initialState,simulatePossession,copy,DATA,replayState,freeThrowsRemaining,policy,other,distribution,winProbability} from '../src/engine.js';

test('attempts after the buzzer cannot score or foul',()=>{
 for(let seed=0;seed<100;seed++){
  const s=initialState(seed);s.quarter=4;s.clock=.1;s.score={CLE:80,GSW:79};
  const n=simulatePossession(s,{action:'pnr'});
  assert.deepEqual(n.score,s.score);assert.deepEqual(n.personalFouls,s.personalFouls);assert.equal(n.phase,'final');
 }
});

import test from 'node:test';
import assert from 'node:assert/strict';
import {initialState,simulatePossession,copy,DATA,replayState,freeThrowsRemaining,policy,other,distribution,winProbability,lineupAdjustment} from '../src/engine.js';
import {monteCarlo} from '../src/manager-options.js';
import {evaluateOption} from '../src/model-comparison.js';

test('attempts after the buzzer cannot score or foul',()=>{
 for(let seed=0;seed<100;seed++){
  const s=initialState(seed);s.quarter=4;s.clock=.1;s.score={CLE:80,GSW:79};
  const n=simulatePossession(s,{action:'pnr'});
  assert.deepEqual(n.score,s.score);assert.deepEqual(n.personalFouls,s.personalFouls);assert.equal(n.phase,'final');
 }
});

test('late free throw remedies retain distinct defenses',()=>{
 const s=initialState();s.quarter=4;s.clock=20;s.score={CLE:80,GSW:83};s.pendingFreeThrows=2;
 const result=monteCarlo(s,{action:'freeThrows'},64);
 assert.ok(result.riskBranches.length);
 assert.ok(result.riskBranches.some(r=>new Set(r.remedies.map(x=>x.expectedMargin)).size>1));
});

test('technical free throws remain pending and preserve possession',()=>{
 const states=DATA.windows.map((_,i)=>replayState(i));
 const s=states.find(s=>s.pendingTechnicalFreeThrows>0);
 assert.ok(s);assert.equal(freeThrowsRemaining(s),1);
 const n=simulatePossession(s,{action:'freeThrows'});
 assert.equal(n.possession,s.possession);assert.equal(n.turn,s.turn);assert.equal(n.clock,s.clock);assert.equal(freeThrowsRemaining(n),0);
});

test('intentional foul preview uses penalty or retained inbound',()=>{
 const s=initialState();s.quarter=4;s.clock=20;s.score={CLE:85,GSW:80};
 const preview=evaluateOption(s,{action:'pnr',defense:'intentional'});
 const next=simulatePossession(s,{action:'pnr',defense:'intentional'});
 assert.equal(preview.expectedPoints,0);assert.equal(preview.winProbabilityAfter,winProbability(next,'CLE'));
 s.teamFouls.GSW=4;
 const ft=evaluateOption(s,{action:'pnr',defense:'intentional'});
 const d=distribution(s,'pnr',{defense:'intentional'});
 assert.equal(ft.expectedPoints,2*(d.ftAdjustment??d.adjustment)*lineupAdjustment(s).ft);
});

test('advanced branches compare against the current team policy',()=>{
 const s=simulatePossession(initialState(),{action:'roll'});
 const r=monteCarlo(s,policy(s),1);
 assert.match(r.baselineLabel,/目前陣容/);assert.equal(r.delta,0);assert.equal(r.modelDelta,0);
 const historical=monteCarlo(initialState(),{action:'pnr'},1);
 assert.equal(historical.baselineLabel,DATA.possessions[0].description);
});

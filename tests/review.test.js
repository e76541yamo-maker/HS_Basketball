import test from 'node:test';
import assert from 'node:assert/strict';
import {initialState,simulatePossession,copy,DATA,replayState,freeThrowsRemaining,policy,other,distribution,winProbability,lineupAdjustment} from '../src/engine.js';
import {monteCarlo} from '../src/manager-options.js';
import {evaluateOption} from '../src/model-comparison.js';
import {restore} from '../src/branch-tree.js';

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

test('restore remaps stale cursors and drops only invalid auxiliary states',()=>{
 const state=initialState();state.cursor=9999;
 const restored=restore(JSON.stringify({state,previous:{},branches:[{name:'bad',state:{}},{name:'good',state}]}));
 assert.equal(restored.state.cursor,0);assert.equal(restored.previous,null);assert.equal(restored.branches.length,1);
 const simulation=simulatePossession(initialState(),{action:'pnr'});simulation.cursor=9999;
 assert.equal(restore(JSON.stringify({state:simulation,branches:[]})).state.cursor,DATA.windows.length-1);
 const final={...initialState(),phase:'final',clock:0};
 assert.equal(restore(JSON.stringify({state:final,branches:[]})).state.phase,'final');
});

test('preview gives no scoring odds when the fastest attempt misses the buzzer',()=>{
 const s=initialState();s.quarter=4;s.clock=.1;s.score={CLE:80,GSW:79};
 for(const action of ['pnr','transition','spotup']){
  const preview=evaluateOption(s,{action});
  assert.equal(preview.expectedPoints,0);
  assert.equal(preview.winProbabilityAfter,winProbability(simulatePossession(s,{action}),'CLE'));
 }
});

test('technical free throw simulation marks divergence without changing turn or team',()=>{
 const s=DATA.windows.map((_,i)=>replayState(i)).find(s=>s.pendingTechnicalFreeThrows>0);
 const n=simulatePossession(s,{action:'freeThrows'});
 assert.equal(n.turn,s.turn);assert.equal(n.possession,s.possession);assert.equal(n.diverged,true);
 assert.match(monteCarlo(n,policy(n),1).baselineLabel,/目前陣容/);
});

test('technical FT rollouts evaluate the subsequent complete live possession',()=>{
 const s=DATA.windows.map((_,i)=>replayState(i)).find(s=>s.pendingTechnicalFreeThrows>0);
 const r=monteCarlo(s,{action:'freeThrows'},64);
 assert.ok(r.selected.expectedPoints>1);
 assert.ok(r.riskBranches.every(r=>r.remedies.every(x=>x.state.turn>s.turn)));
});

test('technical FT scoring and live continuation outcomes are independent',()=>{
 const s=DATA.windows.map((_,i)=>replayState(i)).find(s=>s.pendingTechnicalFreeThrows>0);
 const count=64,seed=20151225,expected={score:0,empty:0,turnover:0};
 const liveOutcomes={score:0,empty:0,turnover:0},riskStates={};
 let scoredBeforeEmpty=0,scoredBeforeTurnover=0,totalPoints=0;
 for(let i=0;i<count;i++){
  const start=copy(s);start.seed=(seed+Math.imul(i+1,2654435761))>>>0;
  let next=simulatePossession(start,{action:'freeThrows'});
  while(next.phase!=='final'&&next.turn===start.turn)next=simulatePossession(next,policy(next));
  const points=next.score[s.possession]-s.score[s.possession];
  const liveKind=next.last.kind==='foul'?'empty':next.last.kind;
  liveOutcomes[liveKind]++;totalPoints+=points;
  if(points>0&&liveKind==='empty')scoredBeforeEmpty++;
  if(points>0&&liveKind==='turnover')scoredBeforeTurnover++;
  if(points>0)expected.score++;
  const riskKind=liveKind==='turnover'?'turnover':points===0?'empty':null;
  if(riskKind){expected[riskKind]++;riskStates[riskKind]??=next;}
 }
 assert.ok(scoredBeforeEmpty>0);
 assert.ok(scoredBeforeTurnover>0);
 assert.ok(expected.empty>0);assert.ok(expected.turnover>0);
 const result=monteCarlo(s,{action:'freeThrows'},count,seed);
 assert.deepEqual(result.selected.outcomes,expected);
 assert.deepEqual(result.selected.liveOutcomes,liveOutcomes);
 assert.equal(result.selected.expectedPoints,totalPoints/count);
 assert.ok(result.selected.outcomes.turnover>=scoredBeforeTurnover);
 assert.ok(result.riskBranches.some(r=>r.kind==='turnover'));
 for(const risk of result.riskBranches){
  assert.equal(risk.count,expected[risk.kind]);
  assert.ok(risk.remedies.every(r=>JSON.stringify(r.state.score)===JSON.stringify(riskStates[risk.kind].score)));
  if(risk.kind==='empty')assert.ok(risk.remedies.every(r=>r.state.score[s.possession]===s.score[s.possession]));
 }
});

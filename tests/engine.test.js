import test from 'node:test';
import assert from 'node:assert/strict';
import {DATA,initialState,replayState,play,options,policy,profile,currentHold,simulateHold,leverage} from '../src/engine.js';
import {analyze,monteCarlo} from '../src/manager-options.js';
import {momentState} from '../src/scenarios.js';

test('independent box score agrees; every matched shot has one bounded same-player alignment',()=>{
 const v=DATA.meta.validation;assert.equal(v.boxPlayerMatchRate,1);assert.equal(v.scoreMatch,true);assert.equal(v.pbpShots,173);assert.deepEqual(v.finalScore,{CLE:83,GSW:89});
 for(const e of DATA.events.filter(e=>e.matched)) {const h=DATA.holds[e.hold];assert.equal(h.player,e.player);assert.equal(h.event,e.id);assert.ok(e.alignmentOffset<=5&&e.alignmentOffset>=-.4);}
 assert.equal(DATA.holds.filter(h=>h.endKind==='pass').length,v.passes);
});
test('complete historical replay preserves score increments and clock order, and passes change controller',()=>{
 let s=initialState(),steps=0;
 while(s.phase==='playing') {
  const h=currentHold(s),n=play(s,'replay');assert.equal(n.turn,s.turn+(h?1:0));assert.ok(n.elapsed>=s.elapsed);assert.ok(n.quarter>s.quarter||n.clock<=s.clock);
  for(const t of ['CLE','GSW'])assert.ok(n.score[t]>=s.score[t]&&n.score[t]-s.score[t]<=3);
  if(h?.endKind==='pass')assert.notEqual(n.handler,s.handler);
  s=n;steps++;
 }
 assert.equal(steps,DATA.timeline.length);assert.equal(s.turn,DATA.holds.length);assert.deepEqual(s.score,{CLE:83,GSW:89});assert.equal(s.clock,0);assert.deepEqual(options(s),[]);assert.throws(()=>play(s,'replay'));
});
test('seeded 100-game sweep from tracked start: legal scores, clocks, holds and decisive finals',()=>{
 for(let seed=1;seed<=100;seed++) {
  let s=initialState(seed),guard=0;
  while(s.phase==='playing'&&guard++<16000) {
   const a=policy(s),before=structuredClone(s),n=play(s,a);assert.deepEqual(s,before);
   assert.equal(n.turn,s.turn+1);assert.ok(n.elapsed>s.elapsed);assert.ok(n.quarter>s.quarter||n.clock<s.clock);assert.ok(n.shotClock>0&&n.shotClock<=24);assert.ok(n.lineups[n.possession].includes(n.handler));assert.equal(n.positionsActual,false);
   if(a.startsWith('pass:'))assert.notEqual(n.handler,s.handler);
   for(const t of ['CLE','GSW'])assert.ok(n.score[t]>=s.score[t]&&n.score[t]-s.score[t]<=4);
   s=n;
  }
  assert.equal(s.phase,'final');assert.notEqual(s.score.CLE,s.score.GSW);assert.equal(s.clock,0);
 }
});
test('overtime, illegal actions, learned cells and empty samples',()=>{
 let s=initialState(2);s.quarter=4;s.clock=.1;s.score={CLE:80,GSW:80};s=play(s,'reset');assert.equal(s.quarter,5);assert.equal(s.clock,300);
 s.clock=.1;s.score.CLE++;s=play(s,'reset');assert.equal(s.phase,'final');assert.throws(()=>play(initialState(),'bad'));
 const p=profile(initialState());assert.ok(p.fg>0&&p.fg<1);assert.ok(leverage(initialState())>0);assert.throws(()=>monteCarlo(initialState(),{},0));
});
test('cited analysis and paired Monte Carlo versus the real action are reproducible; risk remedies ranked',()=>{
 const cursor=DATA.timeline.findIndex(x=>x.kind==='hold'&&DATA.holds[x.index].q===4&&DATA.holds[x.index].clock<30);const s=replayState(cursor);
 const a=analyze(s,{action:'shoot'});assert.ok(a.pro.length&&a.con.length&&a.contingency.length);assert.ok(a.facts.every(f=>['實際','估計'].includes(f.source)));
 const m=monteCarlo(s,{action:'shoot'},6,5);assert.deepEqual(m,monteCarlo(s,{action:'shoot'},6,5));assert.ok(m.selected.winProbability>=0&&m.selected.winProbability<=1);assert.equal(m.baseline.count,6);
 assert.equal(Object.values(m.selected.outcomes).reduce((a,b)=>a+b),6);for(const risk of m.riskBranches)assert.ok(risk.remedies.every((r,i,rs)=>i===0||r.expectedMargin<=rs[i-1].expectedMargin));
});
test('late Smith hold has plausible comeback probability and non-tied point-margin remedies',()=>{
 const s=momentState('key3');assert.deepEqual(s.score,{CLE:77,GSW:83});assert.ok(s.clock>77&&s.clock<78);assert.equal(s.handler,'2747');
 const m=monteCarlo(s,{action:'shoot'});assert.equal(m.count,2048);assert.ok(m.selected.winProbability>=.05&&m.selected.winProbability<=.10,JSON.stringify(m.selected));
 assert.deepEqual(m.riskBranches.map(r=>r.kind).sort(),['empty','turnover']);
 for(const risk of m.riskBranches) {
  assert.equal(risk.remedies.length,3);assert.ok(new Set(risk.remedies.map(r=>r.expectedMargin.toFixed(2))).size>1);
  for(const [i,r] of risk.remedies.entries()) {assert.equal(r.count,256);assert.ok(Number.isFinite(r.expectedMargin));if(i)assert.ok(r.expectedMargin<=risk.remedies[i-1].expectedMargin);}
 }
 const alternate=monteCarlo(s,{action:'shoot'},1024,54321);assert.ok(alternate.selected.winProbability>=.03&&alternate.selected.winProbability<=.13);
 const con=analyze(s,{action:'shoot'}).points.find(p=>p.sign==='−');assert.ok(con.detail.length>0&&con.facts.length>=4);assert.ok(con.facts.some(f=>f.source==='實際')&&con.facts.some(f=>f.source==='估計'));
 console.log('ENDGAME',JSON.stringify({win:m.selected.winProbability,baseline:m.baseline.winProbability,risks:m.riskBranches.map(r=>({kind:r.kind,remedies:r.remedies.map(p=>({id:p.id,margin:p.expectedMargin,win:p.winProbability,count:p.count}))}))}));
});
test('endgame tactics preserve clock budgets, add transition time, and stop-clock fouling is situational',()=>{
 const s=momentState('key3');s.clock=30;s.possession='GSW';s.handler=s.lineups.GSW[0];s.shotClock=24;
 const n=simulateHold(s,'reset');assert.match(n.last.kind,/戰術犯規/);assert.equal(n.clock,28.5);assert.equal(n.possession,'CLE');assert.ok(n.score.GSW-s.score.GSW<=2);
 const advance=simulateHold(n,'reset');assert.ok(advance.last.seconds>=4.4);assert.equal(advance.positionsActual,false);assert.notEqual(advance.zone,'backcourt');
 const close=structuredClone(s);close.clock=35;close.score.CLE=82;assert.doesNotMatch(simulateHold(close,'reset').last.kind,/戰術犯規/);
 const early=structuredClone(s);early.clock=80;assert.doesNotMatch(simulateHold(early,'reset').last.kind,/戰術犯規/);assert.equal(policy(early),'reset');
});

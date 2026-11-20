import test from 'node:test';
import assert from 'node:assert/strict';
import {DATA,initialState,copy,play,distribution,replayState,policy} from '../src/engine.js';
import {MODEL_DATA} from '../src/evaluation-models.js';
import {restore} from '../src/branch-tree.js';
import {SEGMENTS,clutch,managedStop,segmentState,modeState,historicalSegment,runSegment,coachDecision,playMix,targetBoost,segmentMonteCarlo,segmentComparison,segmentAnalysis,segmentRemedies} from '../src/segments.js';
import {comparisonTable} from '../src/comparison-table.js';
import {monteCarlo} from '../src/manager-options.js';

test('eight to ten coach segments use quarter starts and historical timeouts, with no short segments',()=>{
 assert.ok(SEGMENTS.length>=8&&SEGMENTS.length<=10);
 for(const q of [1,2,3,4])assert.ok(SEGMENTS.some(g=>g.quarter===q&&g.clock===720));
 for(const g of SEGMENTS){
  assert.ok(g.end.time-g.time>=120);
  const w=DATA.windows[g.cursor];assert.ok(w.reasons.includes('暫停')||w.reasons.includes('節次開始'));
 }
 console.log('SEGMENTS:',JSON.stringify(SEGMENTS.map(g=>({quarter:g.quarter,clock:g.clock,reason:g.reason,end:g.end.time}))));
});

test('historical segment replay preserves exact score and selectively stops for each managed team',()=>{
 const totals={};
 for(const team of ['CLE','GSW']){
  let s=segmentState(0,team),decisions=0,coaches=0;
  while(s.phase!=='final'&&decisions<60){
   if(!clutch(s))coaches++;else assert.ok(managedStop(s));
   s=historicalSegment(s);decisions++;
  }
  assert.equal(s.phase,'final');assert.deepEqual(s.score,{CLE:83,GSW:89});assert.equal(s.turn,193);
  assert.equal(coaches,SEGMENTS.length);assert.ok(decisions>=15&&decisions<=24);
  totals[team]=decisions;
 }
 assert.deepEqual(totals,{CLE:22,GSW:15});
 console.log('HISTORICAL SEGMENT DECISIONS:',JSON.stringify(totals),'(CLE trails throughout the final two minutes, so every defensive possession also stops)');
});

test('tempo changes transition share and possession count; weaker target increases expected PPP',()=>{
 const s=segmentState(),c=s.coach;
 assert.ok(playMix(s,{...c,tempo:'push'}).transition>playMix(s,{...c,tempo:'slow'}).transition);
 const slow=segmentMonteCarlo(s,{...c,tempo:'slow'},48),push=segmentMonteCarlo(s,{...c,tempo:'push'},48);
 assert.ok(push.possessions>slow.possessions);
 const targets=[...s.lineups.GSW].sort((a,b)=>MODEL_DATA.players[a].bpm-MODEL_DATA.players[b].bpm);
 const weak={...c,target:targets[0]},strong={...c,target:targets.at(-1)};
 assert.ok(targetBoost(s,weak)>targetBoost(s,strong));
 const ppp=c=>{const d=distribution(s,'pnr',coachDecision(s,c,()=>.5));return (1-d.turnover)*d.points.reduce((n,p,i)=>n+p*i,0);};
 assert.ok(ppp(weak)>ppp(strong));
 console.log('TEMPO POSSESSIONS:',JSON.stringify({slow:slow.possessions,push:push.possessions}));
});

test('coach lineups, timeout budgets, fatigue and persisted mode are validated without changing possession mode',()=>{
 const s=segmentState(),before=copy(s),c=s.coach;
 assert.throws(()=>runSegment(s,{...c,lineup:c.lineup.slice(1)}));
 assert.throws(()=>runSegment(s,{...c,target:s.lineups.CLE[0]}));
 assert.throws(()=>segmentMonteCarlo(s,c,0));
 assert.throws(()=>modeState(s,'invalid'));
 assert.throws(()=>runSegment({...s,timeouts:{CLE:0,GSW:8}},{...c,timeout:true}));
 const bench=Object.keys(DATA.players).find(id=>DATA.players[id].team==='CLE'&&!c.lineup.includes(id));
 const n=runSegment(s,{...c,timeout:true,lineup:[bench,...c.lineup.slice(1)]});
 assert.equal(n.timeouts.CLE,s.timeouts.CLE-1);assert.ok(Object.values(n.fatigue).some(n=>n>0));assert.deepEqual(s,before);
 const restored=restore(JSON.stringify({state:n,previous:s,branches:[{name:'coach',state:s}]}));
 assert.deepEqual(restored.state,n);assert.equal(restored.state.playMode,'segment');
 const original=initialState(45),switched=modeState(modeState(original,'segment'),'possession');
 const expected=play(original,'transition'),actual=play(switched,'transition');
 delete actual.playMode;delete actual.coach;assert.deepEqual(actual,expected);
});

test('segment MC distributions, model comparison, evidence and remedy outputs are finite',()=>{
 const s=segmentState();s.valueModel='impact';s.wpModel='brownian';
 const r=segmentMonteCarlo(s,s.coach,24);
 assert.equal(r.histogram.reduce((n,b)=>n+b.count,0),24);assert.ok(r.percentiles[0]<=r.percentiles[1]&&r.percentiles[1]<=r.percentiles[2]);
 assert.ok(r.meanWP>=0&&r.meanWP<=1);assert.equal(r.valueModel,'impact');assert.equal(r.wpModel,'brownian');
 const comparison=segmentComparison(s,s.coach,4);assert.equal(comparison.columns.length,6);assert.equal(comparison.rows.length,3);
 assert.match(comparisonTable(s,{},comparison),/推進節奏/);
 assert.doesNotMatch(comparisonTable(s,{},comparison),/先驗期望分/);
 assert.ok(comparison.rows.every(row=>row.values.every(v=>Number.isFinite(v.winProbabilityAfter)&&Number.isFinite(v.expectedPoints))));
 const a=segmentAnalysis(s,r);assert.ok(a.points.every(p=>p.facts.length));assert.ok(a.facts.some(f=>f.source==='實際'));
 const remedies=segmentRemedies(s,s.coach,8);assert.equal(remedies.length,4);assert.ok(remedies[0].meanMargin>=remedies.at(-1).meanMargin);
 const final={...s,phase:'final'};assert.deepEqual(segmentComparison(final).rows,[]);assert.match(comparisonTable(final,{},segmentComparison(final)),/終場沒有可比較/);assert.throws(()=>runSegment(final));
});

test('seeded segment games terminate with legal scores, clocks, lineups and selective late decisions including OT',()=>{
 let overtime=0;
 for(let seed=0;seed<50;seed++){
  let s=segmentState(0,seed%2?'CLE':'GSW');s.seed=seed;
  let decisions=0;
  while(s.phase!=='final'&&decisions<150){
   const old=s;s=runSegment(s,s.coach,clutch(s)?policy(s):undefined);decisions++;
   for(const team of ['CLE','GSW']){
    assert.ok(s.score[team]>=old.score[team]);assert.equal(new Set(s.lineups[team]).size,5);
    assert.ok(s.lineups[team].every(id=>s.personalFouls[id]<6));
   }
   assert.ok(s.quarter>old.quarter||s.clock<=old.clock);assert.ok(s.clock>=0);
   if(clutch(s)&&s.phase!=='final')assert.ok(managedStop(s));
  }
  assert.equal(s.phase,'final');if(s.quarter>4)overtime++;
 }
 const tied=segmentState();tied.quarter=4;tied.clock=.1;tied.score={CLE:80,GSW:80};
 const ot=runSegment(tied,tied.coach,{action:'pnr'});assert.equal(ot.quarter,5);assert.equal(ot.phase,'playing');
 console.log('SEGMENT SWEEP: 50 final games; overtime games',overtime,'; explicit tied regulation enters OT');
});

test('late technical free throw finishes the live continuation without repeating the free throw action',()=>{
 const original=DATA.windows.map((_,i)=>replayState(i)).find(s=>s.pendingTechnicalFreeThrows>0);
 const s=modeState({...original,quarter:4,clock:90},'segment');
 const n=runSegment(s,s.coach,{action:'freeThrows',defense:'switch'});
 assert.ok(n.turn>s.turn);assert.equal(n.pendingTechnicalFreeThrows,0);assert.ok(n.score.CLE>=s.score.CLE);
 assert.equal(n.segmentPossessions,n.turn-s.turn);
});

test('clutch defensive remedies protect the managed team without changing opponent defense',()=>{
 const s=modeState(DATA.windows.map((_,i)=>replayState(i)).find(s=>s.quarter===4&&s.clock<120&&s.possession==='GSW'&&s.score.CLE<s.score.GSW),'segment');
 const result=monteCarlo(s,policy(s),64,20151225,'CLE');
 assert.equal(result.team,'CLE');assert.equal(result.defending,true);assert.ok(result.selected.expectedPoints>0);
 assert.ok(result.riskBranches.length);assert.ok(result.riskBranches.every(r=>r.kind==='allowedScore'));
 for(const risk of result.riskBranches)for(const remedy of risk.remedies){
  assert.equal(remedy.state.plans.CLE.defense,remedy.id);assert.equal(remedy.state.coach.defense,remedy.id);
  assert.equal(remedy.state.plans.GSW.defense,s.plans.GSW.defense);
 }
 const offense=monteCarlo(s,policy(s),64,20151225);
 assert.equal(offense.team,'GSW');assert.equal(offense.defending,false);
 assert.equal(result.selected.winProbability+offense.selected.winProbability,1);
 assert.ok(Math.abs(result.selected.expectedMargin+offense.selected.expectedMargin)<1e-12);
 assert.throws(()=>monteCarlo(s,policy(s),1,1,'invalid'));
});

test('tied period endings return before an overtime possession for either managed team',()=>{
 for(const team of ['CLE','GSW'])for(const quarter of [4,5]){
  const s=segmentState(0,team);s.quarter=quarter;s.clock=.1;s.score={CLE:80,GSW:80};s.possession=team;
  const next=runSegment(s,s.coach,{action:'pnr'});
  assert.equal(next.quarter,quarter+1);assert.equal(next.clock,300);assert.equal(next.turn,s.turn+1);
  assert.equal(next.phase,'playing');assert.deepEqual(next.score,s.score);assert.deepEqual(next.decisionReasons,['節次開始']);
  assert.deepEqual(next.teamFouls,{CLE:0,GSW:0});assert.deepEqual(next.timeouts,{CLE:2,GSW:2});
 }
});

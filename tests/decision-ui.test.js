import test from 'node:test';
import assert from 'node:assert/strict';
import {DATA,other,winProbability} from '../src/engine.js';
import {momentState} from '../src/scenarios.js';
import {modeState,segmentState,historicalSegment,runSegment,segmentAnalysis,segmentMonteCarlo} from '../src/segments.js';
import {analyze} from '../src/manager-options.js';
import {approximatelySame,possessionPlans,segmentPlans,winInterval} from '../src/verification.js';
import {decisionResult,reviewSummary,emptyEvents,addEvent} from '../src/play-review.js';

test('historical fatigue updates both floor and bench through the next segment and to the final buzzer',()=>{
 const s=segmentState();
 const bench=Object.values(DATA.players).find(p=>p.team==='CLE'&&DATA.windows.filter(w=>w.state.quarter===1).every(w=>!w.state.lineups.CLE.includes(p.id)));
 assert.ok(bench);
 s.fatigue={[bench.id]:400};
 let next=historicalSegment(s);
 assert.ok(next.fatigue[bench.id]<400);
 assert.ok(next.fatigue[s.lineups.CLE[0]]>0);
 let last;
 while(next.phase!=='final'){last=next;next=historicalSegment(next);}
 assert.deepEqual(next.score,{CLE:83,GSW:89});
 assert.notDeepEqual(last.fatigue,next.fatigue);
});

test('three-plan possession projection keeps its perspective when ball control belongs to the opponent',()=>{
 const s=modeState(momentState('key3'),'possession');
 assert.equal(s.possession,'CLE');
 const rows=possessionPlans(s,{action:'spotup'},'GSW',false,{});
 assert.equal(rows.length,3);
 assert.equal(rows[0].wp,1-rows[0].winProbabilityAfter);
 assert.equal(rows[2].label,'歷史打法代理');
 assert.equal(winProbability(s,'GSW'),1-winProbability(s,other('GSW')));
 assert.ok(approximatelySame([.5,.32,.51,.33],[.51,.31,.51,.32]));
 assert.equal(approximatelySame([.8,.8,.8,.8],[.5,.5,.5,.5]),false);
 const interval=winInterval(0,12);
 assert.equal(interval[0],0);assert.ok(interval[1]>.2&&interval[1]<.3);
 assert.equal(segmentPlans(segmentState()).baseline.tempo,'normal');
});

test('historical and simulated decision feedback attributes points and identifies the next stop',()=>{
 const s=segmentState(),h=historicalSegment(s),actual=decisionResult(s,h);
 assert.deepEqual(actual.points,h.score);
 assert.equal(actual.margin,h.score.CLE-h.score.GSW);
 assert.equal(actual.source,'實際');assert.match(actual.narrative,/失誤/);assert.match(actual.next,/第 2 段/);
 const events=emptyEvents(),branch=runSegment(s,s.coach,undefined,last=>addEvent(events,last)),simulation=decisionResult(s,branch,events);
 assert.equal(simulation.source,'估計');assert.ok(events.turnovers+events.fouls+events.rebounds>0);
 assert.equal(reviewSummary({...h,decisionResults:[actual]}).best,actual);
});

test('both modes supply a current numeric citation and a condition for each local argument',()=>{
 const samples=[analyze(momentState('key3'),{action:'spotup'}),segmentAnalysis(segmentState())];
 for(const a of samples)for(const card of [a.pro,a.con,a.attack,a.contingency]){
  assert.ok(card.length>0);assert.ok(card.every(p=>/^(實際|估計)｜.*\d.*：.+；若.+。$/.test(p)&&p.length<=96));
 }
});

test('segment argument facts use the same selected plan and sample as the displayed rollout',()=>{
 const s=segmentState();s.coach.tempo='push';
 const result=segmentMonteCarlo(s,s.coach,128),a=segmentAnalysis(s,result);
 assert.equal(result.meanMargin.toFixed(2),'0.35');
 assert.match(a.summary,/128 次配對推演/);
 assert.match(a.pro[0],/區段平均淨分 0\.35 分（128 次配對推演）/);
 assert.ok(a.con[0].includes((100*result.riskRate).toFixed(1)+'%（128 次配對推演）'));
 assert.equal(a.facts.find(f=>f.label==='區段淨分').value,'0.35');
 assert.equal(a.facts.find(f=>f.label==='樣本數').value,result.count);
 assert.match(segmentAnalysis(s).summary,/12 次配對推演/);
});

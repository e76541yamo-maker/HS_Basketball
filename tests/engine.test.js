import test from 'node:test';
import assert from 'node:assert/strict';
import {DATA,initialState,replayState,simulatePossession,play,policy,copy,other,winProbability,bonus,PLAY_TYPES,distribution,lineupAdjustment,freeThrowsRemaining,manage} from '../src/engine.js';
import {analyze,monteCarlo} from '../src/manager-options.js';
import {momentState} from '../src/scenarios.js';

test('PBP possessions match score, approximately twice independent box pace, and alternate',()=>{
 const v=DATA.validation;
 assert.equal(v.possessionCount,193);assert.deepEqual(v.byTeam,{CLE:96,GSW:97});
 assert.ok(Math.abs(v.pace-v.boxPossessionEstimate)/v.boxPossessionEstimate<.05);
 assert.deepEqual(v.finalScore,{CLE:83,GSW:89});assert.ok(v.scoreMatch);
 let total={CLE:0,GSW:0},oreb=0;
 for(const [i,p] of DATA.possessions.entries()){
  assert.ok(p.end.clock<=p.start.clock);
  assert.equal(p.points[other(p.team)],0);
  for(const t of ['CLE','GSW'])total[t]+=p.points[t];
  oreb+=p.offensiveRebounds;
  if(i&&p.start.quarter===DATA.possessions[i-1].start.quarter)assert.notEqual(p.team,DATA.possessions[i-1].team);
 }
 assert.equal(oreb,32);assert.deepEqual(total,{CLE:83,GSW:89});
 assert.equal(Object.values(DATA.seasonStats).filter(x=>Object.keys(x).length).length,26);
 assert.equal(DATA.seasonStats['201939'].pts_per_g,30.1);
});
test('historical windows auto-advance to dead balls or final-five possessions without losing resources',()=>{
 let s=initialState(),clicks=0,auto=0,inside=0;
 while(s.phase!=='final'){
  const before=s;s=play(s,'replay');clicks++;
  assert.equal(s.mode,'replay');
  for(const t of ['CLE','GSW'])assert.ok(s.score[t]>=before.score[t]);
  if(s.turn>before.turn+1)auto++;
  if(s.turn===before.turn)inside++;
  if(s.phase!=='final')assert.ok(DATA.windows[s.cursor].decision);
  assert.ok(clicks<300);
 }
 assert.equal(s.turn,193);assert.deepEqual(s.score,{CLE:83,GSW:89});assert.equal(s.clock,0);
 assert.ok(auto>0);assert.ok(inside>0);assert.ok(clicks<193);
 for(const w of DATA.windows)if(w.state.quarter>=4&&w.state.clock<=300)assert.ok(w.decision);
 console.log('HISTORICAL:',clicks,'manager windows; 193 possessions; CLE 83–GSW 89; auto runs',auto,'intra-possession stops',inside);
});
test('100 seeded full games: alternation, legal points/clocks/fouls/lineups and termination including OT',()=>{
 let overtime=0,maxTurns=0,rebounds=0;
 for(let seed=1;seed<=100;seed++){
  let s=initialState(seed);s.mode='simulation';let steps=0;
  while(s.phase!=='final'){
   const before=s,action=Object.keys(PLAY_TYPES)[steps%7];
   s=simulatePossession(s,{action,clock:policy(s).clock});
   steps++;assert.ok(steps<1500);
   if(s.last.kind==='foul'){assert.equal(s.turn,before.turn);assert.equal(s.possession,before.possession);}
   else{assert.equal(s.turn,before.turn+1);assert.equal(s.possession,other(before.possession));}
   for(const t of ['CLE','GSW']){
    assert.ok(Number.isInteger(s.score[t])&&s.score[t]>=before.score[t]&&s.score[t]-before.score[t]<=4);
    assert.ok(Number.isInteger(s.teamFouls[t])&&s.teamFouls[t]>=0);
    assert.equal(bonus(s,t),s.teamFouls[other(t)]>=(s.quarter>4?3:4)||(s.clock<=120&&s.lateFouls[other(t)]>=1));
    assert.equal(new Set(s.lineups[t]).size,5);assert.ok(s.lineups[t].every(id=>s.personalFouls[id]<6));
   }
   assert.ok(Object.values(s.personalFouls).every(n=>Number.isInteger(n)&&n>=0&&n<=6));
   assert.ok(s.clock>=0&&s.clock<=(s.quarter>4?300:720));
   assert.ok(s.shotClock>=0&&s.shotClock<=24);
   if(s.quarter===before.quarter)assert.ok(s.clock<=before.clock);else assert.equal(s.quarter,before.quarter+1);
   if(s.last.offensiveRebounds){rebounds++;assert.equal(s.turn,before.turn+1);}
  }
  if(s.quarter>4)overtime++;maxTurns=Math.max(maxTurns,s.turn);
  assert.equal(s.clock,0);assert.notEqual(s.score.CLE,s.score.GSW);
 }
 assert.ok(rebounds>0);assert.ok(overtime>0);
 console.log('SEEDED SWEEP: 100 final games; OT games',overtime,'max possessions',maxTurns,'offensive-rebound turns',rebounds);
});
test('tied regulation enters OT and intentional non-bonus fouls retain the same possession',()=>{
 let s=initialState(8);s.mode='simulation';s.quarter=4;s.clock=1;s.score={CLE:80,GSW:80};
 const tied=Array.from({length:100},(_,seed)=>simulatePossession({...copy(s),seed},{action:'spotup'})).find(n=>n.quarter===5);
 assert.ok(tied);assert.equal(tied.clock,300);assert.deepEqual(tied.teamFouls,{CLE:0,GSW:0});
 s.clock=30;s.score={CLE:86,GSW:80};s.plans.GSW.defense='intentional';
 const first=simulatePossession(s,'pnr');assert.equal(first.possession,'CLE');assert.equal(first.turn,s.turn);assert.equal(first.last.kind,'foul');assert.equal(first.teamFouls.GSW,1);
 const second=simulatePossession(first,'pnr');assert.equal(second.possession,'GSW');assert.equal(second.turn,s.turn+1);
});
test('estimated win probability uses margin, possession, time and bonus; +6 / 77s / ball is 90–95%',()=>{
 const s=initialState();s.quarter=4;s.clock=77;s.score={CLE:86,GSW:80};
 const p=winProbability(s,'CLE');assert.ok(p>=.90&&p<=.95,p);
 assert.ok(winProbability({...s,possession:'GSW'},'CLE')<p);
 assert.ok(winProbability({...s,teamFouls:{CLE:0,GSW:4}},'CLE')>p);
 assert.ok(winProbability({...s,clock:150},'CLE')<p);
 assert.equal(winProbability(s,'CLE')+winProbability(s,'GSW'),1);
 console.log('WIN PROBABILITY SANITY:',(p*100).toFixed(2)+'% (估計)');
});
test('all play-type priors are normalized estimates; lineup adjustment and both argument sides carry evidence',()=>{
 const s=initialState();
 for(const action of Object.keys(PLAY_TYPES)){
  const d=distribution(s,action);assert.equal(d.source,'估計');assert.equal(d.points.length,5);
  assert.ok(Math.abs(d.points.reduce((a,b)=>a+b,0)-1)<1e-9);assert.ok(d.points.every(x=>x>=0&&x<=1));
  assert.ok(d.turnover>0&&d.foul>0&&d.seconds>0);
 }
 assert.equal(lineupAdjustment(s).source,'估計');
 const a=analyze(s,{action:'roll'});assert.ok(a.points.every(p=>p.facts.length>0));assert.ok(a.facts.some(f=>f.source==='實際'));assert.ok(a.facts.some(f=>f.source==='估計'));
 assert.equal(analyze({...s,mode:'simulation'}).facts.find(f=>f.label==='目前比分').source,'估計');
 const s2=copy(s);s2.lineups.CLE=['2590','2592','2760','203521','202389'];assert.notEqual(lineupAdjustment(s2).efficiency,lineupAdjustment(s).efficiency);
});
test('paired possession Monte Carlo versus estimated actual choice has meaningful ranked risk remedies',()=>{
 const s=momentState('key3'),m=monteCarlo(s,{action:freeThrowsRemaining(s)?'freeThrows':'spotup'},96);
 assert.equal(m.source,'估計');assert.equal(m.selected.count,96);
 assert.ok(m.riskBranches.length>0);
 for(const risk of m.riskBranches){
  assert.ok(new Set(risk.remedies.map(r=>r.expectedMargin)).size>1);
  assert.ok(risk.remedies.every(r=>r.state.mode==='simulation'));
  for(let i=1;i<risk.remedies.length;i++)assert.ok(risk.remedies[i-1].expectedMargin>=risk.remedies[i].expectedMargin);
 }
 assert.deepEqual(m,monteCarlo(s,{action:freeThrowsRemaining(s)?'freeThrows':'spotup'},96));
 assert.throws(()=>monteCarlo(s,{},0));assert.throws(()=>simulatePossession(s,'invented'));
 assert.throws(()=>replayState(-1));assert.throws(()=>manage(s,{type:'invented',team:'CLE'}));
 console.log('ENDGAME MONTE CARLO:',JSON.stringify({selected:m.selected.winProbability,baseline:m.baseline.winProbability,risks:m.riskBranches.map(r=>({kind:r.kind,remedies:r.remedies.map(x=>({label:x.label,margin:x.expectedMargin,win:x.winProbability}))}))}));
});

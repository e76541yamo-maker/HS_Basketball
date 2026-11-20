import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {initialState,copy,distribution,winProbability,options,play,manage,simulatePossession,policy,other,freeThrowsRemaining,DATA,replayState} from '../src/engine.js';
import {MODEL_DATA,VALUE_MODELS,WP_MODELS,valueModel,wpModel,factorsFromCounts,teamFactors,lineupFactors,lineupImpact,normalCDF} from '../src/evaluation-models.js';
import {compareModels,evaluateOption} from '../src/model-comparison.js';
import {comparisonTable} from '../src/comparison-table.js';
import {analyze,monteCarlo} from '../src/manager-options.js';
import {MOMENTS,momentState} from '../src/scenarios.js';
import {restore,addBranch,validState} from '../src/branch-tree.js';

test('source inputs include all season BPM values and independently derived game/season Four Factors',()=>{
 assert.equal(MODEL_DATA.players['2544'].bpm,8.9);assert.equal(MODEL_DATA.players['201939'].bpm,11.9);
 assert.equal(Object.values(MODEL_DATA.players).filter(p=>p.bpmSource==='實際').length,26);
 assert.ok(Object.values(MODEL_DATA.players).every(p=>p.season));
 const counts={fg:5,fg3:2,fga:10,fta:4,ft:3,orb:2,drb:4,tov:1};
 const f=factorsFromCounts(counts,{drb:6});assert.equal(f.efg,.6);assert.equal(f.orb,.25);assert.equal(f.ftRate,.3);assert.equal(f.tov,1/(10+.44*4+1));
 assert.ok(Object.values(factorsFromCounts(Object.fromEntries(Object.keys(counts).map(k=>[k,0])),{drb:0})).every(Number.isFinite));
 for(const t of ['CLE','GSW'])for(const period of ['game','season']){
  const f=teamFactors(t,period),c=MODEL_DATA.teams[t][period];
  assert.equal(f.source,'實際');assert.equal(f.pppSource,'估計');assert.equal(f.efg,(c.fg+.5*c.fg3)/c.fga);assert.ok(f.ppp>0);
 }
 assert.notEqual(teamFactors('CLE','game').efg,teamFactors('CLE','season').efg);
 assert.equal(lineupFactors(initialState()).source,'估計');
 assert.throws(()=>teamFactors('bad'));assert.throws(()=>teamFactors('CLE','bad'));
});
test('every valuation/WP combination is finite and normalized at every real decision moment',()=>{
 for(const m of MOMENTS)for(const value of Object.keys(VALUE_MODELS))for(const wp of Object.keys(WP_MODELS)){
  const s={...momentState(m.id),valueModel:value,wpModel:wp},before=copy(s);
  for(const option of options(s)){
   const action=option.id==='replay'?DATA.possessions[s.possessionIndex].playType:option.id;
   const d=distribution(s,freeThrowsRemaining(s)?'freeThrows':action);
   assert.ok(d.points.every(p=>Number.isFinite(p)&&p>=0&&p<=1));assert.ok(Math.abs(d.points.reduce((a,b)=>a+b,0)-1)<1e-10);
   const v=evaluateOption(s,{action:option.id});assert.ok(Number.isFinite(v.expectedPoints));assert.ok(Number.isFinite(v.leverage));assert.ok(v.winProbabilityAfter>=0&&v.winProbabilityAfter<=1);
  }
  assert.ok(winProbability(s,'CLE')>=0&&winProbability(s,'CLE')<=1);assert.equal(winProbability(s,'CLE')+winProbability(s,'GSW'),1);assert.deepEqual(s,before);
 }
 const s=initialState(),legacy=copy(s);delete legacy.valueModel;delete legacy.wpModel;
 assert.equal(valueModel(legacy),'current');assert.equal(wpModel(legacy),'logistic');assert.deepEqual(distribution(s),distribution(legacy));assert.equal(winProbability(s),winProbability(legacy));
 assert.throws(()=>valueModel({...s,valueModel:'toString'}));assert.throws(()=>wpModel({...s,wpModel:'bad'}));
});
test('models differ while valuation and WP choices are independent; sourced BPM makes substitutions matter',()=>{
 const s=momentState('key3');assert.equal(new Set(Object.keys(VALUE_MODELS).map(valueModel=>evaluateOption({...s,valueModel},{action:'spotup'}).expectedPoints)).size,3);
 assert.notEqual(winProbability(s),winProbability({...s,wpModel:'brownian'}));
 assert.deepEqual(distribution({...s,valueModel:'impact',wpModel:'brownian'},'pnr'),distribution({...s,valueModel:'impact',wpModel:'logistic'},'pnr'));
 const strong={...initialState(),valueModel:'impact'},weak=manage(strong,{type:'substitution',team:'CLE',out:'2544',in:'2592'});
 assert.ok(lineupImpact(weak).net<lineupImpact(strong).net);
 assert.ok(evaluateOption(weak,{action:'pnr'}).expectedPoints<evaluateOption(strong,{action:'pnr'}).expectedPoints);
 assert.deepEqual(weak.score,strong.score);assert.equal(weak.turn,strong.turn);
 assert.ok(analyze(weak,{action:'pnr'}).facts.some(f=>f.source==='實際'&&f.label.includes('BPM')));
 for(const valueModel of Object.keys(VALUE_MODELS))assert.ok(Number.isFinite(evaluateOption({...weak,valueModel},{action:'pnr'}).expectedPoints));
});
test('Brownian normal tail handles symmetry, terminal scores, extremes and overtime',()=>{
 assert.equal(normalCDF(0),.5);assert.ok(normalCDF(-100)<1e-9);assert.ok(normalCDF(100)>1-1e-9);
 const s={...initialState(),wpModel:'brownian',quarter:4,clock:77,score:{CLE:86,GSW:80}};
 assert.ok(winProbability({...s,clock:150},'CLE')<winProbability(s,'CLE'));
 assert.ok(winProbability({...s,possession:'GSW'},'CLE')<winProbability(s,'CLE'));
 assert.equal(winProbability({...s,phase:'final'},'CLE'),1);assert.equal(winProbability({...s,phase:'final'},'GSW'),0);
 assert.equal(winProbability({...s,phase:'final',score:{CLE:80,GSW:80}},'CLE'),.5);
 assert.ok(Number.isFinite(winProbability({...s,quarter:5,clock:300})));
});
test('selected models flow through arguments, full-game Monte Carlo and representative risk/remedy states',()=>{
 const s={...momentState('key3'),valueModel:'impact',wpModel:'brownian'},decision={action:'spotup'},m=monteCarlo(s,decision,24);
 assert.equal(m.valueModel,'impact');assert.equal(m.wpModel,'brownian');assert.ok(Number.isFinite(m.selected.modelWinProbability));
 assert.ok(m.riskBranches.length);
 for(const risk of m.riskBranches)for(const remedy of risk.remedies){assert.equal(remedy.state.valueModel,'impact');assert.equal(remedy.state.wpModel,'brownian');assert.ok(remedy.modelWinProbability>=0&&remedy.modelWinProbability<=1);}
 const logistic=monteCarlo({...s,wpModel:'logistic'},decision,24);
 assert.notEqual(m.selected.modelWinProbability,logistic.selected.modelWinProbability);
 assert.equal(m.selected.winProbability,logistic.selected.winProbability);assert.equal(m.selected.expectedMargin,logistic.selected.expectedMargin);
 const a=analyze(s,decision);assert.ok(a.facts.some(f=>f.value==='球員影響／布朗運動'));assert.ok(a.facts.some(f=>f.label==='先驗後勝率'));assert.equal(a.comparisonFacts.length,8);
 for(const row of a.comparisonFacts){const selected=row.models.filter(m=>m.selected);assert.equal(selected.length,1);assert.equal(selected[0].model,'球員影響・布朗運動');}
 const ff=analyze({...s,valueModel:'fourFactors'},decision);assert.ok(ff.facts.some(f=>f.label.includes('場上陣容代理')&&f.source==='估計'));assert.ok(ff.facts.some(f=>f.label.includes('年度球隊')&&f.source==='實際'));
});
test('all model combinations keep legal scores, control and clocks through an endgame',()=>{
 for(const valueModel of Object.keys(VALUE_MODELS))for(const wpModel of Object.keys(WP_MODELS))for(let seed=0;seed<4;seed++){
  let s={...momentState('key3'),valueModel,wpModel,seed},turns=0;
  while(s.phase!=='final'&&turns++<200){
   const n=simulatePossession(s,policy(s));assert.equal(n.valueModel,valueModel);assert.equal(n.wpModel,wpModel);
   for(const t of ['CLE','GSW'])assert.ok(n.score[t]>=s.score[t]);
   assert.ok(n.score[s.possession]-s.score[s.possession]<=4);assert.equal(n.score[other(s.possession)],s.score[other(s.possession)]);
   assert.ok(n.quarter>s.quarter||n.clock<=s.clock);if(n.turn>s.turn&&n.quarter===s.quarter)assert.equal(n.possession,other(s.possession));s=n;
  }
  assert.equal(s.phase,'final');assert.ok(validState(s));
 }
});
test('selectors survive historical advance, branch management, undo snapshots and legacy saves',()=>{
 const s={...initialState(),valueModel:'fourFactors',wpModel:'brownian'},n=play(s,'replay');
 assert.equal(n.valueModel,'fourFactors');assert.equal(n.wpModel,'brownian');
 const managed=manage(s,{type:'timeout',team:'CLE'}),saved={state:managed,previous:s,branches:addBranch([],n)};
 assert.deepEqual(restore(JSON.stringify(saved)),saved);
 const legacy=copy(s);delete legacy.valueModel;delete legacy.wpModel;assert.ok(validState(legacy));
 for(const bad of [{valueModel:'bad'},{wpModel:'bad'},{valueModel:'constructor'},{wpModel:null}])assert.equal(validState({...s,...bad}),false);
 const ft=replayState(DATA.windows.findIndex((_,i)=>freeThrowsRemaining(replayState(i))>0));
 assert.deepEqual(distribution({...ft,valueModel:'impact'},'freeThrows'),distribution({...ft,valueModel:'fourFactors'},'freeThrows'));
});
test('comparison renders every option under all six combinations, ranks, winners, assumptions and empty state',()=>{
 const s={...momentState('key3'),valueModel:'impact',wpModel:'brownian'},c=compareModels(s),html=comparisonTable(s);
 assert.equal(c.columns.length,6);assert.equal(c.rows.length,options(s).length);assert.equal(c.disagreement,new Set(c.columns.map(c=>c.best.join(','))).size>1);
 for(let col=0;col<6;col++){
  const values=c.rows.map(r=>r.values[col]);assert.ok(values.some(v=>v.rank===1));
  for(const v of values)assert.equal(v.rank,1+values.filter(x=>x.winProbabilityAfter-v.winProbabilityAfter>1e-12).length);
 }
 assert.equal((html.match(/data-rank=/g)||[]).length,c.rows.length*6);assert.equal((html.match(/selected-model/g)||[]).length,c.rows.length+1);
 for(const label of ['四要素','球員影響','現行勝率','布朗運動','槓桿','模型假設與來源界線','best-option','排名'])assert.ok(html.includes(label));
 assert.ok(html.includes(c.disagreement?'最佳選擇有分歧':'各模型最佳選擇一致'));
 const divergent=replayState(64),different=compareModels(divergent);assert.ok(DATA.windows[64].decision);assert.ok(different.disagreement);
 assert.deepEqual(different.columns[0].best,['spotup']);assert.deepEqual(different.columns[2].best,['transition']);
 assert.match(comparisonTable(divergent),/class="model-consensus divergent">最佳選擇有分歧/);
 assert.equal(compareModels({...s,phase:'final'}).rows.length,0);assert.match(comparisonTable({...s,phase:'final'}),/終場沒有可比較/);
 const shell=readFileSync(new URL('../index.html',import.meta.url),'utf8');assert.ok(shell.includes('id="model-selectors"'));assert.ok(shell.includes('id="model-comparison"'));
});

test('expanded cross-model table converts and reranks estimates for the managed team on defense',()=>{
 const s=momentState('key3');
 assert.equal(s.possession,'CLE');
 const offense=compareModels(s),defense=compareModels(s,{},'GSW');
 offense.rows.forEach((row,i)=>row.values.forEach((v,j)=>{
  const actual=defense.rows[i].values[j];
  assert.equal(actual.winProbabilityAfter,1-v.winProbabilityAfter);
  assert.equal(actual.rank,1+offense.rows.filter(r=>v.winProbabilityAfter-r.values[j].winProbabilityAfter>1e-12).length);
 }));
 const html=comparisonTable({...s,coach:{team:'GSW'}});
 assert.match(html,/本隊（GSW）回合後勝率/);
 assert.doesNotMatch(html,/持球隊回合後勝率/);
 const {expectedPoints,winProbabilityAfter,rank}=defense.rows[0].values[0];
 assert.ok(html.includes('data-rank="'+rank+'"><b>'+expectedPoints.toFixed(2)+' 分 / '+Math.round(100*winProbabilityAfter)+'%</b>'));
});

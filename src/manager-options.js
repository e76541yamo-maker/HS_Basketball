import {DATA,PLAY_TYPES,DEFENSES,copy,other,realChoice,realLabel,simulatePossession,policy,distribution,winProbability,leverage,freeThrowsRemaining} from './engine.js';
import {VALUE_MODELS,WP_MODELS,MODEL_DATA,valueModel,wpModel,lineupFactors,lineupImpact,teamFactors} from './evaluation-models.js';
import {evaluateOption,compareModels} from './model-comparison.js';
const fact=(source,label,value)=>({source,label,value});
export function analyze(s,decision={}) {
 const action=decision.action==='replay'?realChoice(s):decision.action||'pnr',d=distribution(s,action,decision);
 const value=evaluateOption(s,decision),expected=value.expectedPoints,valuation=valueModel(s),wp=wpModel(s);
 const team=s.coach?.team||s.possession,managedWP=team===s.possession?value.winProbabilityAfter:1-value.winProbabilityAfter;
 const actual=[fact('實際','逐球完整回合',DATA.validation.possessionCount),fact(s.mode==='replay'?'實際':'估計','目前比分',s.score.CLE+'：'+s.score.GSW)];
 const model=[fact('估計','估值／勝率模型',VALUE_MODELS[valuation].label+'／'+WP_MODELS[wp].label),fact('估計','每回合先驗得分',expected.toFixed(2)),fact('估計','本隊（'+team+'）先驗後勝率',(100*managedWP).toFixed(2)+'%'),fact('估計','選項槓桿',value.leverage.toFixed(3)),fact('估計','使用秒數',d.seconds.toFixed(1)),fact('估計','陣容效率倍率',d.adjustment.toFixed(3))];
 if(valuation==='fourFactors') {
  for(const [scope,f] of [['本場球隊',teamFactors(s.possession,'game')],['年度球隊',teamFactors(s.possession)],['場上陣容代理',lineupFactors(s)]]) {
   for(const [key,label] of Object.entries({efg:'有效命中率',tov:'失誤率',orb:'進攻籃板率',ftRate:'罰球命中／出手'}))model.push(fact(f.source,scope+'・'+label,(100*f[key]).toFixed(2)+'%'));
  }
 }
 if(valuation==='impact') {
  const impact=lineupImpact(s);model.push(fact('估計','場上 BPM 加總差',impact.net.toFixed(2)));
  for(const id of [...s.lineups.CLE,...s.lineups.GSW]) {const p=MODEL_DATA.players[id];model.push(fact(p?.bpmSource||'估計',DATA.players[id].name+'・來源刊載 BPM',(p?.bpm??0).toFixed(1)));}
 }
 const cost=[fact('估計','失誤率',d.turnover.toFixed(3)),fact('估計','犯規率',d.foul.toFixed(3)),fact('估計','零分先驗',d.points[0].toFixed(3))];
 const baseline=evaluateOption(s,s.mode==='replay'?{action:'replay'}:policy(s)),base=baseline.expectedPoints.toFixed(2);
 const turnover=Math.round(100*d.turnover)+'%';
 const pro=['估計｜先驗得分 '+expected.toFixed(2)+' 分／基準 '+base+' 分：'+(expected>baseline.expectedPoints?'這個打法的得分先驗較高':'這個打法沒有明顯得分優勢')+'；若換防後次序反轉，這個判斷就不成立。'];
 const con=['估計｜失誤率 '+turnover+'：'+(d.turnover?'失誤會提早結束這波進攻':'此罰球窗口沒有進攻失誤')+'；若'+(d.turnover?'換打法後失誤更少，原方案的代價就偏高':'回到活球，這項估計就不適用')+'。'];
 const attack=['估計｜先驗得分 '+expected.toFixed(2)+' 分：對手可換防降低得分；若改防守後得分不降，這種對策就不值得。'];
 const contingency=[actual[1].source+'｜目前比分 '+actual[1].value+'：先看分差再管理時鐘；若下一波反轉領先，原時鐘策略就要重選。'];
 const comparison=compareModels(s,decision,team);
 const comparisonFacts=comparison.rows.map(row=>({option:row.label,managedTeam:team,models:row.values.map((v,i)=>({model:comparison.columns[i].label,selected:v.valueModel===valuation&&v.wpModel===wp,expectedPoints:v.expectedPoints.toFixed(2),managedTeamWinProbabilityAfter:(100*v.winProbabilityAfter).toFixed(2)+'%',leverage:v.leverage.toFixed(2),rank:v.rank}))}));
 return {summary:(PLAY_TYPES[action]?.label||'剩餘罰球')+'・'+s.possession+' 完整回合策略（估計）',comparisonFacts,
  facts:[...actual,...model,...cost],pro,con,attack,contingency,
  points:[{sign:'＋',text:'支持這個選擇',detail:pro[0],facts:[...actual,...model]},
  {sign:'−',text:'代價與限制',detail:con[0],facts:cost}]};
}
function evaluate(s,decision,count,seed,team,remedyDefense) {
 let wins=0,margin=0,points=0,modelWins=0;const outcomes={score:0,empty:0,turnover:0},liveOutcomes={score:0,empty:0,turnover:0},risks={},winSamples=[];
 for(let i=0;i<count;i++) {
  const start=copy(s);start.seed=(seed+Math.imul(i+1,2654435761))>>>0;
  const nextDecision=state=>({...policy(state),...(remedyDefense&&other(state.possession)===team?{defense:remedyDefense}:{})});
  let next=simulatePossession(start,remedyDefense?nextDecision(start):decision);
  let continuations=0;
  while(next.phase!=='final'&&next.turn===start.turn&&continuations++<2000)next=simulatePossession(next,nextDecision(next));
  if(continuations>=2000)throw new Error('推演未能結束');
  modelWins+=winProbability(next,team);
  const possessionPoints=next.score[s.possession]-s.score[s.possession];
  const liveKind=next.last.kind==='foul'?'empty':next.last.kind;
  liveOutcomes[liveKind]++;points+=possessionPoints;
  if(possessionPoints>0)outcomes.score++;
  const riskKind=s.possession!==team?(possessionPoints>0?'allowedScore':null):liveKind==='turnover'?'turnover':possessionPoints===0?'empty':null;
  if(riskKind){outcomes[riskKind]=(outcomes[riskKind]||0)+1;if(!risks[riskKind])risks[riskKind]=copy(next);}
  let turns=0;
  while(next.phase!=='final'&&turns++<2000)next=simulatePossession(next,nextDecision(next));
  if(next.phase!=='final')throw new Error('推演未能結束');
  const won=Number(next.score[team]>next.score[other(team)]);wins+=won;winSamples.push(won);
  margin+=next.score[team]-next.score[other(team)];
 }
 return {winProbability:wins/count,winSamples,modelWinProbability:modelWins/count,expectedMargin:margin/count,expectedPoints:points/count,outcomes,liveOutcomes,count,risks};
}
export function monteCarlo(s,decision={},count=s.quarter>=4&&s.clock<=300?512:64,seed=20151225,team=s.possession,recommendation) {
 if(!Number.isInteger(count)||count<1||count>4096||s.phase!=='playing'||!['CLE','GSW'].includes(team))throw new Error('無可比較的回合');
 const selectedAction=decision.action==='replay'?realChoice(s):decision.action||'pnr';
 const chosen={...decision,action:freeThrowsRemaining(s)?'freeThrows':selectedAction};
 const historical=!s.diverged&&s.turn===s.possessionIndex&&DATA.possessions[s.possessionIndex]?.team===s.possession;
 const baselineDecision=historical?{action:realChoice(s)}:policy(s);
 const baselineLabel=historical?DATA.possessions[s.possessionIndex].description:'估計・目前陣容與球隊策略基準';
 const selected=evaluate(s,chosen,count,seed,team),baseline=evaluate(s,baselineDecision,count,seed,team);
 const recommended=recommendation?evaluate(s,recommendation,count,seed,team):null;
 if(recommended)delete recommended.risks;
 const riskBranches=Object.entries(selected.risks).filter(([,state])=>state.phase==='playing').map(([kind,state])=>{
  const remedies=['switch','drop','blitz','zone'].map((id,j)=>{
   const start=copy(state);start.plans[team].defense=id;
   if(start.playMode==='segment'&&start.coach?.team===team)start.coach.defense=id;
   const r=evaluate(start,policy(start),Math.min(256,Math.max(64,count)),seed+700,team,id);
   delete r.risks;
   return {...r,id,label:DEFENSES[id],state:start};
  }).sort((a,b)=>b.expectedMargin-a.expectedMargin||b.winProbability-a.winProbability);
  return {kind,count:selected.outcomes[kind],remedies};
 });
 delete selected.risks;delete baseline.risks;
 return {source:'估計',team,defending:team!==s.possession,valueModel:valueModel(s),wpModel:wpModel(s),selected,baseline,recommended,count,seed,delta:selected.winProbability-baseline.winProbability,modelDelta:selected.modelWinProbability-baseline.modelWinProbability,
  stateWinProbability:winProbability(s,team),leverage:leverage(s),riskBranches,remedies:riskBranches[0]?.remedies||[],baselineLabel};
}

import {DATA,copy,play,simulateHold,policy,player,options,profile,currentHold,realChoice,realLabel,other,winProbability,leverage,ZONES,defenderDistance} from './engine.js';
const fact=(label,value,source='實際')=>({label,value:String(value),source});
export const execute=(s,d)=>play(s,typeof d==='string'?d:d.action);
export function analyze(s,decision={}) {
  const id=decision.action==='replay'?realChoice(s):decision.action||realChoice(s),p=player(s.handler),stats=profile(s),d=stats.observed,pass=id.startsWith('pass:'),target=pass?player(id.slice(5)):null;
  const pro=pass?'轉移持球，讓隊友開始下一段選擇':id==='drive'?'移動到籃下，再以近框分布出手':id==='reset'?'保留持球，等待下一個決策窗口':'依區域與防守距離分布尋找得分';
  const con=pass?'傳球仍耗時間，也可能發生失誤':'單場樣本有限，命中率已向球隊平均收縮';
  const contingency=pass?'若傳球失誤，改看防守端補救分支。':'若出手未中，可比較傳球或重整的風險分支。';
  const facts=[fact('本場持球段',d.holds),fact('本場出手／命中',`${d.fga} / ${d.fg}`),fact('本區距離格出手／命中',`${stats.cell.n} / ${stats.cell.made}`),fact('平均持球秒數',d.durations.length?stats.meanHold.toFixed(2):'無樣本'),fact('收縮後命中率',stats.fg.toFixed(3),'估計'),fact('防守距離英尺',defenderDistance(s).toFixed(2),s.positionsActual?'實際':'估計'),fact('槓桿指數',leverage(s).toFixed(2),'估計')];
  if(target) facts.push(fact('對此隊友觀測傳球',d.targets[target.id]||0));
  return {summary:`${p.name}・${ZONES[s.zone]}・真實選擇：${realLabel(s)}`,pro:[pro],con:[con],attack:['對手靠近可改變距離格，小樣本不能證明因果'],contingency:[contingency],facts,points:[{sign:'+',text:pro,detail:'使用本場追蹤推定持球與傳球計數；沒有觀測的隊友也保留平滑權重，避免機率被硬設為零。',facts},{sign:'−',text:con,detail:'命中率以球隊本場平均作為十次出手先驗；原始出手數與平滑後機率分開標示。追蹤缺口不當成失誤。',facts:[fact('本區距離格出手／命中',`${stats.cell.n} / ${stats.cell.made}`),fact('收縮先驗出手',10,'估計'),fact('收縮後命中率',stats.fg.toFixed(3),'估計'),fact('本場失誤',d.turnovers)]}]};
}
function rollout(state,action,seed,perspective=state.possession) {
  let s=copy(state);s.seed=seed;
  const team=perspective,before=s.score[team];
  s=simulateHold(s,action);const points=s.score[team]-before,kind=s.last.kind,riskState=copy(s);
  let turns=0;
  while(s.phase==='playing'&&turns++<16000) s=simulateHold(s,policy(s));
  if(s.phase!=='final') throw new Error('模擬未到終場');
  return {win:s.score[team]>s.score[other(team)]?1:0,margin:s.score[team]-s.score[other(team)],points,kind,riskState};
}
function evaluate(s,action,count,seed,perspective=s.possession) {
  const outcomes={score:0,empty:0,turnover:0},risks={};let wins=0,points=0,margin=0;
  for(let i=0;i<count;i++) { const r=rollout(s,action,(seed+i*7919)>>>0,perspective);wins+=r.win;points+=r.points;margin+=r.margin;const type=r.kind.includes('失誤')||r.kind.includes('違例')?'turnover':r.points?'score':'empty';outcomes[type]++;if(type!=='score'&&!risks[type]&&r.riskState.phase==='playing')risks[type]=r.riskState; }
  return {action,winProbability:wins/count,expectedMargin:margin/count,expectedPoints:points/count,outcomes,count,risks};
}
export function monteCarlo(s,decision={action:'shoot'},count=s.quarter>=4&&s.clock<=120?2048:48,seed=20151225) {
  if(!Number.isInteger(count)||count<1||count>4096||s.phase!=='playing'||s.recordKind==='event'&&s.mode==='replay') throw new Error('無可比較的持球樣本');
  const baselineAction=realChoice(s),action=decision.action==='replay'?baselineAction:decision.action;
  if(!options(s).some(o=>o.id===action)) throw new Error('無效比較選項');
  const baseline=evaluate(s,baselineAction,count,seed),selected=action===baselineAction?copy(baseline):evaluate(s,action,count,seed);
  const remedies=options(s).filter(o=>o.id!=='replay'&&o.id!==action).map(o=>({...evaluate(s,o.id,Math.min(64,count),seed),label:o.label})).sort((a,b)=>b.expectedMargin-a.expectedMargin||b.winProbability-a.winProbability);
  const riskBranches=Object.entries(selected.risks).map(([kind,state])=>{
    const plans=[['pressure','加壓干擾'],['rebound','保護籃板'],['perimeter','優先守外線']];
    const ranked=plans.map(([id,label])=>{
      const n=copy(state);n.defensePlan={id,team:s.possession};
      return {id,label,state:n,...evaluate(n,policy(n),Math.min(256,count),seed,s.possession)};
    }).sort((a,b)=>b.expectedMargin-a.expectedMargin||b.winProbability-a.winProbability);
    return {kind,state,count:selected.outcomes[kind],remedies:ranked};
  });
  return {selected,baseline,count,seed,source:'估計',delta:selected.winProbability-baseline.winProbability,leverage:leverage(s),remedies:remedies.slice(0,3),riskBranches,baselineLabel:realLabel(s)};
}

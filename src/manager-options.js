import {DATA,PLAY_TYPES,DEFENSES,copy,other,realChoice,realLabel,simulatePossession,policy,distribution,winProbability,leverage,freeThrowsRemaining} from './engine.js';
const fact=(source,label,value)=>({source,label,value});
export function analyze(s,decision={}) {
 const action=decision.action==='replay'?realChoice(s):decision.action||'pnr',d=distribution(s,action,decision);
 const expected=d.points.reduce((n,p,i)=>n+p*i,0)*(1-d.turnover);
 const actual=[fact('實際','逐球完整回合',DATA.validation.possessionCount),fact(s.mode==='replay'?'實際':'估計','目前比分',s.score.CLE+'：'+s.score.GSW)];
 const model=[fact('估計','每回合先驗得分',expected.toFixed(2)),fact('估計','使用秒數',d.seconds.toFixed(1)),fact('估計','陣容效率倍率',d.adjustment.toFixed(3))];
 const cost=[fact('估計','失誤率',d.turnover.toFixed(3)),fact('估計','犯規率',d.foul.toFixed(3)),fact('估計','零分先驗',d.points[0].toFixed(3))];
 const pro=['以完整球隊進攻分布比較選擇，不把傳球當作新回合。','陣容效率由本場與年度資料收縮估計。'];
 const con=['打法先驗未取得該年度球隊官方明細，不是實際戰術成功率。','小樣本與防守係數可能改變排序，不能推論因果。'];
 const attack=['對手可換防、沉退或夾擊；以防守層調整下一波風險。'];
 const contingency=['未得分先檢查籃板與換防；失誤後比較期望終場分差，而非只看勝率。'];
 return {summary:(PLAY_TYPES[action]?.label||'剩餘罰球')+'・'+s.possession+' 完整回合策略（估計）',
  facts:[...actual,...model,...cost],pro,con,attack,contingency,
  points:[{sign:'＋',text:'支持這個選擇',detail:pro.join(''),facts:[...actual,...model]},
  {sign:'−',text:'代價與限制',detail:con.join(''),facts:cost}]};
}
function evaluate(s,decision,count,seed,team) {
 let wins=0,margin=0,points=0;const outcomes={score:0,empty:0,turnover:0},risks={};
 for(let i=0;i<count;i++) {
  const start=copy(s);start.seed=(seed+Math.imul(i+1,2654435761))>>>0;
  let next=simulatePossession(start,decision);
  const kind=next.last.kind==='foul'?'empty':next.last.kind;
  outcomes[kind]++;points+=next.score[team]-s.score[team];
  if(kind!=='score'&&!risks[kind])risks[kind]=copy(next);
  let turns=0;
  while(next.phase!=='final'&&turns++<2000)next=simulatePossession(next,policy(next));
  if(next.phase!=='final')throw new Error('推演未能結束');
  wins+=Number(next.score[team]>next.score[other(team)]);
  margin+=next.score[team]-next.score[other(team)];
 }
 return {winProbability:wins/count,expectedMargin:margin/count,expectedPoints:points/count,outcomes,count,risks};
}
export function monteCarlo(s,decision={},count=s.quarter>=4&&s.clock<=300?512:64,seed=20151225) {
 if(!Number.isInteger(count)||count<1||count>4096||s.phase!=='playing')throw new Error('無可比較的回合');
 const selectedAction=decision.action==='replay'?realChoice(s):decision.action||'pnr';
 const chosen={...decision,action:freeThrowsRemaining(s)?'freeThrows':selectedAction},team=s.possession;
 const selected=evaluate(s,chosen,count,seed,team),baseline=evaluate(s,{action:realChoice(s)},count,seed,team);
 const riskBranches=Object.entries(selected.risks).filter(([,state])=>state.phase==='playing').map(([kind,state])=>{
  const remedies=['switch','drop','blitz','zone'].map((id,j)=>{
   const start=copy(state);start.plans[team].defense=id;
   const r=evaluate(start,policy(start),Math.min(256,Math.max(64,count)),seed+700,team);
   delete r.risks;
   return {...r,id,label:DEFENSES[id],state:start};
  }).sort((a,b)=>b.expectedMargin-a.expectedMargin||b.winProbability-a.winProbability);
  return {kind,count:selected.outcomes[kind],remedies};
 });
 delete selected.risks;delete baseline.risks;
 return {source:'估計',selected,baseline,count,seed,delta:selected.winProbability-baseline.winProbability,
  stateWinProbability:winProbability(s,team),leverage:leverage(s),riskBranches,remedies:riskBranches[0]?.remedies||[],baselineLabel:realLabel(s)};
}

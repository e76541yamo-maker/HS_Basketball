import {DATA,TEAMS,copy,other,replayState,simulatePossession,policy,rngFrom,freeThrowsRemaining,winProbability,DEFENSES} from './engine.js';
import {MODEL_DATA,VALUE_MODELS,WP_MODELS,valueModel,wpModel} from './evaluation-models.js';

export const TEMPOS={slow:'慢',normal:'正常',push:'推進'};
export const elapsed=s=>(s.quarter-1)*720+(720-s.clock);
export const clutch=s=>s.quarter>=4&&s.clock<=120;
const startCursor=p=>DATA.windows.findIndex(w=>w.possessionIndex===p);
const starts=DATA.windows.map((w,cursor)=>({...w,cursor})).filter(w=>w.state.clock===720&&w.reasons.includes('節次開始'));
const candidates=DATA.windows.map((w,cursor)=>({...w,cursor})).filter(w=>w.reasons.includes('暫停')&&!(w.state.quarter>=4&&w.state.clock<=120));
const cuts=starts.map(w=>({cursor:w.cursor,time:elapsed(w.state),reason:'節次開始'}));
const clutchPossession=DATA.possessions.find(p=>p.start.quarter===4&&p.start.clock<=120);
const clutchCut={cursor:startCursor(clutchPossession.id),time:elapsed(clutchPossession.start),reason:'末段逐回合'};
while(cuts.length<8){
 const ranked=candidates.filter(w=>!cuts.some(c=>c.cursor===w.cursor)).map(w=>{
  const t=elapsed(w.state),q=w.state.quarter;
  const bounds=[...cuts.filter(c=>DATA.windows[c.cursor].state.quarter===q).map(c=>c.time),q===4?clutchCut.time:q*720];
  return {cursor:w.cursor,time:t,reason:'歷史暫停',distance:Math.min(...bounds.map(b=>Math.abs(t-b)))};
 }).filter(w=>w.distance>=120).sort((a,b)=>b.distance-a.distance||a.time-b.time);
 if(!ranked.length)break;
 cuts.push(ranked[0]);
}
cuts.sort((a,b)=>a.time-b.time);
export const SEGMENTS=cuts.map((c,i)=>({...c,id:i,end:cuts[i+1]||clutchCut,label:'第 '+(i+1)+' 段',quarter:DATA.windows[c.cursor].state.quarter,clock:DATA.windows[c.cursor].state.clock}));
export function coachSettings(s,team='CLE') {return {team,tempo:'normal',defense:'switch',target:'',lineup:[...s.lineups[team]],timeout:false};}
export function modeState(s,mode) {
 if(!['segment','possession'].includes(mode))throw new Error('無此操作模式');
 const next={...copy(s),playMode:mode,coach:copy(s.coach||coachSettings(s))};
 if(next.coach.lineup.some(id=>s.personalFouls[id]>=6))next.coach.lineup=[...s.lineups[next.coach.team]];
 return next;
}
export const segmentState=(id=0,team='CLE')=>modeState({...replayState(SEGMENTS[id]?.cursor??0),coach:coachSettings(replayState(SEGMENTS[id]?.cursor??0),team)},'segment');
export const activeSegment=s=>SEGMENTS.find(g=>g.end.time>elapsed(s))||null;
export const managedStop=s=>s.possession===s.coach.team||s.score[s.coach.team]<s.score[other(s.coach.team)];
export function validateCoach(s,c) {
 if(!TEAMS[c?.team]||!TEMPOS[c.tempo]||!['switch','drop','blitz','zone'].includes(c.defense)||typeof c.timeout!=='boolean')throw new Error('無效教練策略');
 if(!Array.isArray(c.lineup)||c.lineup.length!==5||new Set(c.lineup).size!==5||!c.lineup.every(id=>TEAMS[c.team].some(p=>p.id===id)&&s.personalFouls[id]<6))throw new Error('請選五名尚未犯滿的球員');
 if(c.target&&!s.lineups[other(c.team)].includes(c.target))throw new Error('目標必須是場上對手');
}
export function targetBoost(s,c) {
 if(!c.target||!s.lineups[other(c.team)].includes(c.target))return 0;
 const ids=s.lineups[other(c.team)],average=ids.reduce((n,id)=>n+(MODEL_DATA.players[id]?.bpm??0),0)/5;
 return Math.max(-.08,Math.min(.08,(average-(MODEL_DATA.players[c.target]?.bpm??0))*.012));
}
export function playMix(s,c) {
 const transition={slow:.04,normal:.16,push:.45}[c.tempo],mix={transition,pnr:.30,post:.12,isolation:.12,spotup:.20,motion:.10,roll:.16};
 if(c.target&&s.lineups[other(c.team)].includes(c.target)){
  const guard=DATA.players[c.target].position.includes('G');mix[guard?'post':'pnr']+=.4;mix.isolation+=.15;
 }
 const sum=Object.values(mix).reduce((a,b)=>a+b,0);return Object.fromEntries(Object.entries(mix).map(([k,v])=>[k,v/sum]));
}
export function coachDecision(s,c,rng=rngFrom(s.seed)) {
 const d=policy(s);
 if(other(s.possession)===c.team)d.defense=c.defense;
 if(s.possession===c.team&&!freeThrowsRemaining(s)){
  let x=rng();d.action='pnr';for(const [action,p] of Object.entries(playMix(s,c))){x-=p;if(x<=0){d.action=action;break;}}
  d.clock='normal';
  const fatigue=s.lineups[c.team].reduce((n,id)=>n+(s.fatigue?.[id]||0),0)/5;
  d.coach={seconds:{slow:1.35,normal:1,push:.65}[c.tempo],ppp:targetBoost(s,c)-Math.min(.06,fatigue/18000)};
 }
 return d;
}
function advanceSimulation(s,c,decision) {
 const before=s,next=simulatePossession(s,decision||coachDecision(s,c));
 const used=before.quarter===next.quarter?before.clock-next.clock:before.clock;
 next.fatigue={...before.fatigue};
 for(const p of Object.values(DATA.players))next.fatigue[p.id]=Math.max(0,(next.fatigue[p.id]||0)+(before.lineups[p.team].includes(p.id)?used:-used*.7));
 return next;
}
function carry(s,next){return {...next,playMode:'segment',coach:copy(s.coach),valueModel:valueModel(s),wpModel:wpModel(s),fatigue:copy(s.fatigue||{})};}
function historicalAt(s,cursor) {
 if(cursor<0){
  const end=DATA.possessions.at(-1).end;
  return carry(s,{...copy(s),...copy(end),phase:'final',clock:0,shotClock:0,turn:DATA.possessions.length,decisionReasons:['終場']});
 }
 const next=carry(s,replayState(cursor,s.seed));
 for(const p of DATA.possessions){
  const duration=Math.max(0,Math.min(elapsed(next),elapsed(p.end))-Math.max(elapsed(s),elapsed(p.start)));
  if(!duration)continue;
  for(const team of ['CLE','GSW'])for(const id of p.start.lineups[team])next.fatigue[id]=(next.fatigue[id]||0)+duration;
 }
 return next;
}
function nextHistoricalPossession(s) {
 const next=DATA.windows.findIndex(w=>s.mode==='replay'?w.possessionIndex>s.possessionIndex:elapsed(w.state)>elapsed(s));
 return historicalAt(s,next);
}
export function historicalSegment(s) {
 if(s.phase==='final')throw new Error('比賽已結束');
 const g=activeSegment(s);let next;
 if(!clutch(s)&&g)next=historicalAt(s,g.end.cursor);
 else next=nextHistoricalPossession(s);
 while(next.phase!=='final'&&clutch(next)&&!managedStop(next))next=nextHistoricalPossession(next);
 next.log=[...s.log,'實際・區段結束 CLE '+next.score.CLE+'：GSW '+next.score.GSW].slice(-12);
 next.coach.lineup=[...next.lineups[next.coach.team]];next.coach.target='';next.coach.timeout=false;
 return next;
}
export function runSegment(state,settings=state.coach,decision) {
 if(state.phase!=='playing')throw new Error('比賽已結束');
 if(clutch(state))settings={...settings,lineup:[...state.lineups[settings.team]]};
 validateCoach(state,settings);
 let s=copy(state);s.coach=copy(settings);s.lineups[settings.team]=[...settings.lineup];
 if(settings.timeout){if(s.timeouts[settings.team]<=0)throw new Error('沒有暫停');s.timeouts[settings.team]--;}
 s.coach.timeout=false;
 const g=activeSegment(s),end=g?.end.time??Infinity,late=clutch(s),q=s.quarter;
 if(decision&&late){
  if(state.possession!==settings.team)decision={...policy(state),defense:decision.defense};
  else decision={...decision,defense:state.plans[other(settings.team)].defense};
 }
 let count=0;
 do{
  let choice=late&&s.turn===state.turn?decision:undefined;
  if(choice?.action==='freeThrows'&&!freeThrowsRemaining(s))choice={...policy(s),defense:choice.defense};
  s=advanceSimulation(s,s.coach,choice);count++;
  if(count>1000)throw new Error('區段未能結束');
  if(s.quarter!==q)break;
  if(late){if(s.turn>state.turn&&(s.phase==='final'||managedStop(s)))break;}
  else if(elapsed(s)>=end||clutch(s))break;
 }while(s.phase==='playing');
 while(s.phase!=='final'&&s.quarter===q&&clutch(s)&&!managedStop(s))s=advanceSimulation(s,s.coach);
 s.coach.lineup=[...s.lineups[s.coach.team]];
 if(!s.lineups[other(s.coach.team)].includes(s.coach.target))s.coach.target='';
 s.segmentPossessions=s.turn-state.turn;
 s.log=[...s.log,'估計・區段自動完成 '+s.segmentPossessions+' 回合'].slice(-12);
 return s;
}
const percentile=(a,p)=>a[Math.floor((a.length-1)*p)];
export function segmentMonteCarlo(s,c=s.coach,count=128,seed=20151225) {
 if(!Number.isInteger(count)||count<1||count>4096)throw new Error('無效抽樣次數');
 validateCoach(s,c);
 const team=c.team,margin=s.score[team]-s.score[other(team)],margins=[],wps=[],points=[];let possessions=0;
 for(let i=0;i<count;i++){
  const start=copy(s);start.seed=(seed+Math.imul(i+1,2654435761))>>>0;
  const end=runSegment(start,c);margins.push(end.score[team]-end.score[other(team)]-margin);wps.push(winProbability(end,team));points.push(end.score[team]-s.score[team]);possessions+=end.turn-s.turn;
 }
 const mean=a=>a.reduce((x,y)=>x+y,0)/a.length,sorted=[...margins].sort((a,b)=>a-b),wpSorted=[...wps].sort((a,b)=>a-b);
 const actual=historicalSegment(s),historical={score:actual.score,margin:actual.score[team]-actual.score[other(team)]-margin,wp:winProbability(actual,team),reference:s.mode==='replay'?'實際同起點':'歷史終點參照・分支起點不同'};
 const bins=new Map();for(const n of margins){const b=Math.floor(n/4)*4;bins.set(b,(bins.get(b)||0)+1);}
 return {source:'估計',count,valueModel:valueModel(s),wpModel:wpModel(s),meanMargin:mean(margins),expectedPoints:mean(points),meanWP:mean(wps),possessions:possessions/count,
  percentiles:[.1,.5,.9].map(p=>percentile(sorted,p)),wpPercentiles:[.1,.5,.9].map(p=>percentile(wpSorted,p)),histogram:[...bins].sort((a,b)=>a[0]-b[0]).map(([from,n])=>({from,to:from+3,count:n})),historical,
  riskRate:margins.filter(n=>n<0).length/count,leverage:mean(wps.map(n=>Math.abs(n-winProbability(s,team))))/.055};
}
export function segmentComparison(s,c=s.coach,count=12) {
 if(s.phase==='final')return {rows:[],columns:[],disagreement:false};
 const rows=Object.entries(TEMPOS).map(([id,label])=>({id,label:label+'節奏',values:[]})),columns=[];
 for(const value of Object.keys(VALUE_MODELS))for(const wp of Object.keys(WP_MODELS)){
  const values=rows.map(r=>segmentMonteCarlo({...s,valueModel:value,wpModel:wp},{...c,tempo:r.id},count));
  const best=Math.max(...values.map(v=>v.meanWP));columns.push({valueModel:value,wpModel:wp,label:VALUE_MODELS[value].label+'・'+WP_MODELS[wp].label,best:rows.filter((_,i)=>Math.abs(values[i].meanWP-best)<1e-12).map(r=>r.id)});
  rows.forEach((row,i)=>row.values.push({expectedPoints:values[i].expectedPoints,winProbabilityAfter:values[i].meanWP,leverage:values[i].leverage,rank:1+values.filter(v=>v.meanWP>values[i].meanWP+1e-12).length}));
 }
 return {rows,columns,disagreement:new Set(columns.map(c=>c.best.join(','))).size>1};
}
export function segmentRemedies(s,c=s.coach,count=64){
 return ['switch','drop','blitz','zone'].map(id=>({id,label:DEFENSES[id],...segmentMonteCarlo(s,{...c,defense:id},count)})).sort((a,b)=>b.meanMargin-a.meanMargin);
}
export function segmentAnalysis(s,result) {
 const r=result||segmentMonteCarlo(s,s.coach,24),fact=(source,label,value)=>({source,label,value});
 const facts=[fact('實際','歷史區段終點比分',r.historical.score.CLE+'：'+r.historical.score.GSW),fact('估計','區段期望得分',r.expectedPoints.toFixed(2)),fact('估計','區段淨分',r.meanMargin.toFixed(2)),fact('估計','區段後勝率',(100*r.meanWP).toFixed(2)+'%'),fact('估計','淨分十分位／中位／九十分位',r.percentiles.join('／')),fact('估計','落後風險',(100*r.riskRate).toFixed(1)+'%'),fact('估計','教練節奏',TEMPOS[s.coach.tempo]),fact('估計','目標效率修正',targetBoost(s,s.coach).toFixed(3))];
 const pro=['教練只配置區段策略，球員自動完成回合。','以所選估值與勝率模型比較區段淨分分布。'],con=['歷史比分是實際；戰術、疲勞與對位映射皆為估計。','BPM 不是防守能力實測；目標對位只是透明代理。'],attack=['對手依預設策略自動進攻與防守。'],contingency=['區段淨分落後時，比較四種防守補救；抽樣排序不是因果效果。'];
 return {summary:'區段教練決策・估計',facts,comparisonFacts:[],pro,con,attack,contingency,points:[{sign:'＋',text:'支持這個選擇',detail:pro.join(''),facts},{sign:'−',text:'代價與限制',detail:con.join(''),facts:facts.filter(f=>f.source==='估計')}]};
}

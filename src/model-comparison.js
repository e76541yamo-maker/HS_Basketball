import {distribution,options,realChoice,other,winProbability,freeThrowsRemaining,lineupAdjustment,bonus} from './engine.js';
import {VALUE_MODELS,WP_MODELS,valueModel,wpModel} from './evaluation-models.js';

export function evaluateOption(s,decision={}) {
 const action=decision.action==='replay'?realChoice(s):decision.action||'pnr';
 const d=distribution(s,action,decision),team=s.possession,before=winProbability(s,team);
 const intentional=!freeThrowsRemaining(s)&&(decision.defense||s.plans[other(team)].defense)==='intentional'&&s.score[other(team)]<s.score[team];
 const seconds=intentional?Math.min(2,s.clock):d.seconds;
 const penalty=intentional&&bonus({...s,clock:s.clock-seconds},team);
 const retain=intentional&&!penalty||freeThrowsRemaining(s)>0&&s.pendingTechnicalFreeThrows===freeThrowsRemaining(s);
 let probabilities=d.points.map((p,i)=>(1-d.turnover)*p+(i===0?d.turnover:0));
 if(intentional){
  const ft=Math.min(1,(d.ftAdjustment??d.adjustment)*lineupAdjustment(s).ft);
  probabilities=penalty?[(1-ft)**2,2*ft*(1-ft),ft**2,0,0]:[1,0,0,0,0];
 }
 let expectedPoints=0,winProbabilityAfter=0,leverage=0;
 for(let points=0;points<5;points++) {
  const probability=probabilities[points];
  const next={...s,score:{...s.score,[team]:s.score[team]+points},clock:Math.max(0,s.clock-seconds),possession:retain?team:other(team)};
  if(intentional){
   next.teamFouls={...s.teamFouls,[other(team)]:s.teamFouls[other(team)]+1};
   if(next.clock<=120)next.lateFouls={...s.lateFouls,[other(team)]:s.lateFouls[other(team)]+1};
  }
  if(next.clock===0) {
   if(s.quarter>=4&&next.score.CLE!==next.score.GSW)next.phase='final';
   else {next.quarter++;next.clock=next.quarter>4?300:720;}
  }
  const after=winProbability(next,team);
  expectedPoints+=points*probability;winProbabilityAfter+=after*probability;leverage+=Math.abs(after-before)*probability/.055;
 }
 return {action,expectedPoints,winProbabilityAfter,leverage,valueModel:valueModel(s),wpModel:wpModel(s),source:'估計'};
}
export function compareModels(s,decision={}) {
 const rows=options(s).map(o=>({...o,label:o.id==='replay'?'實際選擇代理':o.label,values:[]})),columns=[];
 for(const value of Object.keys(VALUE_MODELS))for(const wp of Object.keys(WP_MODELS)) {
  const values=rows.map(row=>evaluateOption({...s,valueModel:value,wpModel:wp},{...decision,action:row.id}));
  const ranked=[...values].sort((a,b)=>b.winProbabilityAfter-a.winProbabilityAfter);
  const best=[...new Set(ranked.filter(v=>ranked[0].winProbabilityAfter-v.winProbabilityAfter<1e-12).map(v=>v.action))].sort();
  const column={valueModel:value,wpModel:wp,label:VALUE_MODELS[value].label+'・'+WP_MODELS[wp].label,best};columns.push(column);
  rows.forEach((row,i)=>row.values.push({...values[i],rank:1+values.filter(v=>v.winProbabilityAfter-values[i].winProbabilityAfter>1e-12).length}));
 }
 return {rows,columns,disagreement:new Set(columns.map(c=>c.best.join(','))).size>1};
}

import {options,policy,realChoice} from './engine.js';
import {evaluateOption} from './model-comparison.js';
import {coachSettings,TEMPOS} from './segments.js';

export function approximatelySame(a,b) {
 const n=a.length;
 if(n<2||n!==b.length)return true;
 const differences=a.map((v,i)=>v-b[i]),mean=differences.reduce((sum,v)=>sum+v,0)/n;
 const error=Math.sqrt(differences.reduce((sum,v)=>sum+(v-mean)**2,0)/(n*(n-1)));
 return Math.abs(mean)<= (n<=12?2.3:2)*error;
}

export function winInterval(p,n) {
 const z=1.96,z2=z*z,center=(p+z2/(2*n))/(1+z2/n);
 const half=z*Math.sqrt(p*(1-p)/n+z2/(4*n*n))/(1+z2/n);
 return [Math.max(0,center-half),Math.min(1,center+half)];
}

export function segmentPlans(s) {
 const baseline=coachSettings(s,s.coach.team);
 const alternatives=Object.keys(TEMPOS).map(tempo=>({...s.coach,tempo}));
 return {baseline,alternatives};
}

export function possessionPlans(s,decision,team,defending,defenses) {
 const view=v=>team===s.possession?v.winProbabilityAfter:1-v.winProbabilityAfter;
 const baseline=s.mode==='replay'?{action:'replay'}:policy(s);
 const choices=defending?Object.entries(defenses).map(([defense,label])=>({label,plan:{...policy(s),defense}})):
  options(s).filter(o=>o.id!=='replay').map(o=>({label:o.label,plan:{...decision,action:o.id,defense:decision.defense}}));
 const evaluate=(label,plan)=>({...evaluateOption(s,plan),label,plan});
 const recommended=choices.map(o=>evaluate(o.label,o.plan)).sort((a,b)=>view(b)-view(a))[0];
 const current=decision.action==='replay'?{action:realChoice(s)}:decision;
 return [evaluate('',current),recommended,evaluate(s.mode==='replay'?'歷史打法代理':'目前預設戰術',baseline)].map(r=>({...r,wp:view(r)}));
}

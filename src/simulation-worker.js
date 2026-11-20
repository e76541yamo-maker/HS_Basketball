import {monteCarlo} from './manager-options.js';
import {segmentMonteCarlo,segmentRemedies,clutch} from './segments.js';
import {segmentPlans} from './verification.js';
self.onmessage=({data})=>{ try {
 const segment=data.state.playMode==='segment'&&!clutch(data.state);
 const result=segment?{...segmentMonteCarlo(data.state,data.state.coach,data.count,data.seed),remedies:segmentRemedies(data.state),
  recommended:segmentMonteCarlo(data.state,{...data.state.coach,tempo:data.recommended},data.count,data.seed),
  verificationBaseline:segmentMonteCarlo(data.state,segmentPlans(data.state).baseline,data.count,data.seed)}:
  monteCarlo(data.state,data.decision,data.count,data.seed,data.state.coach.team,data.recommended);
 self.postMessage({id:data.id,result});
} catch { self.postMessage({id:data.id,error:'模擬無法完成'}); } };

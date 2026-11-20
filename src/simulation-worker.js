import {monteCarlo} from './manager-options.js';
import {segmentMonteCarlo,segmentRemedies,clutch} from './segments.js';
self.onmessage=({data})=>{ try {
 const segment=data.state.playMode==='segment'&&!clutch(data.state);
 const result=segment?{...segmentMonteCarlo(data.state,data.state.coach,data.count,data.seed),remedies:segmentRemedies(data.state)}:monteCarlo(data.state,data.decision,data.count,data.seed);
 self.postMessage({id:data.id,result});
} catch { self.postMessage({id:data.id,error:'模擬無法完成'}); } };

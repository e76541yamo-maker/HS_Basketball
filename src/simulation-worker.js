import {monteCarlo} from './manager-options.js';
self.onmessage=({data})=>{ try { self.postMessage({id:data.id,result:monteCarlo(data.state,data.decision,data.count,data.seed)}); } catch { self.postMessage({id:data.id,error:'模擬無法完成'}); } };

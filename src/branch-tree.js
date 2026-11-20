import {copy,TEAMS} from './engine.js';
export const STORAGE_KEY='courtside.2002.v1';
export function validState(s) {
  if(!(s?.version===1&&['playing','final'].includes(s.phase)&&['LAL','SAC'].includes(s.possession)&&Number.isFinite(s.seed)&&Number.isInteger(s.turn)&&s.turn>=0&&Number.isInteger(s.quarter)&&s.quarter>0&&s.clock>=0&&s.clock<=720&&s.shotClock>0&&s.shotClock<=24&&typeof s.zone==='string'&&s.zone.length<30&&Number.isFinite(s.elapsed)&&s.elapsed>=0&&Array.isArray(s.log)&&s.log.length<=40)) return false;
  return ['LAL','SAC'].every(t=>Number.isInteger(s.score?.[t])&&s.score[t]>=0&&s.lineups?.[t]?.length===5&&new Set(s.lineups[t]).size===5&&s.lineups[t].every(id=>TEAMS[t].some(p=>p.id===id))&&Number.isInteger(s.timeouts?.[t])&&s.timeouts[t]>=0&&s.timeouts[t]<=6&&Number.isInteger(s.teamFouls?.[t])&&s.teamFouls[t]>=0&&['triangle','motion'].includes(s.sets?.[t])&&['man','switch','double','hack'].includes(s.defense?.[t])&&TEAMS[t].every(p=>Number.isFinite(s.stamina?.[p.id])&&s.stamina[p.id]>=0&&s.stamina[p.id]<=100&&Number.isInteger(s.fouls?.[p.id]??0)&&(s.fouls?.[p.id]??0)>=0))&&s.lineups[s.possession].includes(s.handler);
}
export function restore(text) { try { const x=JSON.parse(text); if(validState(x.state)&&Array.isArray(x.branches)&&x.branches.length<=30&&x.branches.every(b=>typeof b.name==='string'&&validState(b.state))&&(!x.previous||validState(x.previous))) return x; } catch {} return null; }
export function addBranch(branches,state) { return [...branches,{name:`分支 ${branches.length+1}・第 ${state.turn} 回合`,state:copy(state)}].slice(-30); }

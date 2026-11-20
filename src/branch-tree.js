import {copy,DATA,player,CLOCK_CALLS,PLAY_TYPES,DEFENSES} from './engine.js';
export const STORAGE_KEY='courtside.possession.2015.v3';
const integer=(n,min,max=Number.MAX_SAFE_INTEGER)=>Number.isInteger(n)&&n>=min&&n<=max;
export function validState(s) {
 return Boolean(s?.version===3&&['replay','simulation'].includes(s.mode)&&['playing','final'].includes(s.phase)
  &&integer(s.cursor,0,DATA.windows.length-1)&&integer(s.possessionIndex,0,DATA.possessions.length-1)&&integer(s.seed,0,4294967295)
  &&integer(s.turn,0)&&integer(s.quarter,1)&&Number.isFinite(s.clock)&&s.clock>=0&&s.clock<=(s.quarter<=4?720:300)
  &&Number.isFinite(s.shotClock)&&s.shotClock>=0&&s.shotClock<=24&&['CLE','GSW'].includes(s.possession)
  &&integer(s.pendingFreeThrows,0,3)&&Array.isArray(s.log)&&s.log.length<=12&&s.log.every(x=>typeof x==='string')&&Array.isArray(s.decisionReasons)&&s.decisionReasons.every(x=>typeof x==='string')
  &&Object.keys(DATA.players).every(id=>integer(s.personalFouls?.[id],0,6))
  &&['CLE','GSW'].every(t=>integer(s.score?.[t],0)&&integer(s.teamFouls?.[t],0)&&integer(s.lateFouls?.[t],0)
   &&integer(s.timeouts?.[t],0,8)&&s.lineups?.[t]?.length===5&&new Set(s.lineups[t]).size===5&&s.lineups[t].every(id=>typeof id==='string'&&player(id)?.team===t)
   &&PLAY_TYPES[s.plans?.[t]?.offense]&&CLOCK_CALLS[s.plans?.[t]?.clock]&&DEFENSES[s.plans?.[t]?.defense]));
}
export function restore(text) {try {const x=JSON.parse(text);if(validState(x.state)&&Array.isArray(x.branches)&&x.branches.length<=30&&x.branches.every(b=>typeof b.name==='string'&&validState(b.state))&&(!x.previous||validState(x.previous)))return x;}catch{}return null;}
export const addBranch=(branches,state,name)=>[...branches,{name:name||'分支 '+(branches.length+1)+'・第 '+state.turn+' 回合',state:copy(state)}].slice(-30);

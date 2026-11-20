import rosters from './rosters.json' with { type: 'json' };
export const TEAMS = rosters;
export const copy = s => structuredClone(s);
export const player = id => Object.values(TEAMS).flat().find(p => p.id === id);
export const other = team => team === 'LAL' ? 'SAC' : 'LAL';
export function rngFrom(seed) { let x=seed>>>0; return () => { x=(x+0x6D2B79F5)|0; let t=Math.imul(x^x>>>15,1|x); t^=t+Math.imul(t^t>>>7,61|t); return ((t^t>>>14)>>>0)/4294967296; }; }
export function initialState(seed=2002) {
  const lineups = Object.fromEntries(Object.entries(TEAMS).map(([t,ps])=>[t,ps.slice(0,5).map(p=>p.id)]));
  return {version:1,seed,quarter:1,clock:720,shotClock:24,elapsed:0,turn:0,score:{LAL:0,SAC:0},possession:'LAL',handler:lineups.LAL[0],zone:'弧頂',lineups,fouls:{},teamFouls:{LAL:0,SAC:0},timeouts:{LAL:6,SAC:6},stamina:Object.fromEntries(Object.values(TEAMS).flat().map(p=>[p.id,100])),sets:{LAL:'triangle',SAC:'motion'},defense:{LAL:'man',SAC:'man'},phase:'playing',log:[],last:{kind:'start',points:0}};
}
export const bench = (s,t) => TEAMS[t].filter(p=>!s.lineups[t].includes(p.id) && (s.fouls[p.id]||0)<6);
export const matchup = s => s.lineups[other(s.possession)][s.lineups[s.possession].indexOf(s.handler)] || s.lineups[other(s.possession)][0];
export function options(s) {
  if(s.phase!=='playing') return [];
  return [...s.lineups[s.possession].filter(id=>id!==s.handler).map(id=>({id:'pass:'+id,label:'傳給 '+player(id).name})),...Object.entries({drive:'切入',pullup:'急停跳投',three:'三分出手',post:'低位單打',screen:'呼叫擋拆',hold:'持球重整'}).map(([id,label])=>({id,label}))];
}
function switchBall(s,t=other(s.possession)) { s.possession=t; s.handler=s.lineups[t][0]; s.shotClock=24; s.zone='弧頂'; }
function rebound(s,rng) {
  const offense=s.possession, defense=other(offense);
  const strength=s.lineups[offense].reduce((n,id)=>n+(player(id).orb_per_g||0),0);
  if(rng()<Math.min(.4,.15+strength*.018)) { s.handler=s.lineups[offense][Math.floor(rng()*5)]; s.shotClock=24; s.last.kind+='・進攻籃板'; }
  else { switchBall(s,defense); s.last.kind+='・防守籃板'; }
}
function foul(s,defender,rng,shots) {
  const t=other(s.possession); s.fouls[defender]=(s.fouls[defender]||0)+1; s.teamFouls[t]++;
  if(s.fouls[defender]>=6) { const replacement=bench(s,t)[0]; if(replacement) s.lineups[t][s.lineups[t].indexOf(defender)]=replacement.id; }
  let lastMade=true;
  for(let i=0;i<shots;i++) { lastMade=rng()<(player(s.handler).ft_pct??.7); if(lastMade) { s.score[s.possession]++; s.last.points++; } }
  if(lastMade) switchBall(s); else rebound(s,rng);
}
export function play(state,action) {
  if(state.phase!=='playing') throw new Error('比賽已結束');
  const id=typeof action==='string'?action:action.action;
  if(!options(state).some(o=>o.id===id)) throw new Error('不合法的持球決策');
  const s=copy(state), rng=rngFrom(s.seed), p=player(s.handler), defender=matchup(s), offense=s.possession;
  s.seed=Math.floor(rng()*4294967296); s.turn++;
  const seconds=Math.min(s.clock,s.shotClock,(id.startsWith('pass:')?2:id==='hold'?6: id==='post'||id==='screen'?7:4)+Math.floor(rng()*3));
  s.clock-=seconds; s.shotClock-=seconds; s.elapsed+=seconds;
  for(const t of ['LAL','SAC']) for(const q of TEAMS[t]) s.stamina[q.id]=Math.max(0,Math.min(100,s.stamina[q.id]+(s.lineups[t].includes(q.id)?-seconds*.055:seconds*.09)));
  s.last={kind:id,points:0,seconds,team:offense,handler:p.id};
  if(s.shotClock<=0) { s.last.kind='進攻時間違例'; switchBall(s); }
  else if(rng()<Math.min(.16,.025+(p.tov_per_g||1)*.009+(player(defender).stl_per_g||0)*.009)) { s.last.kind='失誤・抄截'; switchBall(s); }
  else if(id.startsWith('pass:')) { s.handler=id.slice(5); s.zone=['左翼','右翼','禁區','底角'][Math.floor(rng()*4)]; s.last.kind='傳球'; }
  else if(id==='hold'||id==='screen') { s.last.kind=id==='screen'?'擋拆換位':'持球重整'; s.zone=id==='screen'?'罰球線':'弧頂'; }
  else {
    const three=id==='three', value=three?3:2;
    const defense=s.defense[other(offense)], fatigue=(100-s.stamina[p.id])*.001;
    const adjustment=(id==='post'&&p.trb_per_g>8?.045:0)+(s.sets[offense]==='triangle'&&id==='post'?.02:0)-(defense==='double'&&p.name.includes("O'Neal")?.09:0);
    const made=rng()<Math.max(.12,(three?p.fg3_pct??.25:p.fg_pct??.42)+adjustment-fatigue);
    const shootingFoul=rng()<(defense==='hack'?.3:id==='drive'||id==='post'?.13:.055);
    s.last.kind=made?'投籃命中':'投籃未中';
    if(made) { s.score[offense]+=value; s.last.points=value; }
    if(shootingFoul) { s.last.kind=made?'進算加罰':'投籃犯規罰球'; foul(s,defender,rng,made?1:value); }
    else if(made) switchBall(s); else rebound(s,rng);
  }
  if(s.clock===0) {
    if(s.quarter>=4 && s.score.LAL!==s.score.SAC) s.phase='final';
    else { s.quarter++; s.clock=s.quarter>4?300:720; s.teamFouls={LAL:0,SAC:0}; switchBall(s,s.quarter%2?'LAL':'SAC'); }
  }
  if(id.startsWith('pass:') && s.handler===state.handler) s.handler=s.lineups[s.possession].find(q=>q!==state.handler);
  s.log=[...s.log,{...s.last,turn:s.turn}].slice(-40);
  return s;
}
export function substitute(state,team,outId,inId) {
  if(state.phase!=='playing'||!state.lineups[team]?.includes(outId)||!bench(state,team).some(p=>p.id===inId)) throw new Error('無法換人');
  const s=copy(state); s.lineups[team][s.lineups[team].indexOf(outId)]=inId; if(s.handler===outId) s.handler=inId; return s;
}
export function timeout(state,team) {
  if(state.phase!=='playing'||!state.timeouts[team]) throw new Error('暫停用盡');
  const s=copy(state); s.timeouts[team]--; for(const id of s.lineups[team]) s.stamina[id]=Math.min(100,s.stamina[id]+8); return s;
}

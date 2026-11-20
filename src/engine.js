import game from './tracking-game.json' with {type:'json'};
export const DATA=game;
export const copy=s=>structuredClone(s);
export const player=id=>game.players[String(id)];
export const TEAMS=Object.fromEntries(['CLE','GSW'].map(t=>[t,Object.values(game.players).filter(p=>p.team===t)]));
export const other=t=>t==='CLE'?'GSW':'CLE';
export const ZONES={rim:'籃下',mid:'中距離',three:'外線',backcourt:'後場'};
export const END_LABELS={pass:'傳球',make:'投籃命中',miss:'投籃未中',turnover:'失誤',foul:'犯規',reset:'控制中斷／重整',change:'球權轉換待判',period:'節末'};
export function rngFrom(seed) { let x=seed>>>0; return ()=>{ x=(x+0x6D2B79F5)|0; let t=Math.imul(x^x>>>15,1|x);t^=t+Math.imul(t^t>>>7,61|t);return ((t^t>>>14)>>>0)/4294967296; }; }
export const currentHold=s=>s.recordKind==='hold'?game.holds[game.timeline[s.cursor]?.index]:null;
export const currentEvent=s=>s.recordKind==='event'?game.events[game.timeline[s.cursor]?.index]:null;
export function eventLabel(e) { return ({1:'投籃命中',2:'投籃未中',3:'罰球',4:'籃板',5:e?.steal?'失誤／抄截':'失誤',6:'犯規',13:'節末'})[e?.type]||'比賽事件'; }
const holdTimes=game.holds.map(h=>h.t);
export function replayState(cursor=0,seed=20151225) {
  if(!Number.isInteger(cursor)||cursor<0||cursor>=game.timeline.length) throw new Error('未知追蹤節點');
  const item=game.timeline[cursor],r=(item.kind==='hold'?game.holds:game.events)[item.index];
  let hi=0; while(hi+1<holdTimes.length&&holdTimes[hi+1]<=item.t) hi++;
  const h=item.kind==='hold'?r:game.holds[hi];
  const positions=h.positions.map(([id,x,y])=>[String(id),x,y]);
  const lineups=Object.fromEntries(['CLE','GSW'].map(t=>[t,positions.filter(([id])=>player(id).team===t).map(([id])=>id)]));
  let handler=item.kind==='hold'?h.player:r.player;
  if(!handler||!positions.some(([id])=>id===handler)) handler=h.player;
  return {version:2,mode:'replay',cursor,recordKind:item.kind,seed,quarter:r.q,clock:Math.max(0,720-(item.t-(r.q-1)*720)),elapsed:item.t,shotClock:Math.max(.04,Math.min(24,h.shotClock??24)),score:{...item.score},turn:0,phase:'playing',possession:player(handler).team,handler,zone:h.zone,basketX:h.basketX,positions,lineups,positionsActual:item.kind==='hold',snapshotTime:h.t,anchor:cursor,last:{kind:'等待決策',points:0}};
}
export const initialState=(seed=20151225)=>replayState(0,seed);
export function matchup(s) {
  const p=s.positions.find(([id])=>id===s.handler);
  if(!p) return null;
  const opponents=s.positions.filter(([id])=>player(id).team!==s.possession);
  return opponents.sort((a,b)=>Math.hypot(a[1]-p[1],a[2]-p[2])-Math.hypot(b[1]-p[1],b[2]-p[2]))[0]?.[0];
}
export function defenderDistance(s) { const a=s.positions.find(([id])=>id===s.handler),b=s.positions.find(([id])=>id===matchup(s)); return a&&b?Math.hypot(a[1]-b[1],a[2]-b[2]):6; }
export const distanceBin=d=>d<4?'tight':d>=6?'open':'normal';
export function profile(s,id=s.handler,zone=s.zone) {
  const p=player(id),d=game.distributions[id],cell=d.shotCells[zone+':'+distanceBin(defenderDistance({...s,handler:id,possession:p.team}))]||{n:0,made:0},prior=game.teamRates[p.team].fgRate;
  return {observed:d,cell,fg:(cell.made+10*prior)/(cell.n+10),turnover:(d.turnovers+10*teamTos[p.team]/Math.max(1,teamHoldCounts[p.team]))/(d.holds+10),meanHold:d.durations.length?d.durations.reduce((a,b)=>a+b,0)/d.durations.length:2,ft:(d.ftm+10*.75)/(d.fta+10)};
}
export function realChoice(s) {
  const h=currentHold(s);
  if(!h) return 'reset';
  return h.endKind==='pass'?'pass:'+h.target:['make','miss'].includes(h.endKind)?h.endZone==='rim'&&h.zone!=='rim'?'drive':'shoot':'reset';
}
export function realLabel(s) { const h=currentHold(s),e=currentEvent(s); return h?`${END_LABELS[h.endKind]}${h.target?' → '+player(h.target).name:''}${['make','miss'].includes(h.endKind)?'・'+ZONES[h.endZone]:''}`:eventLabel(e)+(e?.player?'・'+player(e.player).name:''); }
export function options(s) {
  if(s.phase!=='playing') return [];
  if(s.mode==='replay'&&s.recordKind==='event') return [{id:'replay',label:'依實際紀錄繼續'}];
  return [...(s.mode==='replay'?[{id:'replay',label:'依實際選擇重播'}]:[]),...s.lineups[s.possession].filter(id=>id!==s.handler).map(id=>({id:'pass:'+id,label:'傳給 '+player(id).name})),{id:'shoot',label:'原地出手'},{id:'drive',label:'切入出手'},{id:'reset',label:'持球重整'}];
}
const teamDurations=Object.fromEntries(['CLE','GSW'].map(t=>[t,TEAMS[t].flatMap(p=>game.distributions[p.id].durations)]));
const teamHoldCounts=Object.fromEntries(['CLE','GSW'].map(t=>[t,TEAMS[t].reduce((n,p)=>n+game.distributions[p.id].holds,0)]));
const teamTos=Object.fromEntries(['CLE','GSW'].map(t=>[t,game.events.filter(e=>e.type===5&&e.team===t).length]));
const baskets=Object.fromEntries(game.holds.map(h=>[h.team+':'+h.q,h.basketX]));
function refreshGeometry(s,rng) {
  s.positions=s.positions.map(([id,x,y])=>[id,Math.max(1,Math.min(93,x+(rng()-.5)*5)),Math.max(1,Math.min(49,y+(rng()-.5)*5))]);
}
function switchBall(s,t=other(s.possession)) { s.possession=t;s.handler=s.lineups[t][0];s.shotClock=24;s.basketX=baskets[t+':'+Math.min(4,s.quarter)];s.transition=true;const p=s.positions.find(([id])=>id===s.handler);s.zone=zoneAt(p[1],p[2],s.basketX); }
export function simulateHold(state,action) {
  const s=copy(state),rng=rngFrom(s.seed);s.mode='simulation';s.positionsActual=false;s.anchor=state.anchor??state.cursor;s.seed=Math.floor(rng()*4294967296);s.turn++;
  const p=player(s.handler),d=game.distributions[p.id],stats=profile(s);
  const durations=d.durations.length?d.durations:teamDurations[p.team];
  const lead=s.score[s.possession]-s.score[other(s.possession)];
  const intentional=s.quarter>=4&&s.clock<=40&&lead>0&&lead<=9&&(lead>=4||s.clock<=s.shotClock+2);
  const advance=s.transition?4:0;
  if(s.transition) {
    s.positions=s.positions.map(([id,x,y])=>player(id).team===s.possession?[id,s.basketX<47?Math.min(x,28):Math.max(x,66),y]:[id,x,y]);
    s.zone=zoneAt(...s.positions.find(([id])=>id===s.handler).slice(1),s.basketX);s.transition=false;
  }
  const seconds=Math.min(s.clock,s.shotClock,intentional?1.5:advance+Math.max(.4,durations[Math.floor(rng()*durations.length)]||2));
  s.elapsed+=seconds;s.clock=Math.max(0,s.clock-seconds);s.shotClock=Math.max(0,s.shotClock-seconds);s.last={kind:'持球重整',points:0,seconds};
  if(intentional&&s.clock>0) {for(let i=0;i<2;i++)if(rng()<stats.ft){s.score[s.possession]++;s.last.points++;}s.last.kind='落後方戰術犯規・兩罰';switchBall(s);}
  else if(s.shotClock<.001||rng()<stats.turnover) {s.last.kind=s.shotClock<.001?'進攻時間違例':'失誤／抄截';switchBall(s);}
  else if(action.startsWith('pass:')) { s.handler=action.slice(5);const pos=s.positions.find(([id])=>id===s.handler);s.zone=zoneAt(pos[1],pos[2],s.basketX);s.last.kind='傳球'; }
  else if(action==='shoot'||action==='drive') {
    if(action==='drive') {s.zone='rim';const pos=s.positions.find(([id])=>id===s.handler);pos[1]=s.basketX<47?9:85;pos[2]=25;}
    const shooting=profile(s),three=s.zone==='three'||s.zone==='backcourt',value=three?3:2;
    const plan=s.defensePlan?.team===other(s.possession)?s.defensePlan.id:null;
    const adjust=plan==='pressure'?.93:plan==='perimeter'?(three?.88:1.04):1;
    const made=rng()<shooting.fg*(s.zone==='backcourt'?.15:1)*adjust;const foul=rng()<(plan==='pressure'?.12:.075);
    if(made) { s.score[s.possession]+=value;s.last.points=value; }
    s.last.kind=made?'投籃命中':'投籃未中';
    if(foul) { const n=made?1:value; for(let i=0;i<n;i++) if(rng()<shooting.ft) {s.score[s.possession]++;s.last.points++;} s.last.kind=made?'進算加罰':'投籃犯規罰球';switchBall(s); }
    else if(made) switchBall(s);
    else if(rng()<(plan==='rebound'?.18:.25)) {s.handler=s.lineups[s.possession][Math.floor(rng()*5)];s.shotClock=24;s.last.kind+='・進攻籃板';}
    else {switchBall(s);s.last.kind+='・防守籃板';}
  }
  refreshGeometry(s,rng);
  if(s.clock<.001) {
    s.clock=0;
    if(s.quarter>=4&&s.score.CLE!==s.score.GSW) s.phase='final';
    else {s.quarter++;s.clock=s.quarter>4?300:720;switchBall(s,s.quarter%2?'CLE':'GSW');}
  }
  if(action.startsWith('pass:')&&s.handler===state.handler) s.handler=s.lineups[s.possession].find(id=>id!==state.handler);
  return s;
}
export function zoneAt(x,y,basket=5.25) {if(basket<47&&x>47||basket>47&&x<47)return 'backcourt';const d=Math.hypot(x-basket,y-25);return d<8?'rim':d>=23.75||(y<3||y>47)&&d>22?'three':'mid';}
export function play(s,action) {
  if(!options(s).some(o=>o.id===action)) throw new Error('不合法的持球決策');
  if(action==='replay') {
    if(s.cursor+1<game.timeline.length) { const n=replayState(s.cursor+1,s.seed);n.turn=s.turn+(currentHold(s)?1:0);n.last={kind:realLabel(s),points:currentEvent(s)?.points||0};return n; }
    const n=copy(s);n.phase='final';n.clock=0;n.elapsed=2880;n.score={...game.meta.validation.finalScore};n.turn+=currentHold(s)?1:0;n.last={kind:'史實終場',points:0};return n;
  }
  return simulateHold(s,action);
}
function weighted(entries,rng) { let n=rng()*entries.reduce((sum,[,w])=>sum+w,0);for(const [id,w] of entries) {n-=w;if(n<=0)return id;} return entries.at(-1)[0]; }
export function policy(s) {
  if(s.shotClock<5) return 'shoot';
  if(s.quarter>=4&&s.clock<=120) {
    const gap=s.score[s.possession]-s.score[other(s.possession)];
    if(gap>0&&s.shotClock>7)return 'reset';
    if(gap<0)return rngFrom(s.seed+101)()<(gap<=-4?.8:.6)?'shoot':'drive';
  }
  const rng=rngFrom(s.seed+101),counts=game.distributions[s.handler].choices[s.zone]||{};
  const action=weighted([['pass',(counts.pass||0)+2],['shoot',(counts.shoot||0)+2],['drive',(counts.drive||0)+1],['reset',(counts.reset||0)+1]],rng);
  if(action!=='pass') return action;
  const targets=game.distributions[s.handler].targets;
  return 'pass:'+weighted(s.lineups[s.possession].filter(id=>id!==s.handler).map(id=>[id,(targets[id]||0)+1]),rng);
}
export function winProbability(s,team='CLE') {
  const remaining=Math.max(0,(4-s.quarter)*720+s.clock),scale=3+Math.sqrt(remaining/24)*2.5;
  const p=1/(1+Math.exp(-(s.score.CLE-s.score.GSW)/scale));return team==='CLE'?p:1-p;
}
const swing=s=>Math.abs(winProbability({...s,score:{...s.score,CLE:s.score.CLE+3}})-winProbability(s));
const avgSwing=game.timeline.filter(x=>x.kind==='hold').reduce((sum,x)=>sum+swing({quarter:game.holds[x.index].q,clock:game.holds[x.index].clock,score:x.score}),0)/game.holds.length;
export const leverage=s=>swing(s)/avgSwing;

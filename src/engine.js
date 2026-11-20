import tracking from './tracking-game.json' with {type:'json'};
import possessions from './possession-game.json' with {type:'json'};

export const DATA={...tracking,...possessions};
export const copy=s=>structuredClone(s);
export const player=id=>DATA.players[String(id)];
export const other=t=>t==='CLE'?'GSW':'CLE';
export const TEAMS=Object.fromEntries(['CLE','GSW'].map(t=>[t,Object.values(DATA.players).filter(p=>p.team===t)]));
export const PLAY_TYPES={
 pnr:{label:'擋拆持球者',points:[.42,.06,.38,.13,.01],turnover:.14,foul:.16,seconds:16},
 roll:{label:'擋拆順下者',points:[.36,.08,.49,.05,.02],turnover:.15,foul:.22,seconds:14},
 isolation:{label:'單打',points:[.46,.06,.36,.11,.01],turnover:.12,foul:.18,seconds:18},
 post:{label:'低位背框',points:[.43,.08,.43,.05,.01],turnover:.15,foul:.21,seconds:18},
 spotup:{label:'定點接球',points:[.44,.03,.27,.25,.01],turnover:.09,foul:.10,seconds:14},
 motion:{label:'手遞手／無球掩護',points:[.42,.04,.35,.18,.01],turnover:.13,foul:.12,seconds:17},
 transition:{label:'轉換快攻／推進',points:[.35,.07,.44,.12,.02],turnover:.17,foul:.20,seconds:8}
};
export const CLOCK_CALLS={normal:'一般節奏',hold:'壓到最後一擊',twoForOne:'搶兩波攻勢',quickThree:'落後搶三分'};
export const DEFENSES={switch:'換防',drop:'沉退',blitz:'夾擊施壓',zone:'區域聯防',intentional:'落後故意犯規'};
const clamp=(n,a,b)=>Math.max(a,Math.min(b,n));
export function rngFrom(seed) {let x=seed>>>0;return()=>{x+=0x6D2B79F5;let t=x;t=Math.imul(t^t>>>15,t|1);t^=t+Math.imul(t^t>>>7,t|61);return((t^t>>>14)>>>0)/4294967296;};}
export const remaining=s=>(Math.max(0,4-s.quarter)*720+s.clock);
export const bonus=(s,t)=>s.teamFouls[other(t)]>=(s.quarter>4?3:4)||(s.clock<=120&&s.lateFouls[other(t)]>=1);
export const currentPossession=s=>DATA.possessions[s.possessionIndex]||null;
export const currentWindow=s=>s.mode==='replay'?DATA.windows[s.cursor]:null;
export function freeThrowsRemaining(s) {
 if(s.pendingFreeThrows!=null)return s.pendingFreeThrows;
 if(s.mode!=='replay')return 0;
 const w=currentWindow(s),p=currentPossession(s);
 const es=p.events.slice(w.offset);
 const live=es.findIndex(e=>[1,2,5].includes(e.kind));
 return es.slice(0,live<0?undefined:live).filter(e=>e.kind===3&&e.clock===s.clock&&!e.description.includes('Technical')).length;
}
function baseState(seed) {
 return {version:3,mode:'replay',cursor:0,possessionIndex:0,seed:seed>>>0,turn:0,phase:'playing',
  possession:'CLE',shotClock:24,log:[],last:{kind:'節次開始'},decisionReasons:['節次開始'],plans:{CLE:{offense:'pnr',defense:'switch',clock:'normal'},GSW:{offense:'pnr',defense:'switch',clock:'normal'}}};
}
export function replayState(cursor=0,seed=20151225) {
 if(!Number.isInteger(cursor)||cursor<0||cursor>=DATA.windows.length)throw new Error('無此回合窗口');
 const w=DATA.windows[cursor],p=DATA.possessions[w.possessionIndex];
 const s={...baseState(seed),...copy(w.state),cursor,possessionIndex:w.possessionIndex,turn:w.possessionIndex,
  possession:p.team,decisionReasons:[...new Set(w.reasons)],shotClock:24};
 const used=p.start.clock-s.clock;
 s.shotClock=clamp(24-used,1,24);
 if(w.offset&&p.events.slice(0,w.offset).some(e=>e.kind===6||e.kind===7))s.shotClock=Math.max(14,s.shotClock);
 s.pendingFreeThrows=freeThrowsRemaining(s);
 return s;
}
export const initialState=(seed=20151225)=>replayState(0,seed);
export const realChoice=s=>freeThrowsRemaining(s)?'freeThrows':currentPossession(s)?.playType||'pnr';
export const realLabel=s=>s.mode==='replay'?currentPossession(s).description:'估計・依回合分布推演，不再接回史實';
export const policy=s=>{
 const gap=s.score[s.possession]-s.score[other(s.possession)];
 const intentional=s.quarter>=4&&s.clock<=40&&gap>0&&gap<=10&&(gap>=4||s.clock<=s.shotClock+2);
 return {action:freeThrowsRemaining(s)?'freeThrows':s.plans[s.possession].offense,
  clock:s.quarter>=4&&s.clock<120?(gap>0?'hold':gap<=-3?'quickThree':'normal'):'normal',
  defense:intentional?'intentional':s.plans[other(s.possession)].defense};
};
export function options(s) {
 if(s.phase==='final')return [];
 return [...(s.mode==='replay'?[{id:'replay',label:'沿實際路線・前往下個決策窗口'}]:[]),
  ...(freeThrowsRemaining(s)?[{id:'freeThrows',label:'分岔模擬・剩餘罰球'}]:Object.entries(PLAY_TYPES).map(([id,p])=>({id,label:p.label})))];
}
export function lineupAdjustment(s,t=s.possession) {
 let efficiency=0,usage=0,ft=0;
 for(const id of s.lineups[t]) {
  const season=DATA.seasonStats[id]||{},d=DATA.distributions[id],weight=season.usg_pct||15;
  const gameTS=d.points/Math.max(1,2*(d.fga+.44*d.fta));
  const shrunk=(gameTS*Math.min(8,d.fga)+(season.ts_pct||.54)*30)/(Math.min(8,d.fga)+30);
  efficiency+=shrunk*weight;ft+=(season.ft_pct||.75)*weight;usage+=weight;
 }
 return {efficiency:clamp(efficiency/usage/.55,.85,1.16),ft:ft/usage,source:'估計'};
}
export function distribution(s,action='pnr',decision={}) {
 if(action==='freeThrows'){
  const a=lineupAdjustment(s),n=freeThrowsRemaining(s),points=[1,0,0,0,0];
  for(let i=0;i<n;i++)for(let k=i+1;k>=0;k--)points[k]=(points[k]||0)*(1-a.ft)+(k?points[k-1]*a.ft:0);
  return {points,turnover:0,foul:1,seconds:0,source:'估計',adjustment:a.efficiency};
 }
 const p=PLAY_TYPES[action]||PLAY_TYPES.pnr,points=[...p.points],a=lineupAdjustment(s);
 const defense=decision.defense||s.plans[other(s.possession)].defense;
 let to=p.turnover,seconds=p.seconds;
 const boost=(a.efficiency-1)*.30+(defense==='drop'&&action==='spotup'?.02:0)-(defense==='zone'&&action==='post'?.02:0);
 points[0]-=boost;points[2]+=boost;
 if(defense==='blitz'){to+=.045;points[0]-=.02;points[3]+=.02;}
 if(defense==='switch'&&action==='pnr'){points[0]+=.012;points[2]-=.012;}
 const call=decision.clock||s.plans[s.possession].clock;
 if(call==='hold')seconds=Math.min(s.shotClock,s.clock)-1;
 if(call==='twoForOne')seconds=s.clock>=28&&s.clock<=40?6:Math.min(seconds,10);
 if(call==='quickThree') {points[0]+=.05;points[2]-=.20;points[3]+=.15;seconds=6;}
 return {points,turnover:clamp(to,.03,.3),foul:p.foul,seconds:clamp(seconds,1,24),source:'估計',adjustment:a.efficiency};
}
export function winProbability(s,team=s.possession) {
 const margin=s.score.CLE-s.score.GSW;
 if(s.phase==='final'){const p=margin>0?1:margin<0?0:.5;return team==='CLE'?p:1-p;}
 // Logistic approximation to residual scoring variance, calibrated at +6 / 77s / ball.
 const advantage=margin+(s.possession==='CLE'?.65:-.65)+(bonus(s,'CLE')?.20:0)-(bonus(s,'GSW')?.20:0);
 const scale=Math.sqrt(Math.max(.08,remaining(s)*.075))*.98;
 const p=1/(1+Math.exp(-advantage/scale));return team==='CLE'?p:1-p;
}
export const leverage=s=>s.phase==='final'?0:(winProbability({...s,score:{...s.score,[s.possession]:s.score[s.possession]+3}},s.possession)-winProbability(s,s.possession))/.055;
function appendLog(s,text) {s.log=[...s.log,text].slice(-12);}
function logActual(s,from,to) {
 for(let i=from;i<to;i++){const p=DATA.possessions[i];appendLog(s,'實際・第 '+(i+1)+' 回合 '+p.team+' ＋'+p.points[p.team]+' 分・'+p.description);}
}
function replayNext(state) {
 let i=state.cursor+1;
 while(i<DATA.windows.length&&!DATA.windows[i].decision)i++;
 if(i>=DATA.windows.length) {
  const s=copy(state),end=DATA.possessions.at(-1).end;
  Object.assign(s,copy(end),{phase:'final',shotClock:0,turn:DATA.possessions.length,decisionReasons:['終場']});
  logActual(s,state.possessionIndex,DATA.possessions.length);s.last={kind:'實際・終場'};return s;
 }
 const s=replayState(i,state.seed);s.log=copy(state.log);s.plans=copy(state.plans);
 logActual(s,state.possessionIndex,s.possessionIndex);
 s.last={kind:s.possessionIndex===state.possessionIndex?'同一回合・死球管理窗口':'實際回合自動前進'};
 return s;
}
function personalFoul(s,t,rng,clock=s.clock) {
 s.teamFouls[t]++;if(clock<=120)s.lateFouls[t]++;
 const id=s.lineups[t][Math.floor(rng()*5)];s.personalFouls[id]++;
 if(s.personalFouls[id]>=6) {
  const replacement=TEAMS[t].find(p=>!s.lineups[t].includes(p.id)&&s.personalFouls[p.id]<6);
  if(replacement)s.lineups[t][s.lineups[t].indexOf(id)]=replacement.id;
 }
}
function periodEnd(s) {
 if(s.clock>0)return;
 if(s.quarter>=4&&s.score.CLE!==s.score.GSW){s.phase='final';s.shotClock=0;s.decisionReasons=['終場'];return;}
 s.quarter++;s.clock=s.quarter>4?300:720;s.shotClock=24;
 s.teamFouls={CLE:0,GSW:0};s.lateFouls={CLE:0,GSW:0};
 if(s.quarter>4)s.timeouts={CLE:2,GSW:2};
 s.decisionReasons=['節次開始'];
}
export function simulatePossession(state,decision={}) {
 if(state.phase!=='playing')throw new Error('比賽已結束');
 if(typeof decision==='string')decision={action:decision};
 const action=decision.action||policy(state).action;
 if(!PLAY_TYPES[action]&&action!=='freeThrows')throw new Error('無此進攻類型');
 if(decision.clock&&!CLOCK_CALLS[decision.clock]||decision.defense&&!DEFENSES[decision.defense])throw new Error('無此戰術');
 if(action==='freeThrows'&&!freeThrowsRemaining(state))throw new Error('目前沒有待罰球');
 if(freeThrowsRemaining(state)&&action!=='freeThrows')throw new Error('罰球窗口只能調整換人、暫停或完成罰球');
 const s=copy(state),off=s.possession,def=other(off),rng=rngFrom(s.seed),d=distribution(s,action,decision);
 s.mode='simulation';s.plans[off].offense=PLAY_TYPES[action]?action:s.plans[off].offense;
 if(decision.clock)s.plans[off].clock=decision.clock;
 if(decision.defense)s.plans[def].defense=decision.defense;
 let points=0,kind='empty',foul=false,orb=0,used=0;
 const intentional=!freeThrowsRemaining(state)&&s.plans[def].defense==='intentional'&&s.score[def]<s.score[off];
 const ftCount=freeThrowsRemaining(state);
 s.pendingFreeThrows=0;
 if(intentional||ftCount) {
  if(intentional){
   used=Math.min(2,s.clock);const penalty=bonus({...s,clock:s.clock-used},off);personalFoul(s,def,rng,s.clock-used);foul=true;
   if(!penalty){
    s.clock-=used;s.shotClock=Math.max(14,s.shotClock-used);s.seed=Math.floor(rng()*4294967296)>>>0;s.last={kind:'foul',team:off,points:0,seconds:used,offensiveRebounds:0,foul:true};s.decisionReasons=['犯規・邊線發球'];
    appendLog(s,'估計・非加罰犯規，同一回合邊線發球');periodEnd(s);return s;
   }
  }
  const n=ftCount||2;
  for(let i=0;i<n;i++)if(rng()<d.adjustment*lineupAdjustment(s).ft)points++;
  kind=points?'score':'empty';foul=true;
 } else {
  // Offensive rebounds repeat inside this turn; they never hand control to the opponent.
  for(;;) {
   used+=Math.min(orb?14:s.shotClock,Math.max(1,d.seconds+(rng()-.5)*8));
   if(rng()<d.turnover){kind='turnover';break;}
   let x=rng();points=4;
   for(let n=0;n<d.points.length;n++){x-=d.points[n];if(x<=0){points=n;break;}}
   foul=points===1||points===4||rng()<d.foul;
   if(foul){personalFoul(s,def,rng,Math.max(0,s.clock-used));if(points===0)points=Number(rng()<lineupAdjustment(s).ft)+Number(rng()<lineupAdjustment(s).ft);}
   if(points>0){kind='score';break;}
   if(foul||used>=s.clock||rng()>=.24){kind='empty';break;}
   orb++;
  }
 }
 used=Math.min(s.clock,Math.max(ftCount?0:1,used));
 s.clock=Math.max(0,s.clock-used);s.score[off]+=points;s.turn++;s.possession=def;s.shotClock=24;
 s.seed=Math.floor(rng()*4294967296)>>>0;
 s.decisionReasons=foul?['犯規／罰球結束']:points>0?['進球']:s.quarter>=4&&s.clock<=300?['末節每回合']:[];
 s.last={kind,team:off,points,seconds:used,offensiveRebounds:orb,foul};
 appendLog(s,'估計・第 '+s.turn+' 回合 '+off+' ＋'+points+' 分・'+(PLAY_TYPES[action]?.label||'罰球')+(orb?'・進攻籃板延續 '+orb+' 次':''));
 periodEnd(s);
 return s;
}
export function play(state,decision='replay') {
 const action=typeof decision==='string'?decision:decision.action;
 if(state.phase!=='playing')throw new Error('比賽已結束');
 if(action==='replay') {
  if(state.mode!=='replay')throw new Error('分支不能返回未來史實');
  return replayNext(state);
 }
 let s=simulatePossession(state,decision),automatic=0;
 while(s.phase==='playing'&&!s.decisionReasons.length) {s=simulatePossession(s,policy(s));automatic++;}
 s.autoAdvanced=automatic;return s;
}
export function manage(state,decision) {
 if(state.phase!=='playing')throw new Error('比賽已結束');
 const s=copy(state),t=decision.team;
 if(!TEAMS[t])throw new Error('無此球隊');
 if(decision.type==='timeout') {
  if(t!==s.possession&&(!s.decisionReasons.length||s.decisionReasons.every(r=>r==='末節每回合')))throw new Error('活球僅持球隊可叫暫停');
  if(s.timeouts[t]<=0)throw new Error('沒有暫停');
  s.timeouts[t]--;s.decisionReasons=['暫停'];s.last={kind:t+' 暫停'};
 } else if(decision.type==='substitution') {
  const {out:old,in:incoming}=decision;
  if(!s.decisionReasons.length||s.decisionReasons.every(r=>r==='末節每回合'))throw new Error('活球不能換人');
  if(!s.lineups[t].includes(old)||player(incoming)?.team!==t||s.lineups[t].includes(incoming)||s.personalFouls[incoming]>=6)throw new Error('無效換人');
  s.lineups[t][s.lineups[t].indexOf(old)]=incoming;s.last={kind:'換人・'+player(incoming).name};s.decisionReasons=['換人窗口'];
 } else throw new Error('無此管理選項');
 s.mode='simulation';appendLog(s,'估計分支・'+s.last.kind);return s;
}

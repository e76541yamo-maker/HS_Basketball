import {DATA,other} from './engine.js';
import {activeSegment,clutch} from './segments.js';

export const clock=s=>Math.floor(s/60)+':'+String(Math.floor(s%60)).padStart(2,'0');
const stamp=s=>'第 '+s.quarter+' 節 '+clock(s.clock);
export const signed=n=>n<0?'−'+(-n):n>0?'＋'+n:'0';
export const emptyEvents=()=>({turnovers:0,rebounds:0,fouls:0});
export function addEvent(events,last){
 events.turnovers+=Number(last.kind==='turnover');
 events.rebounds+=last.offensiveRebounds;
 events.fouls+=Number(last.foul);
}

function historicalEvents(before,after){
 const events=emptyEvents(),start=DATA.windows[before.cursor],end=after.phase==='final'?null:DATA.windows[after.cursor];
 for(let i=start.possessionIndex;i<=(end?.possessionIndex??DATA.possessions.length-1);i++){
  const {events:list}=DATA.possessions[i],from=i===start.possessionIndex?start.offset:0,to=i===end?.possessionIndex?end.offset:list.length;
  let missedBy;
  for(let offset=0;offset<to;offset++){
   const e=list[offset],inSegment=offset>=from;
   if(e.kind===2)missedBy=e.team;
   if(e.kind===3&&!e.description.includes('Technical')){
    const attempt=e.description.match(/(\d+) of (\d+)/);
    missedBy=attempt&&attempt[1]===attempt[2]&&e.description.includes('MISS')?e.team:null;
   }
   if(e.kind===4){
    if(inSegment&&missedBy&&e.team===missedBy)events.rebounds++;
    missedBy=null;
   }
   if(inSegment&&e.kind===5)events.turnovers++;
   if(inSegment&&e.kind===6)events.fouls++;
  }
 }
 return events;
}

export function decisionResult(before,after,events){
 const points=Object.fromEntries(['CLE','GSW'].map(t=>[t,after.score[t]-before.score[t]])),team=before.coach.team;
 const facts=after.mode==='replay'?historicalEvents(before,after):events||emptyEvents();
 const plays=[[facts.turnovers,'失誤'],[facts.rebounds,'進攻籃板'],[facts.fouls,'犯規']].filter(([n])=>n>0).map(([n,label])=>label+' '+n+' 次');
 const opp=other(team),margin=points[team]-points[opp],completed=after.turn-before.turn;
 const lead=margin>0?team+' 在這次推進多拿 '+margin+' 分。':margin<0?opp+' 在這次推進多拿 '+(-margin)+' 分。':'這次推進未拉開分差。';
 const narrative=lead+(plays.length?'期間出現'+plays.join('、')+'。':completed?'雙方完成 '+completed+' 次球隊進攻。':'同一回合內調整，球權未因決策窗口自動轉移。');
 const next=after.phase==='final'?'終場・進入賽後復盤':stamp(after)+' · '+(after.playMode==='segment'?(clutch(after)?'末段攻防・'+after.possession+' 球權':activeSegment(after)?.label||'延長賽區段'):(after.decisionReasons.join('／')||after.possession+' 球權'));
 return {team,points,margin,narrative,next,start:stamp(before),end:stamp(after),source:after.mode==='replay'?'實際':'估計'};
}

export function reviewSummary(state){
 const records=state.decisionResults||[],team=state.coach.team,opponent=other(team);
 const margin=state.score[team]-state.score[opponent],best=records.reduce((a,b)=>!a||Math.abs(b.points[team]-b.points[opponent])>Math.abs(a.points[team]-a.points[opponent])?b:a,null);
 return {team,margin,best,records};
}

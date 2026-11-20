import {DATA,replayState} from './engine.js';
const at=(q,clock)=>DATA.timeline.findIndex(x=>x.kind==='hold'&&DATA.holds[x.index].q===q&&DATA.holds[x.index].clock<=clock);
export const MOMENTS=[{id:'start',label:'從開局開始',detail:'聖誕大戰・全部追蹤持球',cursor:0},...[[540,'末節・九分鐘','Dellavedova 追分前・事件 428'],[319,'末節・五分鐘','Livingston 扣籃後・事件 476'],[134,'末節・兩分鐘','Love 補籃後・事件 505'],[79,'末節・最後攻防','Curry 突破後・事件 515'],[20,'末節・罰球拉鋸','最後的得分機會・事件 524']].map(([clock,label,detail],i)=>({id:'key'+i,label,detail,cursor:at(4,clock)}))];
export function momentState(id) {const m=MOMENTS.find(m=>m.id===id);if(!m||m.cursor<0)throw new Error('未知情境');const s=replayState(m.cursor);s.moment=id;return s;}

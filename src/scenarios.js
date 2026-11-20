import {initialState} from './engine.js';
export const MOMENTS=[
  {id:'start',label:'從開局開始',date:'全新比賽',detail:'雙方代表陣容・完整四節',source:'估計'},
  {id:'g4',label:'第四戰・最後一擊',date:'2002 / 05 / 26',detail:'湖人落後，霍瑞奇蹟之前',quarter:4,clock:11.8,score:{LAL:97,SAC:99},possession:'LAL',handler:'LAL0',url:'https://www.basketball-reference.com/boxscores/200205260LAL.html'},
  {id:'g6',label:'第六戰・第四節',date:'2002 / 05 / 31',detail:'背水一戰，進入決勝節',quarter:4,clock:720,score:{LAL:75,SAC:75},possession:'LAL',handler:'LAL0',url:'https://www.basketball-reference.com/boxscores/200205310LAL.html'},
  {id:'g7',label:'第七戰・正規末段',date:'2002 / 06 / 02',detail:'平手局面，每一球都重要',quarter:4,clock:12,score:{LAL:100,SAC:100},possession:'SAC',handler:'SAC3',url:'https://www.basketball-reference.com/boxscores/200206020SAC.html'},
  {id:'ot',label:'第七戰・延長賽',date:'2002 / 06 / 02',detail:'重新開始的五分鐘',quarter:5,clock:300,score:{LAL:100,SAC:100},possession:'LAL',handler:'LAL0',url:'https://www.basketball-reference.com/boxscores/200206020SAC.html'},
];
export function momentState(id) {
  const m=MOMENTS.find(m=>m.id===id); if(!m) throw new Error('未知情境');
  const s=initialState();
  if(m.quarter) { Object.assign(s,{quarter:m.quarter,clock:m.clock,score:{...m.score},possession:m.possession,handler:m.handler,shotClock:Math.min(24,m.clock),elapsed:(m.quarter-1)*720+(720-m.clock)}); }
  s.moment=id;
  return s;
}

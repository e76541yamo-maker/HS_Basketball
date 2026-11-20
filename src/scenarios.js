import {DATA,replayState} from './engine.js';
const find=(quarter,clock,team)=>DATA.windows.findIndex(w=>w.state.quarter===quarter&&w.state.clock<=clock&&(!team||DATA.possessions[w.possessionIndex].team===team));
export const MOMENTS=[
 {id:'start',label:'聖誕開場',detail:'首節開始・完整球隊進攻',cursor:0},
 {id:'key0',label:'末節・追分起點',detail:'第四節最後五分鐘・每回合決策',cursor:find(4,300)},
 {id:'key1',label:'末節・關鍵暫停',detail:'第四節 4:34・勇士暫停窗口',cursor:find(4,274)},
 {id:'key2',label:'末節・進攻犯規',detail:'第四節 2:36・騎士暫停與換人',cursor:find(4,156)},
 {id:'key3',label:'末節・最後攻防',detail:'第四節 1:19・騎士落後六分的整波進攻',cursor:find(4,79,'CLE')},
 {id:'key4',label:'末節・罰球與追分',detail:'第四節 0:20・犯規罰球管理',cursor:find(4,20)}
];
export function momentState(id) {const m=MOMENTS.find(m=>m.id===id)||MOMENTS[0];return {...replayState(m.cursor),moment:m.id};}

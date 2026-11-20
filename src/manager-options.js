import {copy,play,player,other,bench,substitute,timeout,rngFrom,matchup} from './engine.js';

export const SETS={triangle:'三角進攻',motion:'流動進攻'};
export const DEFENSES={man:'人盯人',switch:'逢擋必換',double:'包夾歐尼爾',hack:'駭客戰術'};
export function decisionLayers(s) {
  if(s.phase!=='playing') return [];
  return [
    {id:'offense',label:'進攻體系',team:s.possession,options:Object.entries(SETS).map(([id,label])=>({id,label}))},
    {id:'defense',label:'防守方案',team:other(s.possession),options:Object.entries(DEFENSES).map(([id,label])=>({id,label}))},
  ];
}
export function manage(state,decision={}) {
  const s=copy(state);
  for(const layer of decisionLayers(s)) if(decision[layer.id]) {
    if(!layer.options.some(o=>o.id===decision[layer.id])) throw new Error('不合法的體系');
    s[layer.id==='offense'?'sets':'defense'][layer.team]=decision[layer.id];
  }
  return s;
}
export function execute(s,decision) {
  let n=manage(s,decision);
  if(decision.sub) n=substitute(n,...decision.sub);
  if(decision.timeout) n=timeout(n,decision.timeout);
  return play(n,decision.action);
}
const fact=(label,value,source='實際')=>({label,value:String(value),source});
export function analyze(s,decision={}) {
  const p=player(s.handler), d=player(matchup(s));
  const action=decision.action||'pullup';
  const three=action==='three', post=action==='post', pass=action.startsWith('pass:');
  const tactic=decision.defense==='hack'?'hack':decision.defense==='double'?'double':decision.offense==='motion'?'motion':three?'three':post?'post':pass?'pass':'normal';
  const texts={
    hack:['主動犯規，讓罰球決定這次進攻','可能送分並快速消耗犯規額度','若對手罰球穩定，立即回到人盯人。'],
    double:['包夾歐尼爾，降低低位命中機會','外圍傳導仍有出手機會；非歐尼爾持球時效果有限','若球轉移到外圍，改用換防。'],
    motion:['傳導後出手獲得流動進攻加成','傳球也承擔抄截與進攻時間消耗','若進攻時間不足，直接出手。'],
    three:['外線命中可快速縮小分差','未命中後可能失去球權','若持球者外線效率偏低，優先傳給射手。'],
    post:['低位利用籃板型長人的近框優勢','包夾與疲勞都會壓低命中率','若包夾形成，傳給空檔隊友。'],
    pass:['轉移球權，讓具名隊友開始下一回合','傳球不是免費操作，時鐘仍持續走動','若發生抄截，立即轉入防守。'],
    normal:['依持球者年度命中率尋找出手機會','年度平均並非這次對位的保證','若體力下降，可暫停或換上板凳。'],
  };
  const [pro,con,contingency]=texts[tactic];
  const facts=[fact('年度得分',p.pts_per_g),fact('投籃命中率',p.fg_pct),fact('三分命中率',p.fg3_pct??'無樣本'),fact('罰球命中率',p.ft_pct??'無樣本'),fact('剩餘進攻時間',s.shotClock),fact('體力',s.stamina[p.id].toFixed(1),'估計')];
  return {summary:`${p.name} 對位 ${d.name}`,pro:[pro],con:[con],attack:['對手可用換防或包夾改變出手條件'],contingency:[contingency],facts,points:[{sign:'+',text:pro,detail:'年度資料作為能力起點；戰術效果、體力與對位修正均為估計。',facts},{sign:'−',text:con,detail:'模型未校準到逐球追蹤；不應把模擬勝率當作史實。',facts:[fact('戰術命中修正上限','0.09','估計')]}]};
}
export function monteCarlo(state,decision={action:'pullup'},count=80,seed=2002) {
  if(!Number.isInteger(count)||count<1||count>1000) throw new Error('模擬次數超出範圍');
  const team=state.possession;
  const run=(first,i)=>{
    let s=copy(state); s.seed=(seed+i*7919)>>>0;
    const before=s.score[team];
    if(s.phase==='playing') s=execute(s,first);
    const points=s.score[team]-before;
    let guard=0;
    while(s.phase==='playing'&&guard++<4000) { const rng=rngFrom(s.seed+17); s=play(s,rng()<.28?'three':rng()<.45?'drive':'pullup'); }
    if(s.phase!=='final') throw new Error('模擬未結束');
    return {win:s.score[team]>s.score[other(team)]?1:0,points};
  };
  const result={};
  for(const [name,first] of Object.entries({selected:decision,baseline:{action:'pullup'}})) {
    let wins=0,points=0;
    for(let i=0;i<count;i++) { const r=run(first,i); wins+=r.win; points+=r.points; }
    result[name]={winProbability:wins/count,expectedPoints:points/count};
  }
  return {...result,count,seed,source:'估計',delta:result.selected.winProbability-result.baseline.winProbability};
}

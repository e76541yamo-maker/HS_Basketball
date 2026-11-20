import inputs from './model-data.json' with {type:'json'};

export const MODEL_DATA=inputs;
export const VALUE_MODELS={
 current:{label:'現行',note:'打法先驗加本場／年度效率收縮；非官方戰術成功率。'},
 fourFactors:{label:'四要素',note:'命中、失誤、進攻籃板、罰球映射效率；陣容是每分鐘資料的估計代理。'},
 impact:{label:'球員影響',note:'來源刊載 BPM 加總差與打法角色修正；不是重新擬合的 RAPM，也非因果效果。'}
};
export const WP_MODELS={
 logistic:{label:'現行勝率',note:'分差、時間、球權與加罰的邏輯近似；只做合理性校準。'},
 brownian:{label:'布朗運動',note:'分差常態尾機率；本場得分變異、節奏與估計尾端膨脹，未擬合歷史勝率。'}
};
export function valueModel(s){const id=s.valueModel??'current';if(!Object.hasOwn(VALUE_MODELS,id))throw new Error('未知估值模型');return id;}
export function wpModel(s){const id=s.wpModel??'logistic';if(!Object.hasOwn(WP_MODELS,id))throw new Error('未知勝率模型');return id;}
const clamp=(n,a,b)=>Math.max(a,Math.min(b,n)),other=t=>t==='CLE'?'GSW':'CLE';
const fields=['fg','fg3','fga','ft','fta','orb','drb','tov'];
const factorsCache=new Map(),impactCache=new Map();
const key=(s,t)=>t+':'+s.lineups[t].join(',')+':'+s.lineups[other(t)].join(',');
function cache(map,k,value){if(map.size>=256)map.clear();map.set(k,value);return value;}
export function factorsFromCounts(c,opponent) {
 const fga=Math.max(1,c.fga),efg=(c.fg+.5*c.fg3)/fga,tov=c.tov/Math.max(1,c.fga+.44*c.fta+c.tov);
 const orb=c.orb/Math.max(1,c.orb+opponent.drb),ftRate=c.ft/fga,ftaRate=c.fta/fga;
 const denominator=(1+.44*ftaRate)/Math.max(.1,1-tov)-orb*(1-c.fg/fga);
 return {efg,tov,orb,ftRate,ftaRate,ppp:(2*efg+ftRate)/Math.max(.5,denominator)};
}
export function teamFactors(team,period='season') {
 if(!inputs.teams[team]||!['game','season'].includes(period))throw new Error('無此四要素資料');
 const c=inputs.teams[team],opponent=period==='season'?c.seasonOpponent:inputs.teams[other(team)].game;
 return {...factorsFromCounts(c[period],opponent),source:'實際',pppSource:'估計',scope:period};
}
function lineupCounts(s,t) {
 const total=Object.fromEntries(fields.map(k=>[k,0]));
 for(const id of s.lineups[t]) {
  const p=inputs.players[id],season=p?.season,game=p?.game;
  for(const field of fields) {
   const rate=(row)=>row&&row.minutes>0?row[field]*36/row.minutes:null;
   const seasonRate=rate(season),gameRate=rate(game);
   const prior=seasonRate??gameRate??({fg:5,fg3:1,fga:11,ft:2,fta:2.6,orb:1.5,drb:4,tov:2}[field]);
   total[field]+=.75*prior+.25*(gameRate??prior);
  }
 }
 return total;
}
export function lineupFactors(s,t=s.possession) {
 const k=key(s,t);if(factorsCache.has(k))return factorsCache.get(k);
 return cache(factorsCache,k,{...factorsFromCounts(lineupCounts(s,t),lineupCounts(s,other(t))),source:'估計'});
}
const roleWeights={pnr:[2,.8,.3],roll:[.5,1,2.2],isolation:[1.5,1.5,.4],post:[.3,1.6,2],spotup:[1.5,.8,.3],motion:[1.2,1,.7],transition:[1.2,1.1,.7]};
export function lineupImpact(s,t=s.possession) {
 const k=key(s,t);if(impactCache.has(k))return impactCache.get(k);
 const players=s.lineups[t].map(id=>({id,...inputs.players[id]}));
 const own=players.reduce((n,p)=>n+(p.bpm??0),0),opponent=s.lineups[other(t)].reduce((n,id)=>n+(inputs.players[id]?.bpm??0),0);
 const fit=weights=>{
  let n=0,d=0;
  for(const p of players){const i=p.position?.includes('G')?0:p.position?.includes('C')?2:1,w=(p.usage??15)*weights[i];n+=(p.bpm??0)*w;d+=w;}
  return d?n/d:0;
 };
 const overall=fit([1,1,1]),roles=Object.fromEntries(Object.entries(roleWeights).map(([action,w])=>[action,fit(w)-overall]));
 return cache(impactCache,k,{own,opponent,net:own-opponent,roles,players,source:'估計'});
}
const weights={pnr:[.4,.25,.15,.2],roll:[.2,.1,.45,.25],isolation:[.45,.25,.05,.25],post:[.25,.15,.3,.3],spotup:[.75,.1,.05,.1],motion:[.6,.25,.05,.1],transition:[.35,.4,.15,.1]};
export function adjustDistribution(s,action,d) {
 const id=valueModel(s);if(id==='current'||action==='freeThrows')return d;
 const mean=d.points.reduce((n,p,i)=>n+p*i,0),base=mean*(1-d.turnover);
 let target=base,to=d.turnover,foul=d.foul,offensiveRebound=.24;
 if(id==='fourFactors') {
  const f=lineupFactors(s),deviations=[f.efg/.5-1,(.135-f.tov)/.135,f.orb/.25-1,f.ftRate/.20-1].map(x=>clamp(x,-1,1));
  const fit=weights[action].reduce((n,w,i)=>n+(w-[.4,.25,.2,.15][i])*deviations[i],1);
  target=base*clamp(f.ppp/1.05,.8,1.2)*clamp(fit,.85,1.15);
  to=clamp((to+f.tov)/2,.03,.3);foul=clamp(foul*f.ftRate/.20,.04,.35);offensiveRebound=clamp(f.orb,.1,.4);
 } else {
  const impact=lineupImpact(s);
  target=base+clamp(.005*impact.net+.025*impact.roles[action],-.22,.22);
 }
 const points=[...d.points],shift=clamp((target/(1-to)-mean)/2,-points[2],points[0]);
 points[0]-=shift;points[2]+=shift;
 return {...d,points,turnover:to,foul,offensiveRebound,adjustment:target/Math.max(.01,base),model:id};
}
export function normalCDF(x) {
 if(x===0)return .5;
 const z=Math.abs(x)/Math.SQRT2,t=1/(1+.3275911*z);
 const erf=1-(((((1.061405429*t-1.453152027)*t)+1.421413741)*t-.284496736)*t+.254829592)*t*Math.exp(-z*z);
 return clamp(.5*(1+Math.sign(x)*erf),0,1);
}
export function brownianProbability(advantage,seconds) {
 const pace=(inputs.gamePace+(inputs.teams.CLE.seasonPace+inputs.teams.GSW.seasonPace)/2)/2;
 const possessions=Math.max(.25,2*pace*Math.max(0,seconds)/2880);
 return normalCDF(advantage/Math.sqrt(2.25*inputs.gameScoringVariance*possessions));
}

import {DATA,TEAMS,copy,player,options,play,currentHold,currentEvent,realLabel,profile,matchup,defenderDistance,leverage,ZONES} from './engine.js';
import {analyze} from './manager-options.js';
import {MOMENTS,momentState} from './scenarios.js';
import {STORAGE_KEY,restore,addBranch} from './branch-tree.js';

const $=id=>document.getElementById(id),esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const teamName={CLE:'克里夫蘭騎士',GSW:'金州勇士'},clock=s=>`${Math.floor(s/60)}:${String(Math.floor(s%60)).padStart(2,'0')}`,pct=n=>(n*100).toFixed(1)+'%';
let saved;try {saved=restore(localStorage.getItem(STORAGE_KEY));}catch{}
let state=saved?.state||momentState('start'),previous=saved?.previous||null,branches=saved?.branches||[],action='replay',revision=0,worker,request=0,simulation=null;
const chips=facts=>facts.map(f=>`<span class="fact-chip ${f.source==='估計'?'est':''}"><b>${esc(f.source)}</b> ${esc(f.label)}：${esc(f.value)}</span>`).join('');
function persist() {try {localStorage.setItem(STORAGE_KEY,JSON.stringify({state,previous,branches}));$('save-status').textContent='已儲存在此瀏覽器';}catch {$('save-status').textContent='儲存空間不足・請勿關閉頁面';}}
function message(s) {$('notice').textContent=s;}
function transition(next,label) {previous=copy(state);if(state.mode==='replay'&&next.mode==='simulation')branches=addBranch(branches,state,'替代選擇前的實際節點');state=next;simulation=null;revision++;action=options(state)[0]?.id||'';persist();render();message(label);}
function score() {
 $('scoreboard').innerHTML=`<div class="score-team ${state.possession==='CLE'?'with-ball':''}"><small>CLE · 客場</small><b>騎士</b><strong>${state.score.CLE}</strong></div><div class="score-time"><span>${state.phase==='final'?'終場':`第 ${state.quarter} 節`}</span><b>${clock(state.clock)}</b><small>進攻 <em>${state.shotClock.toFixed(1)}</em></small></div><div class="score-team ${state.possession==='GSW'?'with-ball':''}"><small>GSW · 主場</small><b>勇士</b><strong>${state.score.GSW}</strong></div>`;
 const h=currentHold(state),e=currentEvent(state);
 $('situation').innerHTML=`<div class="section-title"><h2>${state.mode==='replay'?'實際比賽重播':'替代策略分支'}</h2><span class="live-dot">${state.phase==='final'?'比賽結束':`第 ${state.turn} 次持球決策`}</span></div><p class="scenario-note">2015 年 12 月 25 日 · CLE @ GSW · 節點 ${state.cursor+1} / ${DATA.timeline.length}</p>`;
 $('court').innerHTML=`<div class="court-caption"><span>${state.positionsActual?'實際・持球起點的十人座標':state.mode==='replay'?'實際・前一持球快照，非事件當下':'估計・分支示意座標'}</span><span>球場 94 × 50 英尺</span></div><div class="court-surface"><svg viewBox="0 0 940 500" preserveAspectRatio="none" aria-hidden="true"><path d="M470 0V500M0 170H190V330H0M940 170H750V330H940"/><rect x="3" y="3" width="934" height="494"/><circle cx="470" cy="250" r="60"/><circle cx="190" cy="250" r="60"/><circle cx="750" cy="250" r="60"/><circle cx="52" cy="250" r="8"/><circle cx="888" cy="250" r="8"/><path d="M0 30H140Q430 250 140 470H0M940 30H800Q510 250 800 470H940"/></svg>${state.positions.map(([id,x,y])=>`<button class="court-player ${id===state.handler?'ball-handler':''} ${player(id).team.toLowerCase()}" data-player="${id}" style="left:${4+x/94*92}%;top:${8+y/50*84}%" aria-label="${esc(player(id).name)}"><span>${esc(player(id).jersey)}</span><small>${esc(player(id).name.split(' ').at(-1))}</small></button>`).join('')}</div><div class="court-footer"><span class="ball-key">● 持球者 · ${esc(player(state.handler).name)}</span><span>${state.possession} 攻向${state.basketX<47?'左':'右'}籃框</span></div>`;
 const defender=matchup(state);
 $('matchup').innerHTML=`<button class="matchup-card" data-player="${state.handler}"><small>持球 · ${ZONES[state.zone]}</small><b>${esc(player(state.handler).name)}</b><span>${h?`本段 ${h.duration.toFixed(2)} 秒・${esc(realLabel(state))}`:esc(realLabel(state))}</span></button><span class="versus">對位</span><button class="matchup-card" data-player="${defender}"><small>最近防守者</small><b>${esc(player(defender).name)}</b><span>${defenderDistance(state).toFixed(2)} 英尺 · ${state.positionsActual?'實際':'快照／估計'}</span></button>`;
 $('layers').innerHTML=`<div class="observed"><span class="tag ${state.mode==='simulation'?'est':''}">${state.mode==='replay'?'實際紀錄':'分支起點'}</span> ${esc(realLabel(state))}<p class="muted">${e?'逐球事件獨立呈現，確保罰球、籃板與比分不遺漏。':'依實際選擇繼續會保留史實；其他動作立即分岔，不會再套用未來史實。'}</p></div><div class="leverage"><b>${leverage(state).toFixed(2)}×</b><span>槓桿指數 <i>估計</i></span><small>增加三分的勝率擺幅／全場平均</small></div>`;
}
function argumentsView() {
 if(state.phase==='final') {$('analysis').innerHTML='<p>已到終場。選擇左側時刻，或返回已儲存分支。</p>';$('source').textContent='規則引擎';return;}
 const a=analyze(state,{action});$('source').textContent='規則引擎';
 $('analysis').innerHTML=`<p class="analysis-context">${esc(a.summary)}</p><div class="argument-grid">${a.points.map(p=>`<details class="argument"><summary><span class="sign ${p.sign==='−'?'negative':''}">${p.sign}</span>${esc(p.text)}</summary><p>${esc(p.detail)}</p>${chips(p.facts)}</details>`).join('')}</div><p class="contingency"><b>對手回應</b>${esc(a.attack[0])}</p><p class="contingency"><b>風險補救</b>${esc(a.contingency[0])}</p><button id="rewrite" class="rewrite">Claude 潤飾論點（可選）</button><div id="ai-points"></div>`;
 $('rewrite').onclick=async()=>{
  const rev=revision,chosen=action,button=$('rewrite');button.disabled=true;button.textContent='正在潤飾…';
  try {const response=await fetch('/api/analyze',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({facts:{player:player(state.handler).name,score:state.score,facts:a.facts},points:{pro:a.pro,con:a.con,attack:a.attack,contingency:a.contingency}})});const r=await response.json();if(rev!==revision||chosen!==action)return;$('source').textContent=r.source||'規則引擎';$('ai-points').innerHTML=r.source==='Claude'?Object.entries(r.points).map(([k,ps])=>`<p class="contingency"><b>${({pro:'支持',con:'代價',attack:'對手',contingency:'補救'})[k]}</b>${ps.map(esc).join('；')}</p>`).join(''):'<p class="muted">未啟用或驗證未通過，保留上方規則論點。</p>';}
  catch {if(rev===revision)message('分析連線失敗，保留規則引擎。');}finally {button.disabled=false;button.textContent='Claude 潤飾論點（可選）';}
 };
}
function render() {
 score();const opts=options(state);if(!opts.some(o=>o.id===action))action=opts[0]?.id||'';
 $('scenarios').innerHTML=MOMENTS.map(m=>`<button class="scenario-card ${state.moment===m.id?'active':''}" data-moment="${m.id}"><small>2015 · CLE @ GSW</small><strong>${esc(m.label)}</strong><span>${esc(m.detail)}</span></button>`).join('');
 $('branches').innerHTML=branches.length?branches.map((b,i)=>`<button class="branch-card" data-branch="${i}">${esc(b.name)}<small> · ${b.state.mode==='replay'?'實際':'估計'}</small></button>`).join(''):'<p class="muted">替代動作會自動保留實際起點</p>';
 $('actions').innerHTML=opts.map(o=>`<button class="action ${o.id===action?'selected':''}" data-action="${o.id}">${esc(o.label)}</button>`).join('');
 $('execute').disabled=!opts.length;$('simulate').disabled=!opts.length||state.mode==='replay'&&state.recordKind==='event';$('undo').disabled=!previous;
 $('resources').innerHTML=['CLE','GSW'].map(t=>`<section class="resource-section"><div class="team-heading"><span class="team-symbol ${t.toLowerCase()}">${t}</span><div><h3>${teamName[t]}</h3><small>本場追蹤與逐球分布</small></div></div>${TEAMS[t].map(p=>{const d=DATA.distributions[p.id];return `<button class="roster-row ${state.lineups[t].includes(p.id)?'on-floor':''}" data-player="${p.id}"><span class="jersey">${esc(p.jersey)}</span><span><b>${esc(p.name)}</b><small>${d.holds} 持球 · ${d.fg}/${d.fga} 命中／出手</small></span><i>${state.lineups[t].includes(p.id)?'場上':'場下'}</i></button>`;}).join('')}</section>`).join('');
 $('log').innerHTML=`<li>${esc(state.last.kind)} · CLE ${state.score.CLE}：GSW ${state.score.GSW}</li>`;
 $('simulation').innerHTML='';argumentsView();
}
document.addEventListener('click',e=>{
 const b=e.target.closest('button');if(!b)return;
 if(b.dataset.action){action=b.dataset.action;simulation=null;render();}
 if(b.dataset.moment)transition(momentState(b.dataset.moment),'已載入實際時刻。');
 if(b.dataset.branch!==undefined)transition(copy(branches[Number(b.dataset.branch)].state),'已返回分支。');
 if(b.dataset.player) {
  const id=b.dataset.player,p=player(id),d=DATA.distributions[id],stats=profile(state,id);
  $('player-detail').innerHTML=`<p class="eyebrow">${p.team} · ${esc(p.position)} · ${esc(p.jersey)}</p><h2>${esc(p.name)}</h2><p class="muted">單場資料，不代表長期能力。</p>${chips([{source:'實際',label:'持球段',value:d.holds},{source:'實際',label:'命中／出手',value:`${d.fg} / ${d.fga}`},{source:'實際',label:'得分／失誤',value:`${d.points} / ${d.turnovers}`},{source:'實際',label:'平均持球秒',value:d.durations.length?stats.meanHold.toFixed(2):'無樣本'},{source:'估計',label:'目前區域距離格收縮命中率',value:pct(stats.fg)}])}<h3>實際・傳球目標分布</h3>${Object.entries(d.targets).sort((a,b)=>b[1]-a[1]).map(([id,n])=>`<p>${esc(player(id).name)} <b>${n}</b> 次 · ${pct(n/Math.max(1,Object.values(d.targets).reduce((a,b)=>a+b,0)))}</p>`).join('')||'<p>沒有觀測到傳球</p>'}<h3>實際・持球秒數分布</h3><p>${[['短於一秒',d.durations.filter(n=>n<1).length],['一至三秒',d.durations.filter(n=>n>=1&&n<3).length],['三秒以上',d.durations.filter(n=>n>=3).length]].map(([k,n])=>`${k}：${n}`).join('／')}</p><p class="muted">空白區域以球隊命中率平滑；場下球員沒有目前防守距離，使用六英尺估計。</p>`;$('player-dialog').showModal();
 }
 if(b.dataset.remedy&&simulation) {
  const [i,j]=b.dataset.remedy.split(':').map(Number),r=simulation.riskBranches[i].remedies[j];branches=addBranch(branches,state,'風險前的決策');transition(copy(r.state),'已建立風險後的補救分支：'+r.label+'（估計・持續防守方針）。');
 }
});
$('close-player').onclick=()=>$('player-dialog').close();
$('execute').onclick=()=>{try {transition(play(state,action),action==='replay'?'已依實際紀錄前進。':'已建立分布模擬分支；未來不再套用史實。');}catch(e){message(e.message);}};
$('undo').onclick=()=>{if(previous){const n=previous;previous=copy(state);state=n;simulation=null;revision++;persist();render();message('已復原；再次按下可返回。');}};
$('branch').onclick=()=>{branches=addBranch(branches,state);persist();render();message('已儲存分支。');};
$('simulate').onclick=()=>{
 if(!worker){worker=new Worker('/src/simulation-worker.js',{type:'module'});worker.onerror=()=>{message('背景模擬失敗，請重新整理。');$('simulate').disabled=false;};}
 const id=++request,rev=revision,chosen=action;$('simulate').disabled=true;message('以相同種子對照實際動作模型，並排序風險後補救…');
 worker.onmessage=({data})=>{if(data.id!==id||rev!==revision||chosen!==action)return;$('simulate').disabled=false;if(data.error){message(data.error);return;}simulation=data.result;const m=simulation;
 $('simulation').innerHTML=`<div class="simulation-result"><h3>估計・配對蒙地卡羅 ${m.count} 次</h3><p>本次勝率 <b>${pct(m.selected.winProbability)}</b> ／實際動作模型 <b>${pct(m.baseline.winProbability)}</b></p><p>差異 ${(m.delta*100).toFixed(1)} 個百分點 · 本次持球期望得分 ${m.selected.expectedPoints.toFixed(2)}</p><small>比較視角：${teamName[state.possession]}。基準：${esc(m.baselineLabel)}，不是已發生的得失分。少量樣本的排名會波動。</small><div class="outcome-grid">${Object.entries(m.selected.outcomes).map(([k,n])=>`<span>${({score:'得分',empty:'未得分',turnover:'失誤／違例'})[k]}<b>${n} / ${m.count}</b></span>`).join('')}</div><h3>替代動作排序 <i>估計</i></h3>${m.remedies.map(r=>`<p>${esc(r.label)} · ${pct(r.winProbability)}（${r.count} 次）</p>`).join('')}${m.riskBranches.map((risk,i)=>`<details class="risk" open><summary>風險：${risk.kind==='turnover'?'失誤／違例':'未得分'} · ${risk.count}/${m.count}</summary><p class="muted">以第一個出現此結果的種子狀態續推，不是此類風險的條件平均。防守補救係數為估計。</p>${risk.remedies.map((r,j)=>`<button data-remedy="${i}:${j}">${j+1}. ${esc(r.label)} · ${pct(r.winProbability)}（${r.count} 次）↗</button>`).join('')}</details>`).join('')}</div>`;message('比較完成。補救按鈕可建立風險後的實際模擬分支。');};
 worker.postMessage({id,state,decision:{action},count:48,seed:20151225});
};
render();

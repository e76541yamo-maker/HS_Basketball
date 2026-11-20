import {TEAMS,copy,player,other,options,substitute,timeout,matchup,bench} from './engine.js';
import {analyze,execute,decisionLayers,SETS,DEFENSES} from './manager-options.js';
import {MOMENTS,momentState} from './scenarios.js';
import {restore,addBranch,STORAGE_KEY} from './branch-tree.js';

const $=s=>document.querySelector(s);
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const names={LAL:'洛杉磯湖人',SAC:'沙加緬度國王'};
const short={LAL:'湖人',SAC:'國王'};
const pct=x=>x==null?'無樣本':(x*100).toFixed(1)+'%';
const clock=x=>`${Math.floor(x/60)}:${Math.floor(x%60).toString().padStart(2,'0')}${x%1?'.'+Math.round(x%1*10):''}`;
let state=momentState('start'),branches=[],previous=null,selected='pullup',simulation=null,worker=null,request=0,aiRequest=0;
try { const saved=restore(localStorage.getItem(STORAGE_KEY)); if(saved) ({state,branches,previous}=saved); } catch {}
let decision={};
function save() { try { localStorage.setItem(STORAGE_KEY,JSON.stringify({state,branches,previous})); $('#save-status').textContent='本機已儲存'; } catch { $('#save-status').textContent='儲存空間不足'; } }
function resetSelection() { selected='pullup'; decision={}; simulation=null; request++; }
function update(next) { previous=copy(state); state=next; resetSelection(); save(); render(); }
function facts(rows) { return `<div class="fact-chips">${rows.map(f=>`<span class="fact-chip ${f.source==='估計'?'est':''}"><b>${f.source}</b> ${esc(f.label)} ${esc(f.value)}</span>`).join('')}</div>`; }
function analysis() {
  const a=analyze(state,{...decision,action:selected});
  $('#source').textContent='規則引擎';
  $('#analysis').innerHTML=`<p class="analysis-context">${esc(a.summary)}</p><div class="argument-grid">${a.points.map(p=>`<details class="argument"><summary><span class="sign ${p.sign==='−'?'negative':''}">${p.sign}</span>${esc(p.text)}</summary><p>${esc(p.detail)}</p><details><summary>查看引用資料</summary>${facts(p.facts)}</details></details>`).join('')}</div><p class="contingency"><b>備案</b> ${esc(a.contingency[0])}</p>`;
  const id=++aiRequest;
  fetch('/api/analyze',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({facts:{quarter:state.quarter,clock:state.clock,shotClock:state.shotClock,score:state.score,action:selected,stats:a.facts},points:{pro:a.pro,con:a.con,attack:a.attack,contingency:a.contingency}})})
    .then(r=>r.json()).then(data=>{ if(id!==aiRequest||data.source!=='Claude') return; $('#source').textContent='Claude'; const p=document.createElement('p'); p.className='ai-rewrite'; p.textContent=data.points.pro[0]+'；'+data.points.con[0]; $('#analysis').append(p); }).catch(()=>{});
}
function render() {
  const s=state, p=player(s.handler), d=player(matchup(s)), m=MOMENTS.find(m=>m.id===s.moment)||MOMENTS[0], final=s.phase==='final';
  $('#scenarios').innerHTML=MOMENTS.map(m=>`<button data-moment="${m.id}" class="scenario-card ${m.id===s.moment?'active':''}"><small>${m.date}</small><strong>${m.label}</strong><span>${m.detail}</span></button>`).join('');
  $('#branches').innerHTML=branches.length?branches.map((b,i)=>`<button class="branch-card" data-load="${i}">${esc(b.name)}</button>`).join(''):'<p class="muted">在此保留另一種可能。</p>';
  $('#situation').innerHTML=`<div class="section-title"><div><p class="eyebrow">${final?'比賽結束':'目前局面'} / 第 ${s.turn} 回合</p><h2>${m.label}</h2></div><span class="live-dot">${final?'終場':'決策中'}</span></div>${m.url?`<p class="scenario-note"><a href="${m.url}" target="_blank" rel="noopener">史實比分來源 ↗</a> · 秒數、持球與資源為估計重建</p>`:''}`;
  $('#scoreboard').innerHTML=`<div class="score-team ${s.possession==='LAL'?'with-ball':''}"><small>洛杉磯</small><b>湖人</b><strong>${s.score.LAL}</strong></div><div class="score-time"><span>${final?'終場':s.quarter>4?'延長 '+(s.quarter-4):'第 '+s.quarter+' 節'}</span><b>${clock(s.clock)}</b><small>進攻 <em>${Math.ceil(s.shotClock)}</em></small></div><div class="score-team ${s.possession==='SAC'?'with-ball':''}"><small>沙加緬度</small><b>國王</b><strong>${s.score.SAC}</strong></div>`;
  const spots=[[50,67],[24,53],[76,53],[28,23],[70,24]], h=s.lineups[s.possession].indexOf(s.handler);
  $('#court').innerHTML=`<div class="court-caption"><span>${short[s.possession]}持球 · ${s.zone}</span><span>${SETS[s.sets[s.possession]]} / ${DEFENSES[s.defense[other(s.possession)]]}</span></div><div class="court-surface"><svg viewBox="0 0 600 340" aria-hidden="true"><rect x="20" y="15" width="560" height="310" rx="2"/><path d="M20 325H580M215 15V160H385V15M215 160A85 85 0 0 0 385 160M50 15V72A250 250 0 0 0 550 72V15M270 40H330"/><circle cx="300" cy="55" r="13"/><path d="M250 325A50 50 0 0 1 350 325"/></svg>${s.lineups[s.possession].map((id,i)=>`<button class="court-player ${i===h?'ball-handler':''}" data-player="${id}" style="left:${spots[i][0]}%;top:${spots[i][1]}%" aria-label="${esc(player(id).name)}${i===h?' 持球':''}"><span>${i===h?'球':i+1}</span><small>${esc(player(id).name.split(' ').at(-1))}</small></button>`).join('')}<span class="court-watermark">西區決賽・2002</span></div><div class="court-footer"><span class="ball-key">● 持球者</span><span>場區示意，非追蹤座標</span></div>`;
  $('#matchup').innerHTML=`<button class="matchup-card" data-player="${p.id}"><small>持球者 / ${short[s.possession]}</small><b>${esc(p.name)}</b><span>得分 ${p.pts_per_g} · 投籃 ${pct(p.fg_pct)} <i>實際</i></span></button><span class="versus">對位</span><button class="matchup-card" data-player="${d.id}"><small>防守者 / ${short[other(s.possession)]}</small><b>${esc(d.name)}</b><span>抄截 ${d.stl_per_g} · 阻攻 ${d.blk_per_g} <i>實際</i></span></button>`;
  $('#actions').innerHTML=options(s).map(o=>`<button data-action="${o.id}" class="action ${o.id===selected?'selected':''}" aria-pressed="${o.id===selected}">${esc(o.label)}</button>`).join('');
  $('#layers').innerHTML=decisionLayers(s).map(layer=>`<label>${layer.label} · ${short[layer.team]}<select data-layer="${layer.id}">${layer.options.map(o=>`<option value="${o.id}" ${(decision[layer.id]||s[layer.id==='offense'?'sets':'defense'][layer.team])===o.id?'selected':''}>${o.label}</option>`).join('')}</select></label>`).join('');
  $('#execute').disabled=final; $('#simulate').disabled=final; $('#undo').disabled=!previous;
  $('#notice').textContent=s.last?.kind==='start'?'選擇持球動作，再執行決策。':`本次結果：${s.last?.kind} · 得 ${s.last?.points||0} 分 · 經過 ${s.last?.seconds||0} 秒`;
  $('#simulation').innerHTML=simulation?`<div class="simulation-result"><b>模擬比較 <span class="tag est">估計</span></b><p>${simulation.count} 次完整比賽・相同種子</p><div><span>所選策略<br><strong>${pct(simulation.selected.winProbability)}</strong> 勝率<br>${simulation.selected.expectedPoints.toFixed(2)} 預期得分</span><span>基準急停<br><strong>${pct(simulation.baseline.winProbability)}</strong> 勝率<br>${simulation.baseline.expectedPoints.toFixed(2)} 預期得分</span></div><small>預期得分只計本次持球；勝率推演到終場。樣本誤差與模型偏差仍存在。</small></div>`:'';
  $('#resources').innerHTML=['LAL','SAC'].map(t=>`<section class="resource-section"><div class="team-heading"><span class="team-symbol ${t.toLowerCase()}">${short[t][0]}</span><div><h3>${names[t]}</h3><small>團隊犯規 ${s.teamFouls[t]} · 暫停 ${s.timeouts[t]}</small></div><button data-timeout="${t}" ${!s.timeouts[t]||final?'disabled':''}>暫停</button></div><p class="roster-label">場上陣容 <span>體力為估計</span></p>${s.lineups[t].map(id=>rosterRow(id,s)).join('')}<details class="bench"><summary>板凳球員 · ${bench(s,t).length} 人可用</summary>${TEAMS[t].filter(p=>!s.lineups[t].includes(p.id)).map(p=>rosterRow(p.id,s)).join('')}</details></section>`).join('');
  $('#log').innerHTML=[...s.log].reverse().map(e=>`<li>第 ${e.turn} 回合 · ${esc(e.kind)} · ${e.points} 分</li>`).join('');
  analysis();
}
function rosterRow(id,s) { const p=player(id),st=s.stamina[id]; return `<button class="roster-row" data-player="${id}"><span class="player-initial">${esc(p.name.split(' ').at(-1)[0])}</span><span><b>${esc(p.name)}</b><small>${p.pts_per_g} 分 · ${p.trb_per_g} 籃板 · 犯規 ${s.fouls[id]||0}</small><span class="stamina-track"><span style="width:${st}%"></span></span></span><em>${Math.round(st)}</em></button>`; }
function openPlayer(id) {
  const p=player(id),t=id.startsWith('LAL')?'LAL':'SAC',on=state.lineups[t].includes(id),s=state;
  $('#player-detail').innerHTML=`<p class="eyebrow">${names[t]} · ${on?'場上':'板凳'}</p><h2>${esc(p.name)}</h2><p class="muted">2001–02 例行賽・每場平均</p><div class="player-stats">${[['得分',p.pts_per_g],['籃板',p.trb_per_g],['助攻',p.ast_per_g],['抄截',p.stl_per_g],['阻攻',p.blk_per_g],['失誤',p.tov_per_g],['投籃',pct(p.fg_pct)],['三分',pct(p.fg3_pct)],['罰球',pct(p.ft_pct)]].map(([k,v])=>`<div><small>${k} <i>實際</i></small><strong>${v??'無樣本'}</strong></div>`).join('')}</div><p>體力 <b>${Math.round(s.stamina[id])}</b> <span class="tag est">估計</span> · 個人犯規 ${s.fouls[id]||0} <span class="tag">目前狀態</span></p>${p.wcf?`<p class="wcf-stats">2002 西區決賽 <i>實際</i><br>出賽 ${p.wcf.g} · 得分 ${p.wcf.pts_per_g} · 籃板 ${p.wcf.trb_per_g} · 助攻 ${p.wcf.ast_per_g}</p>`:''}<p><a href="${p.url}" target="_blank" rel="noopener">Basketball Reference 年度資料 ↗</a></p>${!on&&(s.fouls[id]||0)<6&&s.phase==='playing'?`<label>替換場上球員<select id="sub-out">${s.lineups[t].map(q=>`<option value="${q}">${esc(player(q).name)}</option>`).join('')}</select></label><button id="sub-in" class="primary" data-team="${t}" data-in="${id}">執行換人</button>`:''}${p.name.includes('Stojak')?'<p class="scenario-note">西區決賽僅出賽三場；傷勢期間是否可用不做逐日限制。歷史根節點使用重建陣容。</p>':''}`;
  $('#player-dialog').showModal();
}
document.addEventListener('click',e=>{
  const b=e.target.closest('button'); if(!b) return;
  try {
    if(b.dataset.moment) update(momentState(b.dataset.moment));
    else if(b.dataset.load!==undefined) update(copy(branches[+b.dataset.load].state));
    else if(b.dataset.action) { selected=b.dataset.action; simulation=null; request++; render(); }
    else if(b.dataset.player) openPlayer(b.dataset.player);
    else if(b.dataset.timeout) update(timeout(state,b.dataset.timeout));
    else if(b.id==='execute') update(execute(state,{...decision,action:selected}));
    else if(b.id==='undo'&&previous) { const old=state; state=previous; previous=old; resetSelection(); save(); render(); }
    else if(b.id==='branch') { branches=addBranch(branches,state); save(); render(); }
    else if(b.id==='sub-in') { $('#player-dialog').close(); update(substitute(state,b.dataset.team,$('#sub-out').value,b.dataset.in)); }
    else if(b.id==='close-player') $('#player-dialog').close();
    else if(b.id==='simulate') {
      if(!worker) { worker=new Worker('/src/simulation-worker.js',{type:'module'}); worker.onmessage=({data})=>{ if(data.id!==request) return; if(data.error) $('#notice').textContent=data.error; else { simulation=data.result; render(); } $('#simulate').disabled=state.phase==='final'; }; worker.onerror=()=>{ $('#notice').textContent='模擬無法完成，請重新載入。'; $('#simulate').disabled=false; }; }
      $('#simulate').disabled=true; $('#notice').textContent='背景推演中，仍可繼續決策。'; worker.postMessage({id:++request,state,decision:{...decision,action:selected},count:80,seed:2002});
    }
  } catch { $('#notice').textContent='此操作目前無法執行。'; }
});
document.addEventListener('change',e=>{ if(e.target.dataset.layer) { decision[e.target.dataset.layer]=e.target.value; simulation=null; request++; analysis(); } });
$('#player-dialog').addEventListener('click',e=>{ if(e.target===$('#player-dialog')) $('#player-dialog').close(); });
render();

import {DATA,TEAMS,copy,player,options,play,manage,currentPossession,realChoice,realLabel,distribution,winProbability,bonus,leverage,PLAY_TYPES,CLOCK_CALLS,DEFENSES,freeThrowsRemaining,replayState,policy} from './engine.js';
import {analyze} from './manager-options.js';
import {MOMENTS,momentState} from './scenarios.js';
import {STORAGE_KEY,restore,addBranch} from './branch-tree.js';
import {VALUE_MODELS,WP_MODELS,MODEL_DATA,valueModel,wpModel} from './evaluation-models.js';
import {comparisonTable} from './comparison-table.js';
import {SEGMENTS,clutch,modeState,coachSettings,segmentState,activeSegment,historicalSegment,runSegment,segmentComparison,segmentAnalysis,validateCoach} from './segments.js';
import {coachForm,segmentResult} from './segment-view.js';

const $=id=>document.getElementById(id),esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const teamName={CLE:'克里夫蘭騎士',GSW:'金州勇士'},clock=s=>Math.floor(s/60)+':'+String(Math.floor(s%60)).padStart(2,'0'),pct=n=>(n*100).toFixed(1)+'%';
let saved;try{saved=restore(localStorage.getItem(STORAGE_KEY));}catch{}
let state=modeState(saved?.state||momentState('start'),saved?.state?.playMode||'segment'),previous=saved?.previous||null,branches=saved?.branches||[];
let segmentAction=state.coach.execute||(state.mode==='replay'?'replay':'run');
const segmentMode=()=>state.playMode==='segment',coachPhase=()=>segmentMode()&&!clutch(state);
let segmentCache;
let action=options(state)[0]?.id||'',clockCall=state.plans[state.possession].clock,defense=state.plans[state.possession==='CLE'?'GSW':'CLE'].defense,revision=0,worker,request=0,simulation=null,replayStep=0;
const chips=facts=>facts.map(f=>'<span class="fact-chip '+(f.source==='估計'?'est':'')+'"><b>'+esc(f.source)+'</b> '+esc(f.label)+'：'+esc(f.value)+'</span>').join('');
const selectOptions=(map,selected)=>Object.entries(map).map(([id,label])=>'<option value="'+id+'" '+(id===selected?'selected':'')+'>'+esc(label)+'</option>').join('');
const decision=()=>{
 const d={action,clock:clockCall,defense};
 if(segmentMode()&&clutch(state)&&action!=='replay')return state.possession===state.coach.team?{...d,defense:state.plans[state.possession==='CLE'?'GSW':'CLE'].defense}:{...policy(state),defense};
 return d;
};
function persist(){try{localStorage.setItem(STORAGE_KEY,JSON.stringify({state,previous,branches}));$('save-status').textContent='已儲存在此瀏覽器';}catch{$('save-status').textContent='儲存空間不足・請勿關閉頁面';}}
function message(s){$('notice').textContent=s;}
function transition(next,label){
 next={...next,playMode:next.playMode||state.playMode,coach:next.coach||state.coach};
 previous=copy(state);if(state.mode==='replay'&&next.mode==='simulation')branches=addBranch(branches,state,'替代策略前的實際回合');
 state=next;simulation=null;revision++;replayStep=0;action=options(state)[0]?.id||'';clockCall=state.plans[state.possession].clock;defense=state.plans[state.possession==='CLE'?'GSW':'CLE'].defense;
 segmentAction=state.coach.execute||(state.mode==='replay'?'replay':'run');segmentCache=null;
 persist();render();message(label);
}
function trackingView(){
 const p=currentPossession(state),ids=p.holds;
 if(state.mode!=='replay'){$('court').innerHTML='<details class="tracking-view"><summary>SportVU 實際回合重播</summary><p>分支不播放虛構追蹤。返回實際路線才可查看原始傳球與座標。</p></details>';return;}
 const h=DATA.holds[ids[replayStep]],content=h?'<p class="muted">實際・此回合追蹤第 '+(replayStep+1)+' / '+ids.length+' 段；這不是決策回合。<br>'+esc(player(h.player).name)+' ・'+clock(h.clock)+' ・'+(h.endKind==='pass'?'傳給 '+esc(player(h.target).name):esc(h.endKind==='made'?'進球':h.endKind==='miss'?'未進':'追蹤片段結束'))+'</p><div class="court-surface"><svg viewBox="0 0 940 500" preserveAspectRatio="none" aria-hidden="true"><path d="M470 0V500M0 170H190V330H0M940 170H750V330H940"/><rect x="3" y="3" width="934" height="494"/><circle cx="470" cy="250" r="60"/><circle cx="190" cy="250" r="60"/><circle cx="750" cy="250" r="60"/></svg>'+h.positions.map(([id,x,y])=>'<button class="court-player '+(String(id)===h.player?'ball-handler ':'')+player(id).team.toLowerCase()+'" data-player="'+id+'" style="left:'+(4+x/94*92)+'%;top:'+(8+y/50*84)+'%" aria-label="'+esc(player(id).name)+'"><span>'+esc(player(id).jersey)+'</span><small>'+esc(player(id).name.split(' ').at(-1))+'</small></button>').join('')+'</div><div class="tracking-controls"><button id="track-prev" '+(!replayStep?'disabled':'')+'>上一段座標</button><button id="track-next" '+(replayStep>=ids.length-1?'disabled':'')+'>下一段傳球／座標</button></div>':'<p>這個回合沒有匹配到追蹤持球片段。逐球比分仍完整保留。</p>';
 const wasOpen=$('court').querySelector('details')?.open;
 $('court').innerHTML='<details class="tracking-view" '+(wasOpen?'open':'')+'><summary>SportVU 實際回合重播・僅供觀看</summary>'+content+'</details>';
 if(h){$('track-prev').onclick=()=>{replayStep--;trackingView();};$('track-next').onclick=()=>{replayStep++;trackingView();};}
}
function score(){
 $('situation').innerHTML='<div class="section-title"><h2>'+(state.mode==='replay'?'實際回合路線':'替代策略分支')+'</h2><span class="live-dot">'+(state.phase==='final'?'比賽結束':'第 '+(state.turn+1)+' 回合')+'</span></div><p class="scenario-note">'+esc(state.decisionReasons.join('／')||'末節每回合')+' · 實際全場 '+DATA.possessions.length+' 回合</p>';
 $('scoreboard').innerHTML='<div class="score-team '+(state.possession==='CLE'?'with-ball':'')+'"><small>CLE · 客場</small><b>騎士</b><strong>'+state.score.CLE+'</strong></div><div class="score-time"><span>'+(state.phase==='final'?'終場':'第 '+state.quarter+' 節')+'</span><b>'+clock(state.clock)+'</b><small>進攻 '+state.shotClock.toFixed(1)+' 秒 <i>估計</i></small></div><div class="score-team '+(state.possession==='GSW'?'with-ball':'')+'"><small>GSW · 主場</small><b>勇士</b><strong>'+state.score.GSW+'</strong></div>';
 $('matchup').innerHTML='<div class="possession-summary"><b>'+state.possession+' 球權</b><span>勝率 '+pct(winProbability(state,state.possession))+' <i>估計</i></span><span>槓桿 '+leverage(state).toFixed(2)+'× <i>估計</i></span></div>';
 $('team-state').innerHTML=['CLE','GSW'].map(t=>'<section><h3>'+t+' · 全隊犯規 '+state.teamFouls[t]+' · '+(bonus(state,t)?'進攻加罰':'未進入加罰')+'</h3><p>剩餘暫停配額 '+state.timeouts[t]+' <i>估計</i></p><div class="lineup">'+state.lineups[t].map(id=>'<button data-player="'+id+'" class="'+(state.personalFouls[id]>=4?'foul-trouble':'')+'">'+esc(player(id).name)+'<small>個人犯規 '+state.personalFouls[id]+(state.personalFouls[id]>=4?'・犯規麻煩':'')+'</small></button>').join('')+'</div></section>').join('');
 trackingView();
}
function argumentsView(){
 if(state.phase==='final'){$('analysis').innerHTML='<p>已到終場。選擇左側時刻，或返回已儲存分支。</p>';return;}
 if(coachPhase()){try{validateCoach(state,state.coach);}catch(e){$('analysis').textContent=e.message;return;}}
 const a=coachPhase()?(segmentCache.analysis??=segmentAnalysis(state)):analyze(state,decision());$('source').textContent='規則引擎';
 $('analysis').innerHTML='<p class="analysis-context">'+esc(a.summary)+'</p><div class="argument-grid">'+a.points.map(p=>'<details class="argument" open><summary><span class="sign '+(p.sign==='−'?'negative':'')+'">'+p.sign+'</span>'+esc(p.text)+'</summary><p>'+esc(p.detail)+'</p>'+chips(p.facts)+'</details>').join('')+'</div><p class="contingency"><b>對手回應</b>'+esc(a.attack[0])+'</p><p class="contingency"><b>風險補救</b>'+esc(a.contingency[0])+'</p><button id="rewrite" class="rewrite">Claude 潤飾論點（可選）</button><div id="ai-points"></div>';
 $('rewrite').onclick=async()=>{
  const rev=revision,button=$('rewrite');button.disabled=true;
  const comparison=a.comparisonFacts.map(row=>({...row,models:row.models.filter(m=>m.selected)}));
  try{const response=await fetch('/api/analyze',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({facts:{score:state.score,facts:a.facts,comparison},points:{pro:a.pro,con:a.con,attack:a.attack,contingency:a.contingency}})}),r=await response.json();
   if(rev!==revision)return;$('source').textContent=r.source||'規則引擎';$('ai-points').innerHTML=r.source==='Claude'?Object.entries(r.points).map(([k,ps])=>'<p class="contingency"><b>'+({pro:'支持',con:'代價',attack:'對手',contingency:'補救'})[k]+'</b>'+ps.map(esc).join('；')+'</p>').join(''):'<p class="muted">未啟用或驗證未通過，保留規則論點。</p>';
  }catch{message('分析連線失敗，保留規則引擎。');}finally{button.disabled=false;}
 };
}
function modelControls(){
 $('model-selectors').innerHTML='<div class="manager-controls"><label>選項估值模型 <select id="value-model">'+selectOptions(Object.fromEntries(Object.entries(VALUE_MODELS).map(([id,m])=>[id,m.label])),valueModel(state))+'</select></label><label>勝率模型（獨立）<select id="wp-model">'+selectOptions(Object.fromEntries(Object.entries(WP_MODELS).map(([id,m])=>[id,m.label])),wpModel(state))+'</select></label></div>';
 for(const id of ['value-model','wp-model'])$(id).onchange=()=>{state={...state,valueModel:$('value-model').value,wpModel:$('wp-model').value};revision++;simulation=null;segmentCache=null;persist();render();};
}
function segmentControls(){
 if(state.mode!=='replay'||state.diverged)segmentAction='run';
 modelControls();
 if(!segmentCache)segmentCache={};
 $('actions').innerHTML=(state.mode==='replay'?'<button class="action '+(segmentAction==='replay'?'selected':'')+'" data-coach-action="replay">沿歷史區段重播</button>':'')+'<button class="action '+(segmentAction==='run'?'selected':'')+'" data-coach-action="run">執行教練策略・建立分支</button>';
 $('layers').innerHTML=coachForm(state);
 const edit=()=>{
  state.coach={...state.coach,tempo:$('coach-tempo').value,defense:$('coach-defense').value,target:$('coach-target').value,timeout:$('coach-timeout').checked,lineup:[...document.querySelectorAll('[data-coach-player]:checked')].map(e=>e.dataset.coachPlayer)};
  segmentAction='run';state.coach.execute='run';revision++;simulation=null;segmentCache=null;persist();render();
 };
 for(const el of $('layers').querySelectorAll('select,input'))el.onchange=edit;
 let error='';try{validateCoach(state,state.coach);}catch(e){error=e.message;}
 $('execute').disabled=Boolean(error);$('simulate').disabled=Boolean(error);$('undo').disabled=!previous;
 if(error){$('distribution').textContent=error;$('model-comparison').innerHTML='';return;}
 const comparison=segmentCache.comparison??=segmentComparison(state);
 $('distribution').innerHTML='<h3>整段策略，不是逐球操作</h3><p>歷史路線使用實際終點比分；替代策略從此完全模擬。最後兩分鐘轉為管理隊逐回合攻防。</p><p class="muted">下表使用配對種子快速抽樣，每格顯示整段得分／段後勝率／槓桿／排名，並非單回合先驗。</p>';
 $('model-comparison').innerHTML=comparisonTable(state,{},comparison);
}
function controls(){
 if(coachPhase()&&state.phase!=='final'){segmentControls();return;}
 const opts=options(state);if(!opts.some(o=>o.id===action))action=opts[0]?.id||'';
 $('actions').innerHTML=opts.map(o=>'<button class="action '+(o.id===action?'selected':'')+'" data-action="'+o.id+'">'+esc(o.label)+'</button>').join('');
 const off=state.possession,def=off==='CLE'?'GSW':'CLE',clocks=Object.fromEntries(Object.entries(CLOCK_CALLS).filter(([id])=>id!=='quickThree'||state.score[off]<state.score[def])),schemes=Object.fromEntries(Object.entries(DEFENSES).filter(([id])=>id!=='intentional'||state.score[def]<state.score[off]));
 if(!clocks[clockCall])clockCall='normal';if(!schemes[defense])defense='switch';
 $('layers').innerHTML='<p class="observed"><span class="tag">'+(state.mode==='replay'?'實際逐球':'估計分支')+'</span> '+esc(realLabel(state))+'</p><div class="manager-controls"><label>進攻時鐘 <select id="clock-call">'+selectOptions(clocks,clockCall)+'</select></label><label>'+def+' 防守 <select id="defense-call">'+selectOptions(schemes,defense)+'</select></label><label>管理球隊 <select id="manage-team">'+selectOptions({CLE:'CLE',GSW:'GSW'},off)+'</select></label><button id="timeout">叫暫停・建立分支</button></div><div id="subs"></div>';
 $('model-selectors').innerHTML='<div class="manager-controls"><label>選項估值模型 <select id="value-model">'+selectOptions(Object.fromEntries(Object.entries(VALUE_MODELS).map(([id,m])=>[id,m.label])),valueModel(state))+'</select></label><label>勝率模型（獨立）<select id="wp-model">'+selectOptions(Object.fromEntries(Object.entries(WP_MODELS).map(([id,m])=>[id,m.label])),wpModel(state))+'</select></label></div><p class="muted">'+esc(VALUE_MODELS[valueModel(state)].note)+' '+esc(WP_MODELS[wpModel(state)].note)+'</p>';
 for(const id of ['value-model','wp-model'])$(id).onchange=()=>{state={...state,valueModel:$('value-model').value,wpModel:$('wp-model').value};revision++;simulation=null;persist();render();message('已切換估計模型；比分與回合不變，分支與自動儲存保留選擇。');};
 const subForm=()=>{const t=$('manage-team').value,bench=TEAMS[t].filter(p=>!state.lineups[t].includes(p.id)&&state.personalFouls[p.id]<6);
  $('subs').innerHTML='<div class="sub-controls"><label>換下 <select id="sub-out">'+selectOptions(Object.fromEntries(state.lineups[t].map(id=>[id,player(id).name])))+'</select></label><label>換上 <select id="sub-in">'+selectOptions(Object.fromEntries(bench.map(p=>[p.id,p.name])))+'</select></label><button id="substitute" '+(!bench.length?'disabled':'')+'>死球換人・建立分支</button></div>';
  $('substitute').onclick=()=>{try{transition(manage(state,{type:'substitution',team:t,out:$('sub-out').value,in:$('sub-in').value}),'換人已建立獨立分支，不再套用未來史實。');}catch(e){message(e.message);}};
 };if(segmentMode()){$('manage-team').value=state.coach.team;$('manage-team').disabled=true;}subForm();$('manage-team').onchange=subForm;
 $('timeout').onclick=()=>{try{transition(manage(state,{type:'timeout',team:$('manage-team').value}),'暫停已建立獨立分支。');}catch(e){message(e.message);}};
 for(const id of ['clock-call','defense-call'])$(id).onchange=()=>{clockCall=$('clock-call').value;defense=$('defense-call').value;if(action==='replay')action=realChoice(state);revision++;simulation=null;render();};
 const d=distribution(state,action==='replay'?realChoice(state):action,decision());
 $('distribution').innerHTML='<h3>完整回合得分分布 <i>估計</i></h3><p class="muted">聯盟典型先驗，非該年度球隊官方打法表。失誤獨立先抽；以下是非失誤回合的先驗，犯規與陣容另調整。</p><div class="outcome-grid">'+d.points.map((p,n)=>'<span>'+n+' 分<b>'+pct(p)+'</b></span>').join('')+'</div>'+chips([{source:'估計',label:'失誤率',value:pct(d.turnover)},{source:'估計',label:'犯規率先驗',value:pct(d.foul)},{source:'估計',label:'使用秒數',value:d.seconds.toFixed(1)}]);
 $('model-comparison').innerHTML=comparisonTable(state,decision());
 $('execute').disabled=!opts.length;$('simulate').disabled=!opts.length;$('undo').disabled=!previous;
 if(segmentMode()&&clutch(state)){
  const defending=state.possession!==state.coach.team;
  $('clock-call').disabled=defending;$('defense-call').disabled=!defending;
  if(defending){$('actions').innerHTML=(state.mode==='replay'?'<button class="action '+(action==='replay'?'selected':'')+'" data-action="replay">沿歷史末段重播</button>':'')+'<button class="action '+(action!=='replay'?'selected':'')+'" data-action="'+realChoice(state)+'">管理防守・對手自動進攻</button>';}
 }
 if(state.phase==='final')for(const id of ['timeout','substitute','clock-call','defense-call'])$(id).disabled=true;
}
function render(){
 $('play-modes').innerHTML='<label>操作模式 <select id="play-mode">'+selectOptions({segment:'區段教練（預設）',possession:'逐回合'},state.playMode)+'</select></label>'+(segmentMode()?'<label>管理球隊 <select id="coach-team">'+selectOptions({CLE:'CLE',GSW:'GSW'},state.coach.team)+'</select></label>':'');
 $('play-mode').onchange=()=>{state=modeState(state,$('play-mode').value);simulation=null;revision++;segmentCache=null;persist();render();};
 if($('coach-team'))$('coach-team').onchange=()=>{state.coach={...coachSettings(state,$('coach-team').value),execute:segmentAction};revision++;segmentCache=null;persist();render();};
 score();controls();
 $('scenarios').innerHTML=MOMENTS.map(m=>'<button class="scenario-card '+(state.moment===m.id?'active':'')+'" data-moment="'+m.id+'"><small>2015 · CLE @ GSW</small><strong>'+esc(m.label)+'</strong><span>'+esc(m.detail)+'</span></button>').join('');
 if(segmentMode()){
  const g=activeSegment(state);
  $('situation').insertAdjacentHTML('beforeend','<p class="phase-banner">'+(clutch(state)?'第二階段・最後兩分鐘：只停管理隊進攻，落後時也停防守。':'第一階段・八個教練區段：球員自動完成工作。')+'</p>');
  $('scenarios').innerHTML='<h3>第一階段・區段策略</h3>'+SEGMENTS.map(m=>'<button class="scenario-card '+(g?.id===m.id?'active':'')+'" data-segment="'+m.id+'"><strong>'+m.label+' · 第 '+m.quarter+' 節 '+clock(m.clock)+'</strong><span>'+m.reason+'</span></button>').join('')+'<h3>第二階段・末段決策</h3><button class="scenario-card" data-segment-clutch="true">最後兩分鐘・管理球隊攻防</button>';
 }
 $('branches').innerHTML=branches.length?branches.map((b,i)=>'<button class="branch-card" data-branch="'+i+'">'+esc(b.name)+'<small> · '+(b.state.mode==='replay'?'實際':'估計')+'</small></button>').join(''):'<p class="muted">替代策略會保留實際起點</p>';
 $('resources').innerHTML=['CLE','GSW'].map(t=>'<section class="resource-section"><div class="team-heading"><span class="team-symbol '+t.toLowerCase()+'">'+t+'</span><h3>'+teamName[t]+'</h3></div>'+TEAMS[t].map(p=>{const d=DATA.distributions[p.id];return '<button class="roster-row '+(state.lineups[t].includes(p.id)?'on-floor':'')+'" data-player="'+p.id+'"><span class="jersey">'+esc(p.jersey)+'</span><span><b>'+esc(p.name)+'</b><small>'+d.fg+'/'+d.fga+' 命中／出手 · 犯規 '+state.personalFouls[p.id]+'</small></span><i>'+(state.lineups[t].includes(p.id)?'場上':'場下')+'</i></button>';}).join('')+'</section>').join('');
 $('log').innerHTML=state.log.map(x=>'<li>'+esc(x)+'</li>').join('')||'<li>從這個窗口開始，完成回合與自動前進都會記錄在這裡。</li>';
 $('simulation').innerHTML='';argumentsView();
}
document.addEventListener('click',e=>{
 const b=e.target.closest('button');if(!b)return;
 if(b.dataset.action){action=b.dataset.action;simulation=null;revision++;render();}
 if(b.dataset.coachAction){segmentAction=b.dataset.coachAction;state.coach.execute=segmentAction;persist();render();}
 if(b.dataset.segment!==undefined)transition({...segmentState(Number(b.dataset.segment),state.coach.team),valueModel:valueModel(state),wpModel:wpModel(state)},'已載入歷史區段。');
 if(b.dataset.segmentClutch){const c=SEGMENTS.at(-1).end.cursor;transition(modeState({...replayState(c),valueModel:valueModel(state),wpModel:wpModel(state),coach:coachSettings(replayState(c),state.coach.team)},'segment'),'已進入末段攻防。');}
 if(b.dataset.moment)transition({...momentState(b.dataset.moment),valueModel:valueModel(state),wpModel:wpModel(state)},'已載入實際回合窗口。');
 if(b.dataset.branch!==undefined)transition(copy(branches[Number(b.dataset.branch)].state),'已返回分支。');
 if(b.dataset.player){
  const id=b.dataset.player,p=player(id),d=DATA.distributions[id],season=DATA.seasonStats[id]||{};
  $('player-detail').innerHTML='<p class="eyebrow">'+p.team+' · '+esc(p.position)+' · '+esc(p.jersey)+'</p><h2>'+esc(p.name)+'</h2>'+chips([{source:'實際',label:'本場命中／出手',value:d.fg+' / '+d.fga},{source:'實際',label:'本場得分／失誤',value:d.points+' / '+d.turnovers},{source:state.mode==='replay'?'實際':'估計',label:'個人犯規',value:state.personalFouls[id]},{source:'實際',label:'年度平均得分',value:season.pts_per_g??'無資料'},{source:'實際',label:'年度投籃命中率',value:season.fg_pct??'無資料'},{source:'估計',label:'年度使用率（來源模型）',value:season.usg_pct??'無資料'},{source:'估計',label:'年度真實命中率（來源模型）',value:season.ts_pct??'無資料'}])+'<h3>實際・追蹤傳球目標分布</h3>'+Object.entries(d.targets).map(([id,n])=>'<p>'+esc(player(id).name)+' '+n+' 次</p>').join('')+'<p class="muted">傳球僅供實際回合重播。模擬以本場及年度效率加權收縮；沒有年度資料時採聯盟先驗，皆標估計。</p>';$('player-dialog').showModal();
 }
 if(b.dataset.player){const impact=MODEL_DATA.players[b.dataset.player];$('player-detail').insertAdjacentHTML('beforeend','<h3>年度來源刊載影響值</h3>'+chips([{source:impact?.bpmSource||'估計',label:'BPM',value:impact?.bpm??0}])+'<p class="muted">來源數值是統計模型，不是本場實際正負分；其陣容與打法映射屬估計，並非因果效果。</p>');}
 if(b.dataset.remedy&&simulation){const [i,j]=b.dataset.remedy.split(':').map(Number),r=simulation.riskBranches[i].remedies[j];transition(copy(r.state),'已建立風險後補救分支：'+r.label);}
 if(b.dataset.segmentRemedy){state.coach.defense=b.dataset.segmentRemedy;segmentAction='run';state.coach.execute='run';revision++;segmentCache=null;persist();render();message('已採用開段防守補救，執行將建立分支。');}
});
$('close-player').onclick=()=>$('player-dialog').close();
$('execute').onclick=()=>{try{
 if(segmentMode())transition(state.mode==='replay'&&!state.diverged&&(coachPhase()?segmentAction==='replay':action==='replay')?historicalSegment(state):runSegment(state,state.coach,clutch(state)?decision():undefined),'區段／末段決策完成，其餘回合已自動前進。');
 else transition(play(state,decision()),action==='replay'?'沿實際回合前進，活球區段已自動略過。':'完整回合已推演；非決策區段自動前進。');
}catch(e){message(e.message);}};
$('undo').onclick=()=>{if(previous){const n=previous;previous=copy(state);state=modeState(n,n.playMode||state.playMode);revision++;simulation=null;segmentCache=null;replayStep=0;action=options(state)[0]?.id||'';segmentAction=state.coach?.execute||(state.mode==='replay'?'replay':'run');clockCall=state.plans[state.possession].clock;defense=state.plans[state.possession==='CLE'?'GSW':'CLE'].defense;persist();render();message('已復原。');}};
$('branch').onclick=()=>{branches=addBranch(branches,state);persist();render();message('已儲存分支。');};
$('simulate').onclick=()=>{
 if(!worker){worker=new Worker('/src/simulation-worker.js',{type:'module'});worker.onerror=()=>{message('背景模擬失敗，請重新整理。');$('simulate').disabled=false;};}
 const id=++request,rev=revision;$('simulate').disabled=true;message('正在配對推演完整比賽與風險補救…');
 worker.onmessage=({data})=>{
  if(data.id!==id||rev!==revision)return;$('simulate').disabled=false;if(data.error){message(data.error);return;}
  simulation=data.result;const m=simulation;
  if(coachPhase()){$('simulation').innerHTML=segmentResult(m);message('區段分布與防守補救已完成。');return;}
  const modelSummary='<p class="model-simulation">'+esc(VALUE_MODELS[m.valueModel].label)+'／'+esc(WP_MODELS[m.wpModel].label)+'・首回合後模型均值 '+pct(m.selected.modelWinProbability)+'／基準 '+pct(m.baseline.modelWinProbability)+'；差異 '+(m.modelDelta*100).toFixed(2)+' 個百分點。下方完整推演勝率是終場勝負抽樣比例，不等於所選勝率公式。</p>';
  $('simulation').innerHTML='<div class="simulation-result"><h3>估計・配對蒙地卡羅 '+m.count+' 次</h3><p>本次勝率 <b>'+pct(m.selected.winProbability)+'</b> ／比較基準 <b>'+pct(m.baseline.winProbability)+'</b></p><p>差異 '+(m.delta*100).toFixed(1)+' 個百分點 · 本回合期望得分 '+m.selected.expectedPoints.toFixed(2)+'</p><small>視角 '+state.possession+'；'+esc(m.baselineLabel)+'。基準屬估計，非已知結果比較。風險使用代表種子，不是條件平均。</small><h3>依期望終場分差排序 <i>估計</i></h3>'+m.riskBranches.map((risk,i)=>'<details class="risk" open><summary>風險：'+(risk.kind==='turnover'?'失誤／違例':'未得分')+' · '+risk.count+'/'+m.count+'</summary>'+risk.remedies.map((r,j)=>'<button data-remedy="'+i+':'+j+'">'+(j+1)+'. '+esc(r.label)+' · 終場分差 '+r.expectedMargin.toFixed(2)+' 分 · 勝率 '+pct(r.winProbability)+'（'+r.count+' 次）↗</button>').join('')+'</details>').join('')+'</div>';
  $('simulation').insertAdjacentHTML('afterbegin',modelSummary);
  document.querySelectorAll('[data-remedy]').forEach(button=>{const [i,j]=button.dataset.remedy.split(':').map(Number),r=m.riskBranches[i].remedies[j];button.append(' · '+WP_MODELS[m.wpModel].label+' '+pct(r.modelWinProbability));});
  message('比較完成。排名差異可能小於抽樣誤差；補救可另開分支。');
 };worker.postMessage({id,state,decision:decision(),seed:20151225});
};
render();

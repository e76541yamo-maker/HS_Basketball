import {compareModels} from './model-comparison.js';
import {VALUE_MODELS,WP_MODELS,valueModel,wpModel} from './evaluation-models.js';
import {approximatelySame} from './verification.js';

const esc=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const pct=p=>Math.round(100*p)+'%';
export function comparisonTable(s,decision={},comparison){
 const team=s.coach?.team||s.possession,c=comparison||compareModels(s,decision,team);
 if(!c.rows.length)return '<p class="muted">終場沒有可比較的選項。</p>';
 const selected=column=>column.valueModel===valueModel(s)&&column.wpModel===wpModel(s);
 const leaders=c.columns.map((_,i)=>c.rows.find(row=>row.values[i].rank===1).values[i]);
 const cell=(v,i)=>{
  const tied=comparison&&approximatelySame(v.wpSamples,leaders[i].wpSamples);
  const content=comparison?'<b>'+Math.round(v.expectedPoints)+' 分 / '+pct(v.winProbabilityAfter)+'</b><small>'+
   pct(v.wpPercentiles[0])+'～'+pct(v.wpPercentiles[2])+(tied?' · 約略相同':'')+'</small>':
   '<b>'+v.expectedPoints.toFixed(2)+' 分 / '+pct(v.winProbabilityAfter)+'</b><small>槓桿 '+v.leverage.toFixed(2)+'× · 第 '+v.rank+' 名'+(v.rank===1?' ★':'')+'</small>';
  return '<td class="'+((comparison?tied:v.rank===1)?'best-option ':'')+(selected(c.columns[i])?'selected-model':'')+'"'+(comparison?'':' data-rank="'+v.rank+'"')+'>'+content+'</td>';
 };
 const explanation=comparison?'每格：整段期望分／本隊（'+team+'）段後模型勝率均值；每方案 '+c.count+' 次配對推演，區間為第 10～90 百分位。與該欄最高均值差異未超出抽樣雜訊的選項標為「約略相同」。':'每格：持球隊先驗期望分／本隊（'+team+'）回合後勝率／槓桿／排名。失誤計入；追加罰球與籃板延續另由蒙地卡羅處理。未抽樣，無抽樣區間。';
 const consensus=comparison?'':'<p class="model-consensus '+(c.disagreement?'divergent':'')+'">'+(c.disagreement?'最佳選擇有分歧・留意醒目排名':'各模型最佳選擇一致')+'</p>';
 return '<h3>跨模型比較 <i>全部估計</i></h3>'+consensus+'<p class="muted">'+explanation+' 表格可橫向捲動。</p><div class="comparison-scroll" role="region" aria-label="跨模型選項比較" tabindex="0"><table class="model-table"><caption>同一局面・每個選項在六種模型組合的估計</caption><thead><tr><th scope="col">'+(comparison?'區段節奏':'完整回合選項')+'</th>'+c.columns.map(column=>'<th scope="col" class="'+(selected(column)?'selected-model':'')+'">'+esc(column.label)+'</th>').join('')+'</tr></thead><tbody>'+c.rows.map(row=>'<tr data-option="'+esc(row.id)+'"><th scope="row">'+esc(row.label)+'</th>'+row.values.map(cell).join('')+'</tr>').join('')+'</tbody></table></div><details class="model-assumptions"><summary>模型假設與來源界線</summary>'+Object.values(VALUE_MODELS).map(m=>'<p><b>'+esc(m.label)+'</b>：'+esc(m.note)+'</p>').join('')+Object.values(WP_MODELS).map(m=>'<p><b>'+esc(m.label)+'</b>：'+esc(m.note)+'</p>').join('')+'<p>罰球窗口各估值模型共用罰球命中率；球員影響採來源刊載 BPM，數值來源為實際、對陣容與戰術的映射為估計。年度資料含比賽之後的賽季資訊，僅供事後策略實驗。</p></details>';
}

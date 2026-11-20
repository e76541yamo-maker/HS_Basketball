import {compareModels} from './model-comparison.js';
import {VALUE_MODELS,WP_MODELS,valueModel,wpModel} from './evaluation-models.js';

const esc=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
function renderComparison(s,decision={},comparison) {
 const c=comparison||compareModels(s,decision);
 if(!c.rows.length)return '<p class="muted">終場沒有可比較的選項。</p>';
 const selected=column=>column.valueModel===valueModel(s)&&column.wpModel===wpModel(s);
 return '<h3>跨模型比較 <i>全部估計</i></h3><p class="model-consensus '+(c.disagreement?'divergent':'')+'">'+(c.disagreement?'最佳選擇有分歧・留意醒目排名':'各模型最佳選擇一致')+'</p><p class="muted">每格：先驗期望分／後勝率／槓桿／排名。失誤計入；追加罰球與籃板延續另由蒙地卡羅處理。按後勝率排名，非已知史實結果。表格可橫向捲動。</p><div class="comparison-scroll" role="region" aria-label="跨模型選項比較" tabindex="0"><table class="model-table"><caption>同一局面・每個選項在六種模型組合的估計</caption><thead><tr><th scope="col">完整回合選項</th>'+c.columns.map(column=>'<th scope="col" class="'+(selected(column)?'selected-model':'')+'">'+esc(column.label)+'</th>').join('')+'</tr></thead><tbody>'+c.rows.map(row=>'<tr data-option="'+esc(row.id)+'"><th scope="row">'+esc(row.label)+'</th>'+row.values.map((v,i)=>'<td class="'+(v.rank===1?'best-option ':'')+(selected(c.columns[i])?'selected-model':'')+'" data-rank="'+v.rank+'"><b>'+v.expectedPoints.toFixed(2)+' 分 / '+(100*v.winProbabilityAfter).toFixed(2)+'%</b><small>槓桿 '+v.leverage.toFixed(2)+'× · 第 '+v.rank+' 名'+(v.rank===1?' ★':'')+'</small></td>').join('')+'</tr>').join('')+'</tbody></table></div><details class="model-assumptions"><summary>模型假設與來源界線</summary>'+Object.values(VALUE_MODELS).map(m=>'<p><b>'+esc(m.label)+'</b>：'+esc(m.note)+'</p>').join('')+Object.values(WP_MODELS).map(m=>'<p><b>'+esc(m.label)+'</b>：'+esc(m.note)+'</p>').join('')+'<p>罰球窗口各估值模型共用罰球命中率；球員影響採來源刊載 BPM，數值來源為實際、對陣容與戰術的映射為估計。年度資料含比賽之後的賽季資訊，僅供事後策略實驗。</p></details>';
}
export function comparisonTable(s,decision={},comparison){
 const html=renderComparison(s,decision,comparison);
 if(!comparison)return html;
 return html.replace('完整回合選項','區段節奏').replace('同一局面・每個選項在六種模型組合的估計','同一區段・三種節奏在六種模型組合的估計').replace('每格：先驗期望分／後勝率／槓桿／排名。失誤計入；追加罰球與籃板延續另由蒙地卡羅處理。按後勝率排名，非已知史實結果。表格可橫向捲動。','每格：整段期望分／段後勝率／槓桿／排名。配對種子快速抽樣，包含犯規罰球與進攻籃板；排名可能受抽樣誤差影響。表格可橫向捲動。');
}

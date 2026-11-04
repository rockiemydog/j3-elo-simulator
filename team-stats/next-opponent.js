(function(root){'use strict';
const $=id=>document.getElementById(id);
const validClub=['岐阜','愛媛','鹿児島','相模原','鳥取','FC大阪','長野','滋賀','熊本','栃木SC','琉球','讃岐','山口','奈良','高知','北九州','松本','金沢','群馬','福島'];
const {META,GROUPS,LOWER}=root.J3TeamStats;let latest=null,fixture=null,busy=false;
const base='https://raw.githubusercontent.com/rockiemydog/j3-elo-simulator/main/';
async function load(name,validate){let last;for(const url of [base+name+'?t='+Date.now(),'../'+name+'?t='+Date.now()]){const ctrl=new AbortController(),timer=setTimeout(()=>ctrl.abort(),15000);try{const r=await fetch(url,{cache:'no-store',credentials:'omit',signal:ctrl.signal});if(!r.ok)throw Error(name+' HTTP '+r.status);return validate(await r.json());}catch(e){last=e;}finally{clearTimeout(timer);}}throw Error(name+': '+String(last?.message||last));}
function fixtureCheck(d){if(d?.verified!==true||d.season!=='2026/27'||!Array.isArray(d.matches)||!Number.isFinite(Date.parse(d.checkedAt))||Date.parse(d.checkedAt)>Date.now()+300000)throw Error('日程データ不正');const ids=new Set();for(const m of d.matches){if(!/^\d{10}$/.test(String(m.id))||ids.has(m.id)||!/^\d{4}-\d{2}-\d{2}$/.test(m.date)||m.id.slice(0,8)!==m.date.replaceAll('-','')||!Number.isFinite(Date.parse(m.date))||new Date(m.date).toISOString().slice(0,10)!==m.date||m.date<'2026-08-08'||m.date>'2027-07-31'||m.home===m.away||!validClub.includes(m.home)||!validClub.includes(m.away)||!['scheduled','finished','postponed','cancelled','unconfirmed'].includes(m.status))throw Error('日程データ不整合');ids.add(m.id);}return d;}
function next(d){return d.matches.filter(m=>(m.home==='北九州'||m.away==='北九州')&&m.status==='scheduled'&&m.date>=new Date().toLocaleDateString('en-CA',{timeZone:'Asia/Tokyo'})).sort((a,b)=>a.date.localeCompare(b.date)||String(a.time).localeCompare(String(b.time)))[0]||null;}
function render(){if(!latest||!fixture)return;const m=next(fixture),status=$('officialCompareStatus'),box=$('officialCompare');box.replaceChildren();if(!m){status.textContent='公式日程に次戦がありません。終了・延期・未確定の試合は次戦として扱いません。';return;}const opponent=m.home==='北九州'?m.away:m.home;const dates=latest.samples;const same=dates?.['北九州']&&dates?.[opponent];if(!same){status.textContent='比較データが揃っていません。';return;}
status.textContent='次戦 '+m.date+' '+(m.time||'時刻未定')+' ／ '+m.home+' vs '+m.away+' ／ 統計確認 '+new Date(latest.checkedAt).toLocaleString('ja-JP',{timeZone:'Asia/Tokyo'})+' ／ 日程確認 '+new Date(fixture.checkedAt).toLocaleString('ja-JP',{timeZone:'Asia/Tokyo'});
const note=document.createElement('p');note.className='sub';note.textContent='Jリーグ公式統計（2026/27）。北九州 '+same.played+'試合、'+opponent+' '+dates[opponent].played+'試合。平均・率と累計を区別し、公式データの更新後に反映します。';box.append(note);
for(const [group,info] of Object.entries(GROUPS)){
 const h=document.createElement('h3');h.textContent=info.label;box.append(h);
 for(const key of info.keys){
  const rows=latest.league[key],a=rows?.find(x=>x.club==='北九州'),b=rows?.find(x=>x.club===opponent);
  if(!a||!b||rows.length!==20)continue;
  const avg=rows.reduce((sum,x)=>sum+x.value,0)/20;
  const values=[a.value,b.value,avg],maximum=Math.max(...values,0.001);
  const card=document.createElement('article');card.className='official-compare-card';
  const title=document.createElement('h4');title.textContent=META[key][0]+'（'+META[key][1]+'）';card.append(title);const direction=document.createElement('p');direction.className='sub';direction.textContent=LOWER.includes(key)?'少ないほど上位':'多いほど上位（強さの総合順位ではありません）';card.append(direction);
  for(const [i,label,color] of [['北九州','#ffd900'],[opponent,'#d4a900'],['J3平均','#1673d1']].map((r,i)=>[i,...r])){
   const row=document.createElement('div');row.className='official-compare-row';
   const name=document.createElement('span');name.className='official-compare-label';name.textContent=label;
   const track=document.createElement('div');track.className='official-compare-track';
   const bar=document.createElement('div');bar.className='official-compare-bar';bar.style.width=(values[i]/maximum*100)+'%';bar.style.background=color;track.append(bar);
   const number=document.createElement('strong');number.textContent=Number(values[i].toFixed(2)).toLocaleString('ja-JP',{maximumFractionDigits:2});
   row.append(name,track,number);card.append(row);
  }
  box.append(card);
 }
}
}
async function refresh(){if(busy)return;busy=true;$('officialCompareRefresh').disabled=true;try{const [comparison,calendar]=await Promise.all([load('team-stats.json',data=>{const checked=root.J3TeamStats.comparisonData(data);root.J3TeamStats.checkProgress(latest,checked);return checked;}),load('official-schedule.json',data=>{const checked=fixtureCheck(data);if(fixture&&Date.parse(checked.checkedAt)<Date.parse(fixture.checkedAt))throw Error('古い日程データ');return checked;})]);latest=comparison;fixture=calendar;render();$('officialCompareError').textContent='';}catch(e){$('officialCompareError').textContent=(latest&&fixture?'最新データを取得できません。前回の比較を保持しています。':'公式統計・日程を確認できません。未検証の数値は表示しません。')+'（診断：'+String(e?.message||e).slice(0,160)+'）';}finally{busy=false;$('officialCompareRefresh').disabled=false;}}
$('officialCompareRefresh').addEventListener('click',refresh);refresh();setInterval(()=>{if(!document.hidden)refresh();},300000);document.addEventListener('visibilitychange',()=>{if(!document.hidden)refresh();});
})(window);

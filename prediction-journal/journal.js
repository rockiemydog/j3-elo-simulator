(function(){
  'use strict';
  const $=id=>document.getElementById(id),api=window.J3ForecastInsights;
  const clubs=['岐阜','愛媛','鹿児島','相模原','鳥取','FC大阪','長野','滋賀','熊本','栃木SC','琉球','讃岐','山口','奈良','高知','北九州','松本','金沢','群馬','福島'];
  let current=null,loading=false;
  const date=s=>new Date(s).toLocaleString('ja-JP',{timeZone:'Asia/Tokyo',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit'});
  const pct=n=>(n*100).toFixed(1)+'%';
  const escape=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  function validateSources(feed,calendar){
    if(feed?.verified!==true||calendar?.verified!==true||feed.season!=='2026/27'||calendar.season!=='2026/27'||!Array.isArray(feed.matches)||feed.matches.length>380||!Array.isArray(calendar.matches)||calendar.matches.length>380)throw Error('公式データの形式不一致');
    const validDay=d=>typeof d==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(d)&&Number.isFinite(Date.parse(d+'T00:00:00Z'))&&new Date(d+'T00:00:00Z').toISOString().slice(0,10)===d&&d>='2026-08-08'&&d<='2027-07-31';
    const today=new Date(Date.now()+9*3600000).toISOString().slice(0,10),validTime=t=>typeof t==='string'&&Number.isFinite(Date.parse(t))&&Date.parse(t)<=Date.now()+300000;
    if(!validTime(feed.updatedAt)||!validTime(calendar.checkedAt)||!validDay(feed.asOfDate)||feed.asOfDate>today)throw Error('公式データの日時不一致');
    const ids=new Set(),cards=new Set();
    for(const r of feed.matches){const g=r.game;if(typeof r.id!=='string'||!/^\d{10}$/.test(r.id)||!validDay(r.date)||r.date>feed.asOfDate||r.id.slice(0,8)!==r.date.replaceAll('-','')||ids.has(r.id)||!Array.isArray(g)||g.length!==4||!clubs.includes(g[0])||!clubs.includes(g[1])||g[0]===g[1]||cards.has(g[0]+'|'+g[1])||!g.slice(2).every(v=>Number.isInteger(v)&&v>=0&&v<=30))throw Error('公式結果の形式不一致');ids.add(r.id);cards.add(g[0]+'|'+g[1]);}
    if(calendar.matches.some(f=>f.scheduledTime!=null&&!/^([01]\d|2[0-3]):[0-5]\d$/.test(f.scheduledTime)))throw Error('公式予定時刻の形式不一致');
    if(feed.matches.length&&feed.matches.map(r=>r.date).sort().at(-1)!==feed.asOfDate)throw Error('公式結果の対象日不一致');
    const fixtureIds=new Set(),fixtureCards=new Set();for(const f of calendar.matches){const card=f.home+'|'+f.away;if(typeof f.id!=='string'||!/^\d{10}$/.test(f.id)||fixtureIds.has(f.id)||fixtureCards.has(card)||!clubs.includes(f.home)||!clubs.includes(f.away)||f.home===f.away||!['finished','scheduled','postponed','cancelled','unconfirmed'].includes(f.status)||!validDay(f.date)||f.id.slice(0,8)!==f.date.replaceAll('-','')||!(f.time===null||/^([01]\d|2[0-3]):[0-5]\d$/.test(f.time)))throw Error('公式日程の形式不一致');fixtureIds.add(f.id);fixtureCards.add(card);}
  }
  function render(){
    if(!current)return;
    const {archive,feed,calendar}=current,club=$('journalClub').value||'北九州',snapshots=archive.snapshots;
    const latest=snapshots.at(-1),model=latest?.model,rows=snapshots.map((s,index)=>({s,index,p:s.clubs.find(r=>r.club===club)?.top6})).filter(r=>r.s.model===model&&Number.isFinite(r.p));
    if(!rows.length){$('trendSummary').textContent='記録開始待ちです。履歴が蓄積すると、ここに確率の推移を表示します。';$('journalTrend').innerHTML='';}
    else{
      const last=rows.at(-1),previous=rows.at(-2),delta=previous&&previous.index===last.index-1?last.p-previous.p:null;
      $('trendSummary').textContent=`${club} ${last.p.toFixed(1)}% ／ ${delta===null?(last.index?'モデル切替（前回比較なし）':'初回記録（比較対象なし）'):(delta>0?'↑ ＋':delta<0?'↓ ':'→ ')+delta.toFixed(1)+'ポイント（前回比）'} ／ ${date(last.s.recordedAt)} 日本時間`;
      const firstTime=Date.parse(rows[0].s.recordedAt),duration=Date.parse(last.s.recordedAt)-firstTime;
      const x=i=>60+(duration>0?(Date.parse(rows[i].s.recordedAt)-firstTime)/duration*600:300),y=p=>230-p*1.8;
      const segments=[];rows.forEach((r,i)=>{if(!i||rows[i-1].index!==r.index-1)segments.push([]);segments.at(-1).push(x(i)+','+y(r.p));});
      const dots=rows.map((r,i)=>`<circle cx="${x(i)}" cy="${y(r.p)}" r="4" fill="#b78500"><title>${escape(date(r.s.recordedAt))}：${r.p.toFixed(2)}%／確定${r.s.confirmed}試合</title></circle>`).join('');
      $('journalTrend').innerHTML=`<svg viewBox="0 0 720 280" role="img" aria-label="${escape(club)}の6位以内確率推移。${rows.length}記録。最新${last.p.toFixed(1)}パーセント"><text x="20" y="25" fill="#667085">6位以内確率（%）</text>${[0,25,50,75,100].map(p=>`<line x1="60" y1="${y(p)}" x2="660" y2="${y(p)}" stroke="#e4e7ec"/><text x="48" y="${y(p)+4}" text-anchor="end" font-size="12">${p}</text>`).join('')}${segments.map(points=>`<polyline points="${points.join(' ')}" fill="none" stroke="#c79c24" stroke-width="3"/>`).join('')}${dots}<text x="60" y="260" font-size="12">${escape(date(rows[0].s.recordedAt))}</text><text x="660" y="260" text-anchor="end" font-size="12">${escape(date(last.s.recordedAt))}</text></svg>`;
    }
    const settled=api.settledPredictions(archive,feed,calendar).filter(p=>p.model===model),score=api.calibration(settled);
    const metrics=[['採点済み試合',String(score.n)],['的中率',score.n?pct(score.accuracy):'—'],['Log loss',score.n?score.logLoss.toFixed(3):'—'],['Brier score',score.n?score.brier.toFixed(3):'—']];
    $('scoreSummary').innerHTML=metrics.map(([label,value])=>`<div><span>${label}</span><strong>${value}</strong></div>`).join('');
    $('sampleNote').textContent=score.n===0?'まだ採点できる試合前記録がありません。今後、記録済みカードの公式終了結果が確認できたら集計します。':score.n<100?'標本が少ないため暫定評価です。確率帯ごとの記録数も確認してください。':'実績に基づく評価ですが、将来の精度を保証するものではありません。';
    $('calibrationRows').innerHTML=score.bins.map(b=>`<tr><td>${b.low}〜${b.high}%${b.high===100?'（100%含む）':'未満'}</td><td>${b.n}</td><td>${b.n?pct(b.forecast):'—'}</td><td>${b.n?pct(b.actual):'—'}</td></tr>`).join('');
    $('calibrationChart').innerHTML=score.n?`<svg viewBox="0 0 600 280" role="img" aria-label="予測確率と実現率の比較。点線に近いほど一致"><line x1="60" y1="230" x2="520" y2="35" stroke="#98a2b3" stroke-dasharray="5 5"/>${[0,50,100].map(p=>`<text x="45" y="${234-p*1.95}" text-anchor="end" font-size="12">${p}%</text><text x="${60+p*4.6}" y="252" text-anchor="middle" font-size="12">${p}%</text>`).join('')}${score.bins.filter(b=>b.n).map(b=>`<circle cx="${60+b.forecast*460}" cy="${230-b.actual*195}" r="6" fill="#17518b"><title>平均予測${pct(b.forecast)}／実現率${pct(b.actual)}／${b.n}記録</title></circle>`).join('')}<text x="10" y="20" font-size="12">実現率 ↑</text><text x="430" y="275" font-size="12">平均予測確率 →</text></svg>`:'';
    const latestCards=new Map();for(const p of archive.predictions.filter(p=>p.model===model)){const key=p.fixtureId+'|'+p.kickoff;const old=latestCards.get(key);if(!old||Date.parse(p.recordedAt)>Date.parse(old.recordedAt))latestCards.set(key,p);}
    const results=new Map(settled.map(p=>[p.fixtureId+'|'+p.kickoff,p]));
    $('matchArchive').innerHTML=[...latestCards.values()].sort((a,b)=>a.kickoff.localeCompare(b.kickoff)).map(p=>{const r=results.get(p.fixtureId+'|'+p.kickoff),f=calendar.matches.find(f=>f.id===p.fixtureId),hold=!f||['postponed','cancelled'].includes(f.status)||Date.parse(f.date+'T'+(f.scheduledTime||f.time||'00:00')+':00+09:00')!==Date.parse(p.kickoff);const verdict=r?(p.probabilities.indexOf(Math.max(...p.probabilities))===r.outcome?'archive-hit':'archive-miss'):'';return `<tr class="${verdict}"><td>H ${escape(p.home)} — A ${escape(p.away)}<br><small>${escape(date(p.kickoff))}</small></td>${p.probabilities.map(v=>'<td>'+pct(v)+'</td>').join('')}<td>${r?r.game[2]+'–'+r.game[3]:hold?'未採点／開催・日時確認':Date.parse(p.kickoff)<=Date.now()?'公式終了結果の反映待ち':'結果待ち'}</td><td>${escape(date(p.recordedAt))}</td></tr>`;}).join('')||'<tr><td colspan="6">次の7日間に日時確定した対象カードの記録を待っています。</td></tr>';
  }
  function renderRetrievalStatus(){
    const {archive,feed,calendar,origin,retrievedAt}=current,snapshots=archive.snapshots,latest=snapshots.at(-1);
    const pending=latest&&(latest.confirmed!==feed.matches.length||Date.parse(latest.sourceUpdatedAt)<Date.parse(feed.updatedAt));
    $('journalStatus').textContent=`${origin}\n記録${snapshots.length}回・試合前予測${archive.predictions.length}件（更新分を含む）\n${latest?'最新予測：'+date(latest.recordedAt)+' 日本時間／公式確定'+latest.confirmed+'試合':'まだ記録はありません。'}\n今回取得：${date(retrievedAt)} 日本時間／取得した公式結果${feed.matches.length}試合${pending?'。予測記録と結果の更新時点が異なります。':''}\n公式日程の確認：${date(calendar.checkedAt)} 日本時間。過去の予測値は更新で変えません。`;
  }
  async function refresh(force=false){
    if(loading)return;loading=true;$('refreshJournal').disabled=true;
    try{
      const download=async base=>{const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),15000);try{return await Promise.all(['prediction-journal.json','official-results.json','league-schedule.json'].map(async file=>{const r=await fetch(base+file+'?t='+Date.now(),{cache:'no-store',credentials:'omit',signal:controller.signal});if(!r.ok)throw Error('HTTP '+r.status);return r.json();}));}finally{controller.abort();clearTimeout(timer);}};
      let data,origin='試合前予測・日程：GitHubの保存済み記録';
      try{data=await download('https://raw.githubusercontent.com/rockiemydog/j3-elo-simulator/main/');}catch(error){if(current)throw error;data=await download('../');origin='公開ページに同梱の記録を表示（GitHub最新記録の再取得は未確認）';}
      const [archive,savedFeed,calendar]=data;
      let feed=savedFeed,resultOrigin='GitHubの保存済み公式結果';
      const base=window.J3OfficialApi?.baseUrl;
      if(typeof base==='string'&&/^https:\/\/[a-z0-9.-]+\.chatgpt\.site$/.test(base)){
        const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),force===true?65000:15000);
        try{
          const response=await fetch(base+(force===true?'/api/refresh':'/api/results'),{cache:'no-store',credentials:'omit',signal:controller.signal,...(force===true?{method:'POST',headers:{'Content-Type':'application/json'},body:'{}'}:{})});
          const body=await response.json();
          if(!response.ok||!['ready','updated','unchanged'].includes(body.status))throw Error('公式更新APIに接続できません');
          validateSources(body.feed,calendar);
          if(!savedFeed.matches.every(r=>body.feed.matches.some(n=>n.id===r.id&&n.game[0]===r.game[0]&&n.game[1]===r.game[1])))throw Error('公式結果が不足しています');
          // API and GitHub use independent update clocks; never undo newer corrections.
          if(Date.parse(body.feed.updatedAt)>=Date.parse(savedFeed.updatedAt))feed=body.feed;
          resultOrigin=feed===body.feed?'メイン画面と同じ公式更新API':'GitHubの新しい保存済み公式結果';
        }catch(error){
          resultOrigin='公式更新APIの確認に失敗。GitHubの保存済み公式結果';
          if(current&&Date.parse(current.feed.updatedAt)>Date.parse(savedFeed.updatedAt)){feed=current.feed;resultOrigin='公式更新APIの確認に失敗。前回取得した公式結果を保持';}
        }finally{controller.abort();clearTimeout(timer);}
      }
      origin+='／結果：'+resultOrigin;
      api.validArchive(archive);validateSources(feed,calendar);
      if(archive.snapshots.some(s=>s.clubs.some(r=>!clubs.includes(r.club)))||archive.predictions.some(p=>!clubs.includes(p.home)||!clubs.includes(p.away)))throw Error('記録のクラブ不一致');
      if(current&&(Date.parse(feed.updatedAt)<Date.parse(current.feed.updatedAt)||Date.parse(calendar.checkedAt)<Date.parse(current.calendar.checkedAt)||current.feed.matches.some(r=>!feed.matches.some(next=>next.game[0]===r.game[0]&&next.game[1]===r.game[1]))||current.calendar.matches.some(f=>!calendar.matches.some(next=>next.home===f.home&&next.away===f.away))))throw Error('古い、または欠落した公式データです');
      if(archive.snapshots.at(-1)?.confirmed>feed.matches.length)throw Error('予測記録に対応する公式結果が不足しています');
      if(current&&(archive.snapshots.length<current.archive.snapshots.length||archive.predictions.length<current.archive.predictions.length||current.archive.snapshots.some((s,i)=>JSON.stringify(s)!==JSON.stringify(archive.snapshots[i]))||current.archive.predictions.some((p,i)=>JSON.stringify(p)!==JSON.stringify(archive.predictions[i]))))throw Error('以前の予測記録と不一致');
      current={archive,feed,calendar,origin,retrievedAt:new Date().toISOString()};render();renderRetrievalStatus();$('journalStatus').classList.remove('insight-error');
    }catch(error){$('journalStatus').textContent='記録の取得・検証に失敗しました。'+(current?'前回の表示を保持しています。':'まだ記録を確認できません。')+' 再確認してください。';$('journalStatus').classList.add('insight-error');}
    finally{loading=false;$('refreshJournal').disabled=false;}
  }
  $('journalClub').innerHTML=clubs.map(c=>'<option>'+c+'</option>').join('');$('journalClub').value='北九州';$('journalClub').onchange=render;$('refreshJournal').onclick=()=>refresh(true);
  setInterval(()=>{if(!document.hidden)refresh();},300000);window.addEventListener('focus',refresh);refresh();
})();

/* Dashboard presentation consumes the simulator's actual-only calculation. */
(function(root){
  'use strict';
  const escape=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const percent=p=>p>0&&p<.05?'0.1%未満':p>99.95&&p<100?'99.9%超':p.toFixed(1)+'%';
  function quantile(counts,fraction){if(!Array.isArray(counts)||counts.length!==115||counts.some(n=>!Number.isInteger(n)||n<0))return null;const total=counts.reduce((a,b)=>a+b,0);if(!total)return null;let sum=0;for(let i=0;i<counts.length;i++){sum+=counts[i];if(sum>=total*fraction)return i;}return null;}
  function summary(context){
    const north=context.rows.find(r=>r.club==='北九州'),sixth=context.rows[5];
    if(!north||!sixth)throw Error('Standings unavailable');
    const forecast=context.baseline?.find(r=>r.club==='北九州'),target=quantile(context.lineCounts?.sixth,.5),remaining=38-north.p;
    const needed=target===null?null:Math.max(0,target-north.pts);
    const recent=context.games.filter(g=>g[0]==='北九州'||g[1]==='北九州').slice(-5).map(g=>{const home=g[0]==='北九州',gf=g[home?2:3],ga=g[home?3:2];return{opponent:g[home?1:0],gf,ga,outcome:gf>ga?'勝':gf===ga?'分':'敗',points:gf>ga?3:gf===ga?1:0};});
    const gdLimit=Math.max(10,Math.ceil(Math.max(...context.rows.map(r=>Math.abs(r.gd)))/10)*10),gdRank=1+context.rows.filter(r=>r.gd>north.gd).length,gdTied=context.rows.filter(r=>r.gd===north.gd).length>1;
    return {north,sixth,winRate:north.p?north.w/north.p*100:null,pointsPerGame:north.p?north.pts/north.p:null,gap:sixth.pts-north.pts,remaining,forecast,target,needed,pace:remaining&&needed!==null?needed/remaining:null,maximum:north.pts+remaining*3,progress:target===null?null:target===0?100:Math.min(100,north.pts/target*100),recent,gdLimit,gdRank,gdTied,ga:north.gf-north.gd};
  }
  function performanceGauge(value,maximum,label,unit,digits){
    if(value===null)return '<div class="dash-gauge-empty">未消化のため算出前</div>';
    if(!Number.isFinite(value)||!Number.isFinite(maximum)||maximum<=0||value<0||value>maximum)throw Error('Invalid performance rate');
    const amount=value/maximum*100,display=value.toFixed(digits)+(unit==='%'?'%':''),tick=n=>String(n)+(unit==='%'?'%':'');
    return `<svg viewBox="0 0 260 178" role="img" aria-label="${escape(label)} ${value.toFixed(digits)}${escape(unit)}。目盛り0から${maximum}${escape(unit)}" class="dash-gauge"><path d="M28 130 A102 102 0 0 1 232 130" pathLength="100" fill="none" stroke="#e9edf4" stroke-width="16" stroke-linecap="round"/><path d="M28 130 A102 102 0 0 1 232 130" pathLength="100" fill="none" stroke="#c99516" stroke-width="16" stroke-linecap="${value===0?'butt':'round'}" stroke-dasharray="${amount} 100"/><text x="130" y="111" text-anchor="middle" class="dash-gauge-value">${display}</text><text x="130" y="135" text-anchor="middle" class="dash-tick">${unit==='%'?'公式実績':escape(unit)}</text><text x="28" y="163" text-anchor="middle" class="dash-tick">${tick(0)}</text><text x="232" y="163" text-anchor="middle" class="dash-tick">${tick(maximum)}</text></svg>`;
  }
  function goalDifferenceGauge(value,limit){
    if(!Number.isFinite(value)||!Number.isFinite(limit)||limit<=0||Math.abs(value)>limit)throw Error('Invalid goal difference');
    const angle=Math.PI*(1-(value+limit)/(2*limit)),x=130+94*Math.cos(angle),y=125-94*Math.sin(angle),signed=value>0?'+'+value:String(value);
    return `<svg viewBox="0 0 260 185" role="img" aria-label="公式得失点差 ${signed}。中央0、目盛りマイナス${limit}からプラス${limit}" class="dash-gauge dash-gd-gauge"><path d="M36 125 A94 94 0 0 1 130 31" fill="none" stroke="#a7b6cc" stroke-width="15"/><path d="M130 31 A94 94 0 0 1 224 125" fill="none" stroke="#eac45b" stroke-width="15"/><text x="130" y="14" text-anchor="middle" class="dash-tick">0</text><path d="M130 125 L${x.toFixed(3)} ${y.toFixed(3)}" stroke="#17243e" stroke-width="3"/><circle cx="130" cy="125" r="5" fill="#17243e"/><text x="130" y="172" text-anchor="middle" class="dash-gauge-value">${signed}</text><text x="32" y="150" text-anchor="middle" class="dash-tick">−${limit}</text><text x="228" y="150" text-anchor="middle" class="dash-tick">+${limit}</text></svg>`;
  }
  function gauge(value,label,primary=false){
    if(value===undefined||value===null)return '<div class="dash-gauge-empty">予測を計算中…</div>';
    if(!Number.isFinite(value)||value<0||value>100)throw Error('Invalid probability');
    return `<svg viewBox="0 0 260 178" role="img" aria-label="${escape(label)} ${percent(value)}。目盛り0から100パーセント" class="dash-gauge${primary?' dash-gauge-primary':''}"><path d="M28 130 A102 102 0 0 1 232 130" pathLength="100" fill="none" stroke="#e9edf4" stroke-width="16" stroke-linecap="round"/><path d="M28 130 A102 102 0 0 1 232 130" pathLength="100" fill="none" stroke="${primary?'#e4ab18':'#203657'}" stroke-width="16" stroke-linecap="${value===0?'butt':'round'}" stroke-dasharray="${value} 100"/><text x="130" y="116" text-anchor="middle" class="dash-gauge-value">${percent(value)}</text><text x="28" y="163" text-anchor="middle" class="dash-tick">0%</text><text x="232" y="163" text-anchor="middle" class="dash-tick">100%</text></svg>`;
  }
  const timestamp=s=>s?new Date(s).toLocaleString('ja-JP',{timeZone:'Asia/Tokyo'}):'未確認';
  let previousBaseline=null,calculatedAt=null;
  function render(context){
    const $=id=>root.document.getElementById(id),s=summary(context),f=s.forecast;
    if(context.baseline!==previousBaseline){previousBaseline=context.baseline;calculatedAt=context.baseline?new Date().toISOString():null;}
    $('dashRank').textContent=s.north.rank+'位'+(s.north.tied?'タイ':'');
    $('dashPoints').textContent=s.north.pts+'点';$('dashRecord').textContent=`${s.north.p}試合 · ${s.north.w}勝${s.north.d}分${s.north.l}敗`;
    $('dashWinRateGauge').innerHTML=performanceGauge(s.winRate,100,'シーズン勝率','%',1);
    $('dashPPGGauge').innerHTML=performanceGauge(s.pointsPerGame,3,'勝点ペース','点／試合',2);
    $('dashWinRateFormula').textContent=s.north.p?`${s.north.w}勝 ÷ ${s.north.p}試合 × 100 ＝ ${s.winRate.toFixed(1)}%。引き分けも消化試合数に含みます。`:'公式確定試合がないため、勝率はまだ算出しません。';
    $('dashPPGFormula').textContent=s.north.p?`${s.north.pts}点 ÷ ${s.north.p}試合 ＝ ${s.pointsPerGame.toFixed(2)}点／試合。1勝3点・引き分け1点・敗戦0点。`:'公式確定試合がないため、勝点ペースはまだ算出しません。';
    $('dashRemaining').textContent=s.remaining+'試合';$('dashPlayed').textContent=`全38試合中 ${s.north.p}試合終了`;
    $('dashGap').textContent=s.gap>0?'あと'+s.gap+'点':s.gap<0?Math.abs(s.gap)+'点先行':'同勝点';
    $('dashSixth').textContent=`現在6位：${s.sixth.club} ${s.sixth.pts}点／${s.sixth.p}試合`;
    $('dashGDGauge').innerHTML=goalDifferenceGauge(s.north.gd,s.gdLimit);
    $('dashGDSummary').textContent=`${s.north.gf}得点／${s.ga}失点 · 得失点差のみの比較：${context.rows.length}クラブ中${s.gdRank}位${s.gdTied?'タイ':''}。目盛りは全クラブの最大絶対値に合わせて調整します。`;
    $('dashTop6Gauge').innerHTML=gauge(f?.top6,'最終6位以内確率',true);$('dashTop2Gauge').innerHTML=gauge(f?.top2,'最終2位以内確率');$('dashTitleGauge').innerHTML=gauge(f?.distribution?.[0],'優勝確率');
    $('dashForecastNote').textContent=f?`公式${context.games.length}試合を反映 · ${context.runs.toLocaleString()}回計算 · 予想勝点 ${f.points.toFixed(1)}点／平均最終順位 ${f.rank.toFixed(1)}位。各確率は重複します。`:'公式結果を基に予測を計算しています。';
    const target=s.target;
    $('dashTarget').textContent=target===null?'計算中':s.north.pts+' / '+target+'点';
    $('dashTargetHelp').textContent=target===null?'6位の予測勝点を計算中です。':'目標：最終6位クラブの予測勝点中央値';
    $('dashProgress').innerHTML=target===null?'':`<div role="progressbar" aria-label="目標勝点への進捗" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${s.progress.toFixed(1)}" aria-valuetext="現在${s.north.pts}点、目標${target}点"><span style="width:${s.progress}%"></span></div>`;
    $('dashNeeded').textContent=s.needed===null?'—':s.needed===0?'目標勝点に到達':'あと'+s.needed+'点';
    $('dashPace').textContent=s.needed===null?'—':s.needed===0?'目標到達済み':!s.remaining?'全日程終了・目標未到達':target>s.maximum?'到達不可能':s.pace.toFixed(2)+'点／試合';
    $('dashTargetRange').textContent=target===null?'':`6位勝点の中央80%範囲 ${quantile(context.lineCounts.sixth,.1)}〜${quantile(context.lineCounts.sixth,.9)}点。目標到達は6位以内の保証ではありません。`;
    const next=context.next,hasCalendar=!!context.calendar;
    if(!next){$('dashNextStatus').textContent=hasCalendar?'次戦情報なし':'日程の取得未確認';$('dashFixture').innerHTML='<p class="dash-muted">'+(hasCalendar?'取得済み日程に次戦を確認できません。':'公式日程を確認しています。')+'</p>';$('dashMatchProb').innerHTML='';}
    else{
      const hold=next.status==='cancelled'?'中止 · 自動切り替え停止':next.status==='postponed'?'延期 · 自動切り替え停止':next.status==='unconfirmed'?'開催・終了状況未確認':'開催予定';
      const past=Date.now()>Date.parse(next.date+'T'+(next.time||'23:59')+':00+09:00');
      $('dashNextStatus').textContent=next.status==='scheduled'&&past?'終了結果を確認中':hold;
      $('dashNextStatus').dataset.hold=String(next.status!=='scheduled'||past);
      $('dashFixture').innerHTML=`<div class="dash-fixture"><div><span>HOME</span><strong>${escape(next.home)}</strong></div><b>vs</b><div><span>AWAY</span><strong>${escape(next.away)}</strong></div></div><p class="dash-kickoff">${escape(next.date.replaceAll('-','/'))} ${escape(next.time||'時刻未定')} 日本時間</p>`;
      const p=context.prematch(next.home,next.away);
      $('dashMatchProb').innerHTML=p&&next.status==='scheduled'&&!past?`<div class="dash-match-probs"><div><span>ホーム勝利</span><strong>${percent(p.home)}</strong></div><div><span>引き分け</span><strong>${percent(p.draw)}</strong></div><div><span>アウェー勝利</span><strong>${percent(p.away)}</strong></div></div>`:'<p class="dash-muted">開催状況の確認後に勝敗確率を表示します。</p>';
    }
    $('dashCalendarNote').textContent=`日程確認：${timestamp(context.calendar?.checkedAt)}${context.calendarIssue||''}${context.calendar&&Date.now()-Date.parse(context.calendar.checkedAt)>86400000?' ／ 確認から24時間以上経過':''}`;
    const recent=s.recent;
    $('dashRecent').innerHTML=recent.length?recent.map(r=>`<span class="dash-form-item" title="北九州 ${r.gf}–${r.ga} ${escape(r.opponent)}"><b data-result="${r.outcome}">${r.outcome}</b><small>${escape(r.opponent)}</small><small>${r.gf}–${r.ga}</small></span>`).join(''):'<p>確定試合はありません。</p>';
    $('dashRecentSummary').textContent=recent.length?`直近${recent.length}試合：勝点${recent.reduce((a,r)=>a+r.points,0)} · ${recent.reduce((a,r)=>a+r.gf,0)}得点／${recent.reduce((a,r)=>a+r.ga,0)}失点（左から古い順）`:'';
    $('dashDataDate').textContent=`公式結果の基準日 ${context.asOfDate} · リーグ確定 ${context.games.length}/380試合`;
    $('dashDataStatus').textContent=context.statusText;
    $('dashDataStatus').dataset.ready=String(context.feedState.state==='ready');
    $('dashTimes').textContent=`公式サイト確認：${timestamp(context.feedState.officialCheckedAt)} ／ 結果データ更新：${timestamp(context.feedState.updatedAt)} ／ 画面取得：${timestamp(context.feedState.checkedAt)} ／ 予測計算：${timestamp(calculatedAt)}（日本時間）`;
    $('dashModel').textContent=`Elo K=20・ホーム+60／Davidson方式。残り試合のEloは固定、順位計算用スコアは1–0・1–1・0–1。xG等のスタッツ、負傷・出場停止・天候は未反映。乱数誤差上限の95%目安：±${(98/Math.sqrt(context.runs)).toFixed(2)}ポイント。モデル自体の誤差は含みません。`;
  }
  const api={summary,gauge,performanceGauge,goalDifferenceGauge,percent,quantile,render};
  if(typeof module==='object'&&module.exports)module.exports=api;else root.J3Dashboard=api;
})(typeof window==='object'?window:globalThis);

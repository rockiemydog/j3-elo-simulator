const fs=require('node:fs');
const vm=require('node:vm');
const assert=require('node:assert/strict');
const html=fs.readFileSync(require('node:path').join(__dirname,'../progress-tracker/index.html'),'utf8');
const code=html.match(/    function winningPlans[\s\S]*?(?=    function render\()/)[0];
const ctx=vm.createContext({});vm.runInContext(code,ctx);
let cases=0;
for(let n=0;n<=38;n++)for(let need=0;need<=3*n+1;need++){
 const p=ctx.winningPlans(n,need),brute=[];
 for(let w=0;w<=n;w++)for(let d=0;d<=n-w;d++)if(3*w+d>=need)brute.push([w,d,n-w-d]);
 assert.equal(p.count,brute.length);
 assert.equal(p.minWins,brute.length?Math.min(...brute.map(x=>x[0])):null);
 assert.equal(p.maxLosses,brute.length?Math.max(...brute.map(x=>x[2])):null);
 const expanded=[];for(const g of p.groups)for(let d=g.minDraws;d<=g.maxDraws;d++)expanded.push([g.wins,d,n-g.wins-d]);
 assert.deepEqual(expanded,brute);cases++;
}
console.log(`PASS: ${cases} exhaustive calculation cases`);

const sample={points:16};
assert.match(ctx.renderWinningPlans(6,58,sample,25),/最少あと9勝 ／ 最大あと11敗まで/);
assert.match(ctx.renderWinningPlans(1,79,{points:0},0),/到達できる組合せはありません/);
const achieved=ctx.renderWinningPlans(6,58,{points:58},0);
assert.match(achieved,/目標勝点に到達済み/);
assert.match(achieved,/全1通り/);
assert.match(achieved,/順位・昇格の保証ではありません/);
assert.ok(!/NaN|Infinity|undefined/.test(achieved));
console.log('PASS: minimum wins, maximum losses, impossible / reached targets and explanation');

const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const test=require('node:test'),assert=require('node:assert/strict'),{execFileSync}=require('node:child_process');
const root=path.resolve(__dirname,'..');
test('private package loads the current official snapshot and complete local assets in both pages',()=>{
 execFileSync('python',['scripts/build-private-site.py'],{cwd:root});
 const expected=JSON.parse(fs.readFileSync(path.join(root,'official-results.json')));
 for(const page of ['index.html','progress-tracker/index.html']){
  const file=path.join(root,'dist',page),html=fs.readFileSync(file,'utf8');
  assert.match(html,/<meta name="robots" content="noindex,nofollow">/);
  const scripts=[...html.matchAll(/<script src="([^"]+)"/g)].map(m=>m[1]);
  assert(scripts.findIndex(s=>s.includes('snapshot'))<scripts.findIndex(s=>s.includes('shared-results')));
  const ctx={console,Date,localStorage:{getItem(){return null}},setTimeout(){},clearTimeout(){}};ctx.window=ctx;vm.createContext(ctx);
  for(const src of scripts){const asset=path.resolve(path.dirname(file),src.split('?')[0]);assert(fs.existsSync(asset));vm.runInContext(fs.readFileSync(asset,'utf8'),ctx);}
  assert.equal(ctx.J3Results.initialGames.length,expected.matches.length);
  assert.equal(ctx.J3Results.resultId(),ctx.J3Results.resultId(expected.matches.map(r=>r.game)));
  assert.equal(ctx.J3Results.feedState.state,'cached');
  assert.equal(ctx.J3Results.verification(ctx.J3Results.clubStats().stats).ok,false);
  for(const css of html.matchAll(/<link[^>]+href="([^"]+)"/g))assert(fs.existsSync(path.resolve(path.dirname(file),css[1].split('?')[0])));
 }
 assert.equal(fs.readFileSync(path.join(root,'dist/robots.txt'),'utf8'),'User-agent: *\nDisallow: /\n');
});

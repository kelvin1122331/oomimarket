const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const html=fs.readFileSync(path.join(__dirname,'..','index.html'),'utf8');
const script=html.match(/<script>([\s\S]*?)<\/script>/)[1];
const menu=html.match(/<div class="portal-social-menus portal-reseller-menus" id="portalResellerMenus"[\s\S]*?<\/div>/)[0];
const destinations=['reseller-game','reseller-website'];

test('illustrated reseller cards preserve both native destinations and accessible names',()=>{
  const cards=[...menu.matchAll(/<button\b[^>]*data-portal-subpage="([^"]+)"[^>]*>([\s\S]*?)<\/button>/g)];
  assert.deepEqual(cards.map(c=>c[1]),destinations);
  assert.deepEqual(cards.map(c=>c[2].match(/<strong>([^<]+)<\/strong>/)[1]),['Reseller top up game','Reseller website']);
  for(const card of cards){
    assert.match(card[0],/type="button"/);
    assert.match(card[0],/aria-label="Buka halaman Reseller/);
    assert.match(card[2],/class="reseller-card-description">[^<]+<\/span>/);
    assert.match(card[2],/class="reseller-card-art" aria-hidden="true"/);
    assert.match(card[2],/class="reseller-card-arrow" aria-hidden="true"/);
  }
});

test('reseller card activation still opens each original registration subpage',()=>{
  const handlers=new Map(),calls=[];
  const nodes=destinations.map(key=>({dataset:{portalSubpage:key},addEventListener(event,handler){assert.equal(event,'click');handlers.set(key,handler);}}));
  const wiring=script.split('\n').find(line=>line.includes("querySelectorAll('[data-portal-subpage]')")&&line.includes('addEventListener'));
  assert.ok(wiring);
  const ctx=vm.createContext({document:{querySelectorAll(selector){assert.equal(selector,'[data-portal-subpage]');return nodes;}},openPortalSubpage(key){calls.push(key);}});
  vm.runInContext(wiring,ctx);
  destinations.forEach(key=>handlers.get(key)());
  assert.deepEqual(calls,destinations);
  for(const key of destinations)assert.match(script,new RegExp("'"+key+"': \\{ title:'[^']+', section:'DAFTAR RESELLER', parent:'reseller' \\}"));
});

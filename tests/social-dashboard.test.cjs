const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const html=fs.readFileSync(path.join(__dirname,'..','index.html'),'utf8');
const script=html.match(/<script>([\s\S]*?)<\/script>/)[1];
const menu=html.match(/<div class="portal-social-menus" id="portalSocialMenus"[\s\S]*?<\/div>/)[0];
const destinations=['social-game','social-ewallet','social-data','social-electric'];

test('digital dashboard preserves four native top-up destinations and readable card descriptions',()=>{
  const cards=[...menu.matchAll(/<button\b[^>]*data-portal-subpage="([^"]+)"[^>]*>([\s\S]*?)<\/button>/g)];
  assert.deepEqual(cards.map(c=>c[1]),destinations);
  for(const card of cards){
    assert.match(card[0],/type="button"/);
    assert.match(card[2],/class="social-card-art" aria-hidden="true"/);
    assert.match(card[2],/<strong>[^<]+<\/strong>/);
    assert.match(card[2],/class="social-card-description">[^<]+<\/span>/);
  }
});

test('each digital card click reaches its original top-up subpage through the existing listener',()=>{
  const handlers=new Map(),calls=[];
  const nodes=destinations.map(key=>({dataset:{portalSubpage:key},addEventListener(event,handler){assert.equal(event,'click');handlers.set(key,handler);}}));
  const wiring=script.split('\n').find(line=>line.includes("querySelectorAll('[data-portal-subpage]')")&&line.includes('addEventListener'));
  assert.ok(wiring);
  const ctx=vm.createContext({document:{querySelectorAll(selector){assert.equal(selector,'[data-portal-subpage]');return nodes;}},openPortalSubpage(key){calls.push(key);}});
  vm.runInContext(wiring,ctx);
  destinations.forEach(key=>handlers.get(key)());
  assert.deepEqual(calls,destinations);
});

test('digital illustrations are local self-contained AVIF assets with meaningful fallback text',()=>{
  const style=html.match(/\/\* social-dashboard:styles-start \*\/([\s\S]*?)\/\* social-dashboard:styles-end \*\//)[1];
  for(const key of ['hero','game','wallet','data','electric']){
    const match=style.match(new RegExp('--social-art-'+key+":url\\('data:image/avif;base64,([^']+)'\\)"));
    assert.ok(match,key);
    const bytes=Buffer.from(match[1],'base64');assert.equal(bytes.subarray(4,8).toString(),'ftyp');
    assert.ok(bytes.includes(Buffer.from('avif')));
  }
  assert.match(html,/Satu tempat untuk semua kebutuhan digitalmu/);
});

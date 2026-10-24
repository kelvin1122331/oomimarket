const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const html=fs.readFileSync(path.join(__dirname,'..','index.html'),'utf8');
const script=html.match(/<script>([\s\S]*?)<\/script>/)[1];
const portal=html.slice(html.indexOf('<section class="portal-screen" id="portalScreen"'),html.indexOf('<section class="portal-screen portal-detail-screen" id="portalDetailScreen"'));

test('all four illustrated cards retain native destinations and decorative images stay out of accessible names',()=>{
  const cards=[...portal.matchAll(/<button\b[^>]*data-portal-destination="([^"]+)"[^>]*>([\s\S]*?)<\/button>/g)];
  assert.deepEqual(cards.map(c=>c[1]),['catalog','social','webdev','reseller']);
  assert.equal((portal.match(/<button\b/g)||[]).length,5); // back button plus the four full-card buttons
  for(const card of cards){
    assert.match(card[0],/type="button"/);
    assert.match(card[2],/<strong>[^<]+<\/strong><small>[^<]+<\/small>/);
    assert.match(card[2],/<img class="portal-card-art"[^>]*alt="" aria-hidden="true"/);
  }
  assert.match(portal,/id="portalBackHome" type="button"/);
});

test('native card clicks still open the catalog or the correct existing detail page',()=>{
  const keys=['catalog','social','webdev','reseller'],handlers=new Map(),calls=[];
  const cards=keys.map(key=>({dataset:{portalDestination:key},addEventListener(event,fn){assert.equal(event,'click');handlers.set(key,fn);}}));
  const screen={hidden:false,inert:false,setAttribute(name,value){this[name]=value;}};
  const ctx=vm.createContext({document:{querySelectorAll(selector){assert.equal(selector,'[data-portal-destination]');return cards;}},portalScreen:screen,catalogReturnToPortal:false,openCatalog(value){calls.push(['catalog',value]);},openPortalDetail(key){calls.push(['detail',key]);}});
  const wiring=script.split('\n').find(line=>line.includes("querySelectorAll('[data-portal-destination]')")&&line.includes('addEventListener'));
  assert.ok(wiring);vm.runInContext(wiring,ctx);
  for(const key of keys)handlers.get(key)();
  assert.deepEqual(calls,[['catalog',false],['detail','social'],['detail','webdev'],['detail','reseller']]);
  assert.equal(ctx.catalogReturnToPortal,true);assert.equal(screen.hidden,true);assert.equal(screen.inert,true);assert.equal(screen['aria-hidden'],'true');
});

const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const html=fs.readFileSync(path.join(__dirname,'..','index.html'),'utf8');
const script=html.match(/<script>([\s\S]*?)<\/script>/)[1];
const source=html.match(/\/\* wallet:script-start \*\/([\s\S]*?)\/\* wallet:script-end \*\//)[1];
const markup=html.match(/<!-- wallet:body-start -->([\s\S]*?)<!-- wallet:body-end -->/)[1];
const cardMarkup=[...markup.matchAll(/<button class="wallet-card"[^>]+>/g)].map(m=>m[0]);
const attr=(text,name)=>text.match(new RegExp(name+'="([^"]*)"'))[1];
function browser(options={}){
  const nodes=new Map(),calls=[],observers=[];
  const node=()=>({hidden:false,inert:false,value:'',textContent:'',attrs:{},handlers:{},children:[],addEventListener(k,fn){this.handlers[k]=fn;},setAttribute(k,v){this.attrs[k]=v;},dispatchEvent(e){calls.push(e.type);},focus(){calls.push('focus');},append(card){this.children=this.children.filter(c=>c!==card);this.children.push(card);}});
  for(const id of ['walletGrid','walletSearch','walletSort','walletSearchForm','walletOrder','walletEmpty','walletStatus','walletClear','walletReset','walletSupport','walletCartButton','walletCartCount','servicesCartCount','customerServiceQuestion','portalSocialSubpage','cartOverlay'])nodes.set(id,node());
  nodes.get('walletSort').value='default';nodes.get('walletCartCount').hidden=true;nodes.get('cartOverlay').hidden=true;nodes.get('servicesCartCount').textContent='3';
  const cards=cardMarkup.map(m=>Object.assign(node(),{dataset:{wallet:attr(m,'data-wallet'),walletName:attr(m,'data-wallet-name'),walletSearch:attr(m,'data-wallet-search')}}));
  const detailPanel=Object.assign(node(),{hidden:true,dataset:{wallet:'dana'}});
  nodes.set('walletProductDetail',detailPanel);
  nodes.set('walletDashboard',{querySelectorAll(selector){return selector==='.wallet-card[data-wallet]'?cards:[...cards,detailPanel];}});nodes.get('walletGrid').children=[...cards];
  nodes.set('openCustomerServiceButton',{click(){calls.push('cs');nodes.get('customerServiceQuestion').value='';}});
  nodes.set('catalogCartButton',{click(){calls.push('cart');nodes.get('cartOverlay').hidden=false;}});
  if(options.bridge)detailPanel.openWallet=card=>{calls.push('detail-'+card.dataset.wallet);if(options.bridge==='throw')throw Error('detail unavailable');return options.bridge!=='false';};
  if(options.failSearch)Object.defineProperty(nodes.get('walletSearch'),'value',{get(){throw Error('search failed');}});
  class Observer{constructor(fn){this.fn=fn;observers.push(this);}observe(node,config){this.node=node;this.config=config;}}
  vm.runInNewContext(source,{document:{getElementById:id=>nodes.get(id)},MutationObserver:options.noObserver?undefined:Observer,Event:class{constructor(type){this.type=type;}},fetch(){throw Error('UI must not create transactions');}});
  return{nodes,calls,cards,observers,visible:()=>nodes.get('walletGrid').children.filter(c=>!c.hidden).map(c=>c.dataset.wallet),notify(id){observers.filter(o=>o.node===nodes.get(id)).forEach(o=>o.fn());}};
}
test('wallet dashboard retains five native named choices and accessible search/sort controls',()=>{
  assert.deepEqual(cardMarkup.map(m=>attr(m,'data-wallet-name')),['DANA','GoPay','OVO','ShopeePay','LinkAja']);
  cardMarkup.forEach(m=>{assert.match(m,/type="button"/);assert.match(m,/aria-label="Lihat pilihan nominal [^"]+"/);});
  assert.equal((markup.match(/class="wallet-icon" aria-hidden="true"/g)||[]).length,5);
  assert.match(markup,/<input id="walletSearch" type="search"[^>]+aria-label=/);
  assert.match(markup,/<select id="walletSort" aria-label=/);
  assert.doesNotMatch(markup,/100%|24\/7|hitungan detik|Rp[0-9]/);
});
test('wallet search handles aliases, spacing and empty results, and clear/reset restore choices',()=>{
  const b=browser(),search=b.nodes.get('walletSearch');assert.equal(b.visible().length,5);
  for(const [query,id] of [['GO PAY','gopay'],['Shopee-pay','shopeepay'],['Link Aja','linkaja']]){search.value=query;search.handlers.input();assert.deepEqual(b.visible(),[id]);assert.equal(b.nodes.get('walletClear').hidden,false);}
  search.value='Bank Digital';search.handlers.input();assert.equal(b.visible().length,0);assert.equal(b.nodes.get('walletEmpty').hidden,false);
  b.nodes.get('walletClear').handlers.click();assert.equal(b.visible().length,5);assert.equal(search.value,'');assert.equal(b.nodes.get('walletClear').hidden,true);
  search.value='OVO';search.handlers.input();b.nodes.get('walletReset').handlers.click();assert.equal(b.visible().length,5);assert.equal(b.nodes.get('walletEmpty').hidden,true);
  let prevented=false;b.nodes.get('walletSearchForm').handlers.submit({preventDefault(){prevented=true;}});assert.equal(prevented,true);
});
test('sorting uses native cards and preserves search results and the original order on reset',()=>{
  const b=browser(),sort=b.nodes.get('walletSort');sort.value='az';sort.handlers.change();assert.deepEqual(b.visible(),['dana','gopay','linkaja','ovo','shopeepay']);
  b.nodes.get('walletSearch').value='pay';b.nodes.get('walletSearch').handlers.input();assert.deepEqual(b.visible(),['gopay','shopeepay']);
  sort.value='za';sort.handlers.change();assert.deepEqual(b.visible(),['shopeepay','gopay']);
  b.nodes.get('walletReset').handlers.click();assert.deepEqual(b.visible(),['dana','gopay','ovo','shopeepay','linkaja']);assert.equal(new Set(b.nodes.get('walletGrid').children).size,5);
});

test('filtering and sorting never move or attach card handlers to the branded detail panel',()=>{
  const b=browser(),detail=b.nodes.get('walletProductDetail');
  assert.equal(b.nodes.get('walletGrid').children.includes(detail),false);
  assert.equal(detail.handlers.click,undefined);
  b.nodes.get('walletSort').value='az';b.nodes.get('walletSort').handlers.change();
  b.nodes.get('walletSearch').value='DANA';b.nodes.get('walletSearch').handlers.input();
  b.nodes.get('walletReset').handlers.click();
  assert.equal(b.nodes.get('walletGrid').children.includes(detail),false);
  assert.equal(b.nodes.get('walletGrid').children.length,5);
  assert.equal(detail.hidden,true);
});
test('wallet cards use existing AI support with an unsent draft and never place transactions',()=>{
  const b=browser();for(const card of b.cards){card.handlers.click();assert.equal(b.nodes.get('customerServiceQuestion').value,`Halo, saya ingin menanyakan ketersediaan dan pilihan nominal top up ${card.dataset.walletName}.`);assert.equal(b.calls.at(-1),'input');}
  b.nodes.get('walletSupport').handlers.click();assert.equal(b.nodes.get('customerServiceQuestion').value,'');assert.equal(b.calls.filter(c=>c==='cs').length,6);
  assert.doesNotMatch(source,/fetch\(|requestSubmit\(|localStorage|sessionStorage|\/api\//);
});

test('wallet choices open detail first and preserve the original inquiry action if enhancement fails',()=>{
  const enhanced=browser({bridge:true});enhanced.cards[2].handlers.click();assert.deepEqual(enhanced.calls,['detail-ovo']);assert.equal(enhanced.nodes.get('customerServiceQuestion').value,'');
  for(const bridge of ['throw','false']){const fallback=browser({bridge});fallback.cards[0].handlers.click();assert.deepEqual(fallback.calls,['detail-dana','cs','input']);assert.match(fallback.nodes.get('customerServiceQuestion').value,/DANA/);}
});
test('wallet cart uses the existing handler and count, and returns focus only to the active page',()=>{
  const b=browser(),button=b.nodes.get('walletCartButton'),badge=b.nodes.get('walletCartCount');assert.equal(badge.textContent,'3');assert.equal(badge.hidden,false);
  b.nodes.get('servicesCartCount').textContent='7';b.notify('servicesCartCount');assert.equal(badge.textContent,'7');assert.match(button.attrs['aria-label'],/7 item/);
  button.handlers.click();assert.equal(b.calls.at(-1),'cart');b.nodes.get('cartOverlay').hidden=true;b.notify('cartOverlay');assert.equal(b.calls.at(-1),'focus');
  button.handlers.click();b.nodes.get('portalSocialSubpage').hidden=true;b.nodes.get('cartOverlay').hidden=true;b.notify('cartOverlay');assert.equal(b.calls.at(-1),'cart');
  b.nodes.get('servicesCartCount').textContent='invalid';b.notify('servicesCartCount');assert.equal(badge.hidden,true);
  const fallback=browser({noObserver:true});assert.equal(fallback.nodes.get('walletCartCount').hidden,true);fallback.nodes.get('walletCartButton').handlers.click();assert.equal(fallback.calls.at(-1),'cart');
});
test('filter failures keep all wallet choices, cart and support available',()=>{
  const b=browser({failSearch:true});assert.equal(b.visible().length,5);assert.equal(b.nodes.get('walletSearchForm').hidden,true);assert.equal(b.nodes.get('walletOrder').hidden,true);b.cards[0].handlers.click();assert.equal(b.calls.includes('cs'),true);b.nodes.get('walletCartButton').handlers.click();assert.equal(b.calls.at(-1),'cart');
});
test('wallet presentation resets across existing game, utility, reseller and website subpages',()=>{
  const nodes=new Map(),classes=new Set(),get=id=>{if(!nodes.has(id))nodes.set(id,{hidden:false,textContent:'',setAttribute(){},focus(){}});return nodes.get(id);};
  const pages=Object.fromEntries(['social-game','social-ewallet','social-data','reseller-game','webdev-company-profile'].map(key=>[key,{title:key,section:'section',parent:key.split('-')[0]}]));
  const page={hidden:true,inert:true,setAttribute(){},classList:{toggle(k,on){if(on)classes.add(k);else classes.delete(k);}}};
  const ctx=vm.createContext({document:{getElementById:get},portalSubpageData:pages,portalSocialSubpage:page,portalDetailScreen:{setAttribute(){}},renderWebdevServiceDetails(){},selectWebdevPackage(){}});
  const rest=script.slice(script.indexOf('      function openPortalSubpage(key)'));vm.runInContext(rest.slice(0,rest.indexOf('\n      }')+8),ctx);
  for(const key of ['social-ewallet','social-game','social-ewallet','reseller-game','social-data','webdev-company-profile']){ctx.openPortalSubpage(key);const wallet=key==='social-ewallet';assert.equal(classes.has('is-wallet-dashboard'),wallet);assert.equal(get('walletDashboard').hidden,!wallet);assert.equal(get('walletCartButton').hidden,!wallet);assert.equal(classes.has('is-game-topup'),key==='social-game');if(wallet)assert.equal(get('portalSubpageEmptyStage').hidden,true);}
});

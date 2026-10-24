const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const html=fs.readFileSync(path.join(__dirname,'..','index.html'),'utf8');
const source=html.match(/\/\* game-topup:script-start \*\/([\s\S]*?)\/\* game-topup:script-end \*\//)[1];
const script=html.match(/<script>([\s\S]*?)<\/script>/)[1];
const catalog=html.match(/<!-- game-topup:catalog-start -->([\s\S]*?)<!-- game-topup:catalog-end -->/)[1];
const cardMarkup=[...catalog.matchAll(/<button class="game-card"[^>]+>/g)].map(m=>m[0]);
const attr=(text,name)=>text.match(new RegExp(name+'="([^"]*)"'))[1];
function browser(options={}){
  const calls=[],nodes=new Map();
  const node=()=>({hidden:false,value:'',textContent:'',attrs:{},handlers:{},addEventListener(event,fn){this.handlers[event]=fn;},setAttribute(k,v){this.attrs[k]=v;},focus(){calls.push('focus');}});
  for(const id of ['gameTopupTools','gameTopupSearch','gameTopupEmpty','gameTopupStatus','gameTopupReset','gameTopupSupport','customerServiceQuestion'])nodes.set(id,node());
  nodes.get('gameTopupTools').hidden=true;
  const cards=cardMarkup.map(markup=>Object.assign(node(),{dataset:{game:attr(markup,'data-game'),gameName:attr(markup,'data-game-name'),gameCurrency:attr(markup,'data-game-currency'),gameCategory:attr(markup,'data-game-category'),gameSearch:attr(markup,'data-game-search')}}));
  const filters=['popular','moba','battle','fps','strategy','other'].map(key=>Object.assign(node(),{dataset:{gameFilter:key}}));
  const root={querySelectorAll(selector){return selector==='[data-game]'?cards:filters;}};nodes.set('gameTopupCatalog',root);
  nodes.set('openCustomerServiceButton',{click(){calls.push('open-cs');nodes.get('customerServiceQuestion').value='';}});
  if(options.failSearch)Object.defineProperty(nodes.get('gameTopupSearch'),'value',{get(){throw Error('search unavailable');}});
  vm.runInNewContext(source,{document:{getElementById:id=>nodes.get(id)},fetch(){throw Error('This UI must not place transactions');}});
  return{nodes,cards,filters,calls,visible:()=>cards.filter(c=>!c.hidden).map(c=>c.dataset.game)};
}

test('game catalogue has ten real buttons and retains named artwork with native labels',()=>{
  assert.deepEqual(cardMarkup.map(c=>attr(c,'data-game')),['pubg','mobile-legends','free-fire','cod','genshin','roblox','valorant','honor','fc','clash']);
  for(const card of cardMarkup){assert.match(card,/type="button"/);assert.match(card,/aria-label="Tanyakan top up [^"]+ ke Customer Service"/);}
  assert.equal((catalog.match(/class="game-cover" aria-hidden="true"/g)||[]).length,10);
  assert.equal((catalog.match(/class="game-card-copy"/g)||[]).length,10);
});

test('game categories and case/spacing-insensitive search combine, show empty results and reset',()=>{
  const b=browser(),search=b.nodes.get('gameTopupSearch');
  assert.equal(b.visible().length,10);assert.equal(b.nodes.get('gameTopupTools').hidden,false);
  b.filters.find(f=>f.dataset.gameFilter==='moba').handlers.click();assert.deepEqual(b.visible(),['mobile-legends','honor']);
  search.value='MOBILELEGENDS';search.handlers.input();assert.deepEqual(b.visible(),['mobile-legends']);
  search.value='PUBG';search.handlers.input();assert.equal(b.visible().length,0);assert.equal(b.nodes.get('gameTopupEmpty').hidden,false);
  b.nodes.get('gameTopupReset').handlers.click();assert.equal(search.value,'');assert.equal(b.visible().length,10);assert.equal(b.nodes.get('gameTopupEmpty').hidden,true);
  b.filters.find(f=>f.dataset.gameFilter==='fps').handlers.click();assert.deepEqual(b.visible(),['cod','valorant']);
  assert.equal(b.filters.find(f=>f.dataset.gameFilter==='fps').attrs['aria-pressed'],'true');
  search.value='call-of duty';search.handlers.input();assert.deepEqual(b.visible(),['cod']);assert.match(b.nodes.get('gameTopupStatus').textContent,/1 dari 10/);
});

test('each game opens existing Customer Service with the correct unsent draft; support opens a clean chat',()=>{
  const b=browser();
  for(const card of b.cards){card.handlers.click();assert.equal(b.nodes.get('customerServiceQuestion').value,`Halo, saya ingin menanyakan ketersediaan dan pilihan nominal top up ${card.dataset.gameName} (${card.dataset.gameCurrency}).`);}
  b.nodes.get('gameTopupSupport').handlers.click();assert.equal(b.nodes.get('customerServiceQuestion').value,'');assert.equal(b.calls.filter(c=>c==='open-cs').length,11);
  assert.doesNotMatch(source,/fetch\(|requestSubmit\(|localStorage|sessionStorage/);
});

test('filter failure keeps all game cards and Customer Service actions available',()=>{
  const b=browser({failSearch:true});assert.equal(b.visible().length,10);assert.equal(b.nodes.get('gameTopupTools').hidden,true);assert.equal(b.nodes.get('gameTopupEmpty').hidden,true);b.cards[0].handlers.click();assert.equal(b.calls[0],'open-cs');
});

test('game catalogue mode resets across existing child pages and native back returns to its menu',()=>{
  const nodes=new Map(),classes=new Set(),calls=[];
  const get=id=>{if(!nodes.has(id))nodes.set(id,{hidden:false,textContent:'',setAttribute(){},focus(){calls.push(id);}});return nodes.get(id);};
  const subpage={hidden:true,inert:true,classList:{toggle(key,on){if(on)classes.add(key);else classes.delete(key);}},setAttribute(){}};
  const detail={hidden:false,inert:false,setAttribute(){}};
  const pages={'social-game':{title:'Top up game',section:'KEBUTUHAN SOSMEDMU',parent:'social'},'social-ewallet':{title:'Top up e-wallet',section:'KEBUTUHAN SOSMEDMU',parent:'social'},'reseller-game':{title:'Reseller top up game',section:'DAFTAR RESELLER',parent:'reseller'},'webdev-company-profile':{title:'Company Profile Website',section:'WEBSITE DEVELOPMENT SERVICES',parent:'webdev'}};
  const ctx=vm.createContext({document:{getElementById:get,querySelector:()=>({focus(){calls.push('return-card');}})},portalSubpageData:pages,portalSocialSubpage:subpage,portalDetailScreen:detail,renderWebdevServiceDetails(){},selectWebdevPackage(){}});
  for(const name of ['openPortalSubpage','backToPortalMenus']){const rest=script.slice(script.indexOf('      function '+name+'('));vm.runInContext(rest.slice(0,rest.indexOf('\n      }')+8),ctx);}
  for(const key of ['social-game','social-ewallet','reseller-game','webdev-company-profile','social-game']){
    ctx.openPortalSubpage(key);const game=key==='social-game';assert.equal(classes.has('is-game-topup'),game);assert.equal(get('gameTopupHero').hidden,!game);assert.equal(get('gameTopupCatalog').hidden,!game);if(game)assert.equal(get('portalSubpageEmptyStage').hidden,true);assert.equal(subpage.hidden,false);assert.equal(detail.hidden,true);
  }
  ctx.backToPortalMenus();assert.equal(subpage.hidden,true);assert.equal(detail.hidden,false);assert.equal(calls.at(-1),'return-card');
});

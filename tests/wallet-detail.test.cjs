const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const html=fs.readFileSync(path.join(__dirname,'..','index.html'),'utf8');
const detailSource=html.match(/\/\* wallet-detail:script-start \*\/([\s\S]*?)\/\* wallet-detail:script-end \*\//)?.[1]||'';
const main=html.match(/<script>([\s\S]*?)<\/script>/)[1];
const amounts=[10000,20000,50000,100000,200000,300000,500000,1000000];
const providers=[['dana','DANA'],['gopay','GoPay'],['ovo','OVO'],['shopeepay','ShopeePay'],['linkaja','LinkAja']];
function browser(){
  const nodes=new Map(),calls=[],docHandlers={};let modal=false;
  const node=()=>({hidden:false,inert:false,scrollTop:0,textContent:'',value:'',dataset:{},handlers:{},attrs:{},children:[],addEventListener(type,fn,capture){this.handlers[type]=fn;this.capture=capture;},setAttribute(k,v){this.attrs[k]=v;},replaceChildren(...children){this.children=children;},focus(){calls.push(this.id||'focus');},dispatchEvent(event){calls.push(event.type);}});
  for(const id of ['walletProductDetail','walletBrowse','portalSocialSubpage','portalSocialSubpageBack','walletProductTitle','walletProductDescription','walletProductIdentity','walletAmountStatus','walletProductSupport','walletProductHelp','walletAccountHint','customerServiceQuestion']){const n=node();n.id=id;nodes.set(id,n);}
  nodes.get('walletProductDetail').hidden=true;nodes.get('portalSocialSubpage').classList={contains:name=>name==='is-wallet-dashboard'};
  nodes.set('openCustomerServiceButton',{click(){calls.push('cs');nodes.get('customerServiceQuestion').value='';}});
  const buttons=amounts.map(amount=>Object.assign(node(),{dataset:{walletAmount:String(amount)}}));
  const cards=providers.map(([id,name])=>Object.assign(node(),{id:'card-'+id,dataset:{wallet:id,walletName:name},querySelector(){return{cloneNode(){return{provider:id};}};}}));
  nodes.get('walletProductDetail').querySelectorAll=()=>buttons;
  const doc={getElementById:id=>nodes.get(id),addEventListener(type,fn,capture){docHandlers[type]=fn;assert.equal(capture,true);},querySelector(){return modal?{}:null;}};
  vm.runInNewContext(detailSource,{document:doc,Intl,Event:class{constructor(type){this.type=type;}},fetch(){throw Error('No transaction API allowed');}});
  return{nodes,buttons,cards,calls,docHandlers,setModal:on=>{modal=on;},open:id=>nodes.get('walletProductDetail').openWallet(cards.find(c=>c.dataset.wallet===id))};
}
const event=key=>({key,defaultPrevented:false,stopped:false,preventDefault(){this.defaultPrevented=true;},stopImmediatePropagation(){this.stopped=true;}});
test('wallet detail shows all eight denominations with the requested tiered markup',()=>{
  assert.ok(detailSource);assert.deepEqual([...html.matchAll(/data-wallet-amount="(\d+)"/g)].map(m=>Number(m[1])),amounts);
  assert.equal((html.match(/class="wallet-amount" type="button"/g)||[]).length,8);
  assert.match(html,/id="walletProductTitle" tabindex="-1"/);
  assert.doesNotMatch(detailSource,/fetch\(|requestSubmit\(|localStorage|sessionStorage|\/api\//);
  const detail=html.match(/<section id="walletProductDetail"[\s\S]*?<\/section>/)[0];assert.doesNotMatch(detail,/100%|QRIS|hitungan detik|otomatis/);
  const prices=[...detail.matchAll(/class="wallet-amount"[\s\S]*?<small>Rp ([\d.]+)<\/small>/g)].map(m=>Number(m[1].replaceAll('.','')));
  assert.deepEqual(prices,[10500,20500,50500,102000,202000,302000,505000,1005000]);
});
test('all five providers open with their own identity, matching artwork and reset denomination selection',()=>{
  const b=browser();for(const [id,name] of providers){b.open(id);assert.equal(b.nodes.get('walletProductDetail').hidden,false);assert.equal(b.nodes.get('walletBrowse').hidden,true);assert.equal(b.nodes.get('walletProductTitle').textContent,name);assert.equal(b.nodes.get('walletProductDetail').dataset.wallet,id);assert.equal(b.nodes.get('walletProductIdentity').children[0].provider,id);assert.match(b.nodes.get('walletProductDescription').textContent,new RegExp(name));assert.equal(b.buttons.filter(n=>n.attrs['aria-pressed']==='true').length,1);assert.equal(b.buttons[0].attrs['aria-pressed'],'true');assert.equal(b.calls.at(-1),'walletProductTitle');assert.match(html,new RegExp("data-wallet='"+id+"'[^}]+--wallet-product-art:var\\(--wallet-detail-"+id+"\\)"));b.buttons[3].handlers.click();}
});
test('denomination changes are exclusive and support receives the chosen provider/amount as an unsent draft',()=>{
  const b=browser();b.open('ovo');b.buttons[7].handlers.click();assert.equal(b.buttons[7].attrs['aria-pressed'],'true');assert.equal(b.buttons[0].attrs['aria-pressed'],'false');assert.equal(b.nodes.get('walletAmountStatus').textContent,'Nominal dipilih: Rp 1.000.000 · Harga: Rp 1.005.000');
  b.nodes.get('walletProductSupport').handlers.click();assert.equal(b.nodes.get('customerServiceQuestion').value,'Halo, saya ingin menanyakan ketersediaan dan cara top up OVO dengan nominal Rp 1.000.000 (harga Rp 1.005.000).');assert.deepEqual(b.calls.slice(-2),['cs','input']);
  b.nodes.get('walletProductHelp').handlers.click();assert.equal(b.nodes.get('customerServiceQuestion').value,'Halo, saya membutuhkan bantuan mengenai top up OVO.');
  for(const [id,name] of providers){
    b.open(id);assert.equal(b.nodes.get('walletAmountStatus').textContent,'Nominal dipilih: Rp 10.000 · Harga: Rp 10.500');
    const expected=[10500,20500,50500,102000,202000,302000,505000,1005000];
    for(const [i,price] of expected.entries()){
      b.buttons[i].handlers.click();const nominal='Rp '+amounts[i].toLocaleString('id-ID'),formattedPrice='Rp '+price.toLocaleString('id-ID');
      assert.equal(b.nodes.get('walletAmountStatus').textContent,`Nominal dipilih: ${nominal} · Harga: ${formattedPrice}`);
      b.nodes.get('walletProductSupport').handlers.click();assert.equal(b.nodes.get('customerServiceQuestion').value,`Halo, saya ingin menanyakan ketersediaan dan cara top up ${name} dengan nominal ${nominal} (harga ${formattedPrice}).`);
    }
  }
});
test('capture-phase back restores the wallet list, scroll and card focus without navigating its parent',()=>{
  const b=browser(),page=b.nodes.get('portalSocialSubpage');page.scrollTop=420;b.open('gopay');assert.equal(page.scrollTop,0);const back=b.nodes.get('portalSocialSubpageBack');assert.equal(back.capture,true);const click=event();back.handlers.click(click);assert.equal(click.stopped,true);assert.equal(click.defaultPrevented,true);assert.equal(b.nodes.get('walletBrowse').hidden,false);assert.equal(b.nodes.get('walletProductDetail').hidden,true);assert.equal(page.scrollTop,420);assert.equal(b.calls.at(-1),'card-gopay');const second=event();back.handlers.click(second);assert.equal(second.stopped,false);
});
test('Escape respects an open modal and only returns from an active wallet detail page',()=>{
  const b=browser();b.open('dana');b.setModal(true);const modal=event('Escape');b.docHandlers.keydown(modal);assert.equal(modal.stopped,false);assert.equal(b.nodes.get('walletProductDetail').hidden,false);
  b.setModal(false);const escape=event('Escape');b.docHandlers.keydown(escape);assert.equal(escape.stopped,true);assert.equal(b.nodes.get('walletProductDetail').hidden,true);
  b.open('dana');b.nodes.get('portalSocialSubpage').hidden=true;const hidden=event('Escape');b.docHandlers.keydown(hidden);assert.equal(hidden.stopped,false);
});
test('existing subpage navigation resets detail presentation before entering any child page',()=>{
  const nodes=new Map(),get=id=>{if(!nodes.has(id))nodes.set(id,{hidden:false,textContent:'',setAttribute(){},focus(){}});return nodes.get(id);};
  const classes=new Set();const pages=Object.fromEntries(['social-ewallet','social-game','social-data','reseller-game','webdev-company-profile'].map(key=>[key,{title:key,section:'section',parent:key.split('-')[0]}]));
  const ctx=vm.createContext({document:{getElementById:get},portalSubpageData:pages,portalSocialSubpage:{classList:{toggle(k,on){if(on)classes.add(k);else classes.delete(k);}},setAttribute(){}},portalDetailScreen:{setAttribute(){}},renderWebdevServiceDetails(){},selectWebdevPackage(){}});
  const rest=main.slice(main.indexOf('      function openPortalSubpage(key)'));vm.runInContext(rest.slice(0,rest.indexOf('\n      }')+8),ctx);
  for(const key of Object.keys(pages)){get('walletProductDetail').hidden=false;get('walletBrowse').hidden=true;ctx.openPortalSubpage(key);assert.equal(get('walletProductDetail').hidden,true);assert.equal(get('walletBrowse').hidden,false);assert.equal(classes.has('is-wallet-dashboard'),key==='social-ewallet');}
});

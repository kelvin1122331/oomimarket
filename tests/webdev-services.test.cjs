const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const crypto=require('node:crypto');
const html=fs.readFileSync(path.join(__dirname,'..','index.html'),'utf8');
const script=html.match(/<script>([\s\S]*?)<\/script>/)[1];
const moduleSource=script.match(/\/\* webdev-services:script-start \*\/([\s\S]*?)\/\* webdev-services:script-end \*\//)[1];
const cards=[...html.match(/<div class="portal-social-menus portal-webdev-menus"[\s\S]*?<\/div>/)[0].matchAll(/<button[^>]*data-portal-subpage="([^"]+)"[^>]*>[\s\S]*?<\/button>/g)];

test('all ten existing services retain destinations and starting prices',()=>{
  const expected=[['webdev-company-profile',2500000],['webdev-ecommerce',7500000],['webdev-landing-page',2000000],['webdev-digital-storefront',7500000],['webdev-news-portal',8000000],['webdev-personal-branding',3500000],['webdev-education-portal',8000000],['webdev-custom-saas',25000000],['webdev-redesign',3000000],['webdev-maintenance',500000]];
  assert.deepEqual(cards.map(c=>[c[1],Number(c[0].match(/data-service-price="(\d+)"/)[1])]),expected);
  for(const c of cards){assert.match(c[0],/type="button"/);assert.match(c[0],/class="portal-service-price"/);assert.match(c[0],/class="services-thumb" aria-hidden="true"/);}
});

function browser(options={}){
  const calls=[],nodes=new Map();
  function node(id=''){return{id,hidden:false,value:'',textContent:'',dataset:{},handlers:{},attributes:{},addEventListener(event,fn){this.handlers[event]=fn;},setAttribute(k,v){this.attributes[k]=v;},focus(){calls.push(['focus',id]);}};}
  for(const id of ['servicesTools','servicesQuickForm','servicesCartButton','servicesSearch','servicesQuickSearch','servicesSort','servicesResultStatus','servicesEmpty','servicesSearchForm','servicesReset'])nodes.set(id,node(id));
  nodes.get('servicesSort').value='original';
  const elements=cards.map(c=>{const n=node(c[1]);n.dataset={portalSubpage:c[1],serviceCategory:c[0].match(/data-service-category="([^"]+)"/)[1],servicePrice:c[0].match(/data-service-price="([^"]+)"/)[1]};n.textContent=c[0].replace(/<[^>]+>/g,' ');n.querySelector=()=>({textContent:c[0].match(/<strong>([^<]+)<\/strong>/)[1]});return n;});
  const filters=['all','company','ecommerce','landing','portal','custom','personal','maintenance'].map(category=>{const n=node(category);n.dataset.serviceCategoryFilter=category;n.count=node();n.querySelector=()=>n.count;return n;});
  const grid=node('portalWebdevMenus');grid.order=elements.slice();grid.querySelectorAll=()=>elements;grid.append=n=>{if(options.failAppend)throw Error('DOM unavailable');grid.order=grid.order.filter(x=>x!==n);grid.order.push(n);};nodes.set('portalWebdevMenus',grid);
  const context=vm.createContext({Set,document:{getElementById:id=>nodes.get(id),querySelectorAll:()=>filters},showCart(){calls.push(['cart']);},updateCartCount(){calls.push(['count']);}});
  vm.runInContext(moduleSource,context);
  return{nodes,elements,filters,grid,calls,context,visible:()=>grid.order.filter(n=>!n.hidden).map(n=>n.id)};
}

test('search, categories, counts, sorting and reset work together without cloning service buttons',()=>{
  const b=browser(),original=b.elements.slice();assert.equal(b.nodes.get('servicesTools').hidden,false);assert.equal(b.visible().length,10);
  const query=b.nodes.get('servicesSearch');query.value='pOrTaL';query.handlers.input();assert.equal(b.nodes.get('servicesQuickSearch').value,'pOrTaL');assert.deepEqual(b.visible(),['webdev-news-portal','webdev-education-portal']);
  const custom=b.filters.find(n=>n.id==='custom');custom.handlers.click();assert.equal(b.visible().length,0);assert.equal(b.nodes.get('servicesEmpty').hidden,false);assert.equal(custom.attributes['aria-pressed'],'true');
  b.nodes.get('servicesReset').handlers.click();assert.equal(b.visible().length,10);assert.equal(query.value,'');assert.equal(b.nodes.get('servicesSort').value,'original');
  b.nodes.get('servicesSort').value='price-asc';b.nodes.get('servicesSort').handlers.change();assert.equal(b.visible()[0],'webdev-maintenance');assert.equal(b.visible().at(-1),'webdev-custom-saas');
  const portal=b.filters.find(n=>n.id==='portal');portal.handlers.click();assert.equal(b.visible().length,2);assert.equal(portal.count.textContent,'2');
  assert.ok(b.grid.order.every(n=>original.includes(n)));assert.deepEqual(original,b.elements);
});

test('header search and submission stay synchronized and cart uses the existing cart handler',()=>{
  const b=browser(),input=b.nodes.get('servicesQuickSearch');input.value='Company';input.handlers.input();assert.deepEqual(b.visible(),['webdev-company-profile']);assert.equal(b.nodes.get('servicesSearch').value,'Company');let prevented=false;b.nodes.get('servicesQuickForm').handlers.submit({preventDefault(){prevented=true;}});assert.equal(prevented,true);b.nodes.get('servicesCartButton').handlers.click();assert.ok(b.calls.some(c=>c[0]==='cart'));
});

test('filter setup failure restores every original service and hides unavailable controls',()=>{
  const b=browser({failAppend:true});assert.equal(b.nodes.get('servicesTools').hidden,true);assert.equal(b.nodes.get('servicesQuickForm').hidden,true);assert.equal(b.nodes.get('servicesCartButton').hidden,true);assert.ok(b.elements.every(n=>!n.hidden));
});

test('existing business logic remains byte-identical outside the three declared UI additions',()=>{
  const protectedScript=script.replace(/      \/\* webdev-services:script-start \*\/[\s\S]*?      \/\* webdev-services:script-end \*\/\n\n/,'').replace(/        \/\* services:mode-start \*\/[\s\S]*?        \/\* services:mode-end \*\/\n/,'').replace(/ \/\* services:count-start \*\/[\s\S]*?\/\* services:count-end \*\//,'');
  assert.equal(crypto.createHash('sha256').update(protectedScript).digest('hex'),'601e1309a33894786a6a30864838d19eb4b9518c1146baa4365aac9faaf762de');
});

test('website mode resets when opening social media or reseller pages',()=>{
  const nodes=new Map();const classes=new Set();const brand={textContent:''};
  function get(id){if(!nodes.has(id)){const n={hidden:false,inert:false,children:[],setAttribute(){},focus(){},replaceChildren(...children){this.children=children;}};Object.defineProperty(n,'textContent',{get(){return this.text||'';},set(value){this.text=value;this.children=[];}});nodes.set(id,n);}return nodes.get(id);}
  const screen={hidden:true,inert:true,setAttribute(){},classList:{toggle(name,on){if(on)classes.add(name);else classes.delete(name);}},querySelector(){return brand;}};
  const source=script.slice(script.indexOf('      function openPortalDetail(key) {'));const fn=source.slice(0,source.indexOf('\n      }')+8);
  const ctx=vm.createContext({portalPageTitles:{webdev:'Website development services',social:'Kebutuhan sosmedmu',reseller:'Daftar reseller'},portalDetailScreen:screen,portalScreen:{setAttribute(){}},document:{getElementById:get},makeElement(tag,className,textContent){return{tag,className,textContent};}});
  vm.runInContext(fn,ctx);ctx.openPortalDetail('webdev');assert.equal(classes.has('is-webdev-services'),true);assert.deepEqual(get('portalDetailTitle').children.map(n=>n.textContent),['Website ','Development Services']);
  for(const key of ['social','reseller']){ctx.openPortalDetail(key);assert.equal(classes.has('is-webdev-services'),false);assert.equal(brand.textContent,'RUANG PILIHAN');assert.equal(get('portalDetailTitle').textContent,key==='social'?'Kebutuhan sosmedmu':'Daftar reseller');}
});


test('search matches common hyphen-free service names',()=>{
  const b=browser(),input=b.nodes.get('servicesSearch');input.value='ecommerce';input.handlers.input();assert.deepEqual(b.visible(),['webdev-ecommerce']);input.value='TOPUP';input.handlers.input();assert.deepEqual(b.visible(),['webdev-digital-storefront']);
});

const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const html=fs.readFileSync(path.join(__dirname,'..','index.html'),'utf8');
const source=html.match(/\/\* support-neon:script-start \*\/([\s\S]*?)\/\* support-neon:script-end \*\//)[1];
const promptMarkup=[...html.matchAll(/<button class="support-question"[^>]+>/g)].map(m=>m[0]);
const attribute=(markup,name)=>markup.match(new RegExp(name+'="([^"]*)"'))[1];
function browser(options={}){
  const nodes=new Map(),calls=[],queued=[],observers=[];
  const node=()=>({hidden:false,disabled:false,value:'',textContent:'',maxLength:2000,dataset:{},attrs:{},handlers:{},scrollTop:50,offsetHeight:80,setAttribute(k,v){this.attrs[k]=v;},addEventListener(event,fn){this.handlers[event]=fn;},focus(opts){calls.push(['focus',opts]);}});
  for(const id of ['customerServiceOverlay','customerServiceQuestion','customerServiceForm','customerServiceChat','supportConversationBody','supportFaq','supportNavigation','supportCategories','supportShowAll','supportDraftFeedback','supportCharacterCount','supportState','supportStateLabel','supportSidebarState','customerServiceFeedback','sendCustomerService','supportFaqEmpty'])nodes.set(id,node());
  nodes.get('customerServiceFeedback').hidden=true;nodes.get('supportDraftFeedback').hidden=true;
  const categories=['all','products','orders','payments','delivery','account','promo','technical'].map(key=>Object.assign(node(),{dataset:{supportCategory:key}}));
  const prompts=promptMarkup.map(markup=>Object.assign(node(),{dataset:{supportTopics:attribute(markup,'data-support-topics'),supportQuestion:attribute(markup,'data-support-question')}}));
  const nav=['chat','faq','orders','guide'].map(key=>Object.assign(node(),{dataset:{supportNav:key}}));
  nodes.get('customerServiceOverlay').querySelectorAll=selector=>selector==='[data-support-category]'?categories:selector==='[data-support-question]'?prompts:nav;
  const ctx={document:{getElementById:id=>nodes.get(id)},queueMicrotask(fn){queued.push(fn);},fetch(){throw Error('UI helpers must not send messages');}};
  if(!options.noObserver)ctx.MutationObserver=class{constructor(fn){this.fn=fn;observers.push(this);}observe(target,opts){this.target=target;this.opts=opts;}};
  vm.runInNewContext(source,ctx);
  return{nodes,categories,prompts,nav,calls,queued,observers,visible:()=>prompts.filter(p=>!p.hidden),choose:key=>categories.find(b=>b.dataset.supportCategory===key).handlers.click()};
}

test('FAQ categories filter suggestions and show-all expands/collapses without modifying the conversation',()=>{
  const b=browser();assert.equal(b.visible().length,6);assert.equal(b.nodes.get('supportNavigation').hidden,false);assert.equal(b.nodes.get('supportFaq').hidden,false);
  b.nodes.get('supportShowAll').handlers.click();assert.equal(b.visible().length,12);assert.equal(b.nodes.get('supportShowAll').attrs['aria-expanded'],'true');
  b.choose('technical');assert.equal(b.visible().length,3);assert.equal(b.nodes.get('supportShowAll').hidden,true);assert.equal(b.categories.find(c=>c.dataset.supportCategory==='technical').attrs['aria-pressed'],'true');
  b.choose('all');assert.equal(b.visible().length,6);assert.equal(b.nodes.get('customerServiceChat').textContent,'');
});

test('suggestion clicks fill unsent drafts and preserve text that the customer has already written',()=>{
  const b=browser(),question=b.nodes.get('customerServiceQuestion');b.prompts[0].handlers.click();assert.equal(question.value,b.prompts[0].dataset.supportQuestion);
  b.prompts[1].handlers.click();assert.equal(question.value,b.prompts[1].dataset.supportQuestion);
  question.value='Pesan pelanggan yang sudah ditulis';b.prompts[2].handlers.click();assert.equal(question.value,'Pesan pelanggan yang sudah ditulis\n'+b.prompts[2].dataset.supportQuestion);
  b.prompts[3].handlers.click();assert.ok(question.value.startsWith('Pesan pelanggan yang sudah ditulis\n'));assert.equal(b.nodes.get('supportCharacterCount').textContent,question.value.length+'/2000');
  assert.doesNotMatch(source,/fetch\(|requestSubmit\(|\.submit\(|localStorage|sessionStorage/);
});

test('long or busy drafts are never truncated or replaced by a quick question',()=>{
  const b=browser(),question=b.nodes.get('customerServiceQuestion');question.value='x'.repeat(1999);b.prompts[0].handlers.click();assert.equal(question.value.length,1999);assert.equal(b.nodes.get('supportDraftFeedback').hidden,false);
  question.value='Sedang dikirim';question.disabled=true;b.prompts[0].handlers.click();assert.equal(question.value,'Sedang dikirim');
});

test('sidebar shortcuts navigate FAQ/chat and native form reset restores the default topics',()=>{
  const b=browser(),question=b.nodes.get('customerServiceQuestion');b.nav.find(n=>n.dataset.supportNav==='guide').handlers.click();assert.equal(b.visible().length,12);assert.equal(b.nodes.get('supportConversationBody').scrollTop,80);
  b.nav.find(n=>n.dataset.supportNav==='orders').handlers.click();assert.match(question.value,/status pesanan.*Shopee/);assert.equal(b.visible().length,4);
  b.nodes.get('customerServiceForm').handlers.reset();question.value='Draft top up yang diisi setelah reset';b.queued.forEach(fn=>fn());assert.equal(b.visible().length,6);assert.equal(b.nodes.get('supportCharacterCount').textContent,question.value.length+'/2000');
  b.nav.find(n=>n.dataset.supportNav==='chat').handlers.click();assert.equal(b.nodes.get('supportConversationBody').scrollTop,0);
});

test('status and disabled suggestions follow actual busy/error states and work without observer support',()=>{
  const b=browser(),question=b.nodes.get('customerServiceQuestion');question.disabled=true;b.nodes.get('sendCustomerService').disabled=true;b.observers[0].fn();assert.equal(b.nodes.get('supportState').dataset.state,'busy');assert.ok(b.prompts.every(p=>p.disabled));
  question.disabled=false;b.nodes.get('sendCustomerService').disabled=false;b.nodes.get('customerServiceFeedback').hidden=false;b.nodes.get('customerServiceFeedback').textContent='Server belum tersedia';b.observers[0].fn();assert.equal(b.nodes.get('supportState').dataset.state,'error');assert.ok(b.prompts.every(p=>!p.disabled));
  b.nodes.get('customerServiceFeedback').hidden=true;b.observers[0].fn();assert.equal(b.nodes.get('supportState').dataset.state,'ready');b.observers[1].fn();assert.equal(b.nodes.get('supportConversationBody').scrollTop,0);
  const fallback=browser({noObserver:true});fallback.prompts[0].handlers.click();assert.ok(fallback.nodes.get('customerServiceQuestion').value);assert.equal(fallback.visible().length,6);
});

test('support presentation retains the original text-only form contract and both close controls',()=>{
  assert.match(html,/<form id="customerServiceForm" class="customer-service-form">/);
  assert.match(html,/<textarea id="customerServiceQuestion" name="question" rows="3" minlength="3" maxlength="2000"[^>]+required><\/textarea>/);
  assert.match(html,/id="sendCustomerService" type="submit">Kirim pesan<\/button>/);assert.match(html,/id="cancelCustomerService" type="button">Tutup<\/button>/);assert.match(html,/id="closeCustomerService" type="button"/);
  assert.match(html,/id="customerServiceChat" role="log" aria-live="polite" aria-relevant="additions"/);
  assert.equal(promptMarkup.length,12);for(const p of promptMarkup)assert.match(p,/type="button"/);
  const start=html.indexOf('<div class="overlay" id="customerServiceOverlay"'),end=html.indexOf('<section class="portal-screen"',start);const modal=html.slice(start,end);assert.doesNotMatch(modal,/type="file"|Online 24\/7|08\.00/);assert.match(modal,/href="https:\/\/www.instagram.com\/aetherjy\/" target="_blank" rel="noopener noreferrer"/);
});

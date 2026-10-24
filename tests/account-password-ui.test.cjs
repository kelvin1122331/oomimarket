const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const html=fs.readFileSync(path.join(__dirname,'..','index.html'),'utf8');
const source=html.match(/\/\* account-password-ui:start \*\/([\s\S]*?)\/\* account-password-ui:end \*\//)[1];
const names=['accountLoginPassword','accountRegisterPassword','accountRegisterPasswordConfirm'];

function setup(options={}){
  const fields=new Map(names.map(name=>[name,{type:'password',value:'synthetic-test-value'}]));
  const buttons=names.map(name=>({dataset:{accountPasswordToggle:name},hidden:true,attrs:{},handlers:{},setAttribute(k,v){this.attrs[k]=v;},addEventListener(event,fn){this.handlers[event]=fn;}}));
  const handlers=new Map();let observerCallback,observation;
  const modal={querySelectorAll(){return buttons;},addEventListener(event,fn,capture){handlers.set(event,{fn,capture});}};
  const overlay={hidden:false};
  const context={document:{getElementById(id){if(id==='accountModal')return options.noModal?null:modal;if(id==='accountOverlay')return overlay;return options.noFields?null:fields.get(id);}}};
  if(!options.noObserver)context.MutationObserver=class{constructor(fn){observerCallback=fn;}observe(target,opts){observation={target,opts};}};
  vm.runInNewContext(source,context);
  return{fields,buttons,handlers,overlay,observe(){observerCallback();},observation};
}

test('password controls reveal only their own field and expose the correct accessible state',()=>{
  const b=setup();
  for(const button of b.buttons){
    const field=b.fields.get(button.dataset.accountPasswordToggle);
    assert.equal(button.hidden,false);button.handlers.click();
    assert.equal(field.type,'text');assert.equal(field.value,'synthetic-test-value');
    assert.equal(button.attrs['aria-pressed'],'true');assert.equal(button.attrs['aria-label'],'Sembunyikan kata sandi');
    assert.ok([...b.fields.values()].filter(f=>f!==field).every(f=>f.type==='password'));
    button.handlers.click();assert.equal(field.type,'password');assert.equal(button.attrs['aria-pressed'],'false');assert.equal(button.attrs['aria-label'],'Tampilkan kata sandi');
  }
});

test('reset, submission and hidden-view changes conceal every revealed password without changing values',()=>{
  const b=setup();
  for(const event of ['reset','submit']){
    b.buttons.forEach(button=>button.handlers.click());
    assert.equal(b.handlers.get(event).capture,true);b.handlers.get(event).fn();
    assert.ok([...b.fields.values()].every(f=>f.type==='password'&&f.value==='synthetic-test-value'));
    assert.ok(b.buttons.every(button=>button.attrs['aria-pressed']==='false'));
  }
  b.buttons[0].handlers.click();b.overlay.hidden=true;b.observe();
  assert.equal(b.fields.get(names[0]).type,'password');
  assert.equal(b.observation.target,b.overlay);assert.equal(b.observation.opts.subtree,true);assert.deepEqual(Array.from(b.observation.opts.attributeFilter),['hidden']);
});

test('missing observer support or missing fields does not affect the original login form',()=>{
  const b=setup({noObserver:true});b.buttons[0].handlers.click();assert.equal(b.fields.get(names[0]).type,'text');b.handlers.get('reset').fn();assert.equal(b.fields.get(names[0]).type,'password');
  const missing=setup({noFields:true});assert.ok(missing.buttons.every(button=>button.hidden));
  assert.doesNotThrow(()=>setup({noModal:true}));
});

test('login and registration retain field validation, labels, autocomplete and native submission',()=>{
  for(const name of ['accountLoginUsername','accountRegisterUsername']){
    assert.match(html,new RegExp('<label for="'+name+'">Username<\\/label>'));
    const input=html.match(new RegExp('<input id="'+name+'"[^>]+>'))[0];
    assert.match(input,/minlength="3" maxlength="30"/);assert.match(input,/autocomplete="username"/);assert.match(input,/required/);
  }
  for(const name of names){
    const input=html.match(new RegExp('<input id="'+name+'"[^>]+>'))[0];assert.match(input,/type="password"/);assert.match(input,/minlength="8" maxlength="72"/);assert.match(input,/required/);
    const toggle=html.match(new RegExp('<button[^>]+data-account-password-toggle="'+name+'"[^>]+>'))[0];assert.match(toggle,/type="button"/);assert.match(toggle,/hidden/);assert.match(toggle,new RegExp('aria-controls="'+name+'"'));
  }
  assert.match(html,/<button class="login-submit" id="accountLoginSubmit" type="submit">Masuk<\/button>/);
  assert.match(html,/<button class="account-switch-button" id="showRegister" type="button">Buat akun<\/button>/);
  assert.doesNotMatch(source,/fetch\(|localStorage|sessionStorage|\.value/);
});

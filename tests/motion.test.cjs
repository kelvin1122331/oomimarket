const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const html = fs.readFileSync(path.join(__dirname,'..','index.html'),'utf8');
const source = html.split('/* modern-motion:start */')[1].split('/* modern-motion:end */')[0];

// Exercise the enhancement independently, including browsers that cannot animate.
function browser(options = {}) {
  const handlers = new Map(), prefs = [], timers = [], frames = [], effects = [], observers = [];
  class Element {
    constructor(name, classes = []) {
      this.name = name; this.dataset = {}; this.isConnected = true; this.hidden = false;
      this.classes = new Set(classes); this.children = []; this.scrollTop = 0;
      this.classList = { contains:c => this.classes.has(c), add:c => this.classes.add(c), remove:c => this.classes.delete(c), toggle:(c,on) => on?this.classes.add(c):this.classes.delete(c) };
      this.style = { values:new Map(), setProperty(k,v) { this.values.set(k,v); }, removeProperty(k) { this.values.delete(k); } };
    }
    matches(selector) { return selector.split(',').some(s => this.classes.has(s.trim().replace(/^\./,''))); }
    querySelectorAll() { return this.children; }
    closest(selector) {
      if (selector.includes('[hidden]') && (this.hidden || this.blocked)) return this;
      return null;
    }
    getAttribute(name) { return name === 'aria-hidden' ? String(this.hidden) : null; }
    contains(target) { return target === this || this.children.includes(target); }
    getBoundingClientRect() { return { top:100, bottom:300, left:0, height:200 }; }
    animate(keyframes,settings) {
      if (options.animationThrows) throw new Error('Animation unavailable');
      const effect = { element:this, keyframes, settings, cancelled:false, cancel() { this.cancelled = true; this.oncancel?.(); } };
      effects.push(effect); return effect;
    }
  }
  const root = new Element('html'), body = new Element('body'), card = new Element('card',['product-card']);
  body.children.push(card); card.parentElement = body;
  const document = { documentElement:root,body,scrollingElement:root,visibilityState:'visible',activeElement:null,
    querySelectorAll() { return []; },getElementById() { return null; },
    addEventListener(type,fn) { handlers.set(type,fn); } };
  class IntersectionObserver {
    constructor(callback) { if (options.observerThrows) throw new Error('Observer unavailable'); this.callback = callback; this.items = new Set(); observers.push(this); }
    observe(element) { this.items.add(element); }
    unobserve(element) { this.items.delete(element); }
    disconnect() { this.items.clear(); this.disconnected = true; }
    enter(element) { this.callback([{target:element,isIntersecting:true,boundingClientRect:element.getBoundingClientRect()}]); }
  }
  class MutationObserver { constructor(callback) { this.callback = callback; observers.push(this); } observe() {} disconnect() { this.disconnected = true; } }
  const window = { Element,HTMLElement:Element,navigator:{connection:{saveData:options.saveData}},innerHeight:900,
    IntersectionObserver:options.noObserver?undefined:IntersectionObserver,MutationObserver,
    matchMedia(query) { const p = { matches:query.includes('reduced')?Boolean(options.reduced):true,addEventListener(type,fn) { this.change = fn; } }; prefs.push(p); return p; },
    getComputedStyle() { return {opacity:'1'}; },
    requestAnimationFrame(fn) { frames.push(fn); return frames.length; }, cancelAnimationFrame() {},
    setTimeout(fn) { timers.push(fn); return timers.length; },clearTimeout() {},addEventListener() {} };
  if (options.noObserver) delete window.IntersectionObserver;
  vm.runInNewContext(source,{window,document,Set,Map,WeakMap,Boolean});
  return {root,body,card,window,document,handlers,prefs,timers,frames,effects,observers,Element,
    flush() { while(timers.length) timers.shift()(); },
    enter(element = card) { observers[0].enter(element); } };
}

test('motion unavailable leaves content visible and does not block the application', () => {
  for (const options of [{noObserver:true},{observerThrows:true}]) {
    const b = browser(options);
    assert.equal(b.root.classList.contains('motion-ready'),false);
    assert.equal(b.card.hidden,false); assert.equal(b.card.style.values.size,0); assert.equal(b.effects.length,0);
  }
});

test('reduced motion and data saver never start entrance or parallax animations', () => {
  for (const options of [{reduced:true},{saveData:true}]) {
    const b = browser(options);
    assert.equal(b.root.dataset.motion,'reduced'); assert.equal(b.observers[0].items.size,0);
    assert.equal(b.effects.length,0); assert.equal(b.frames.length,0); assert.equal(b.card.hidden,false);
  }
});

test('scroll reveal runs once without persistent hidden styles and idle animation loops', () => {
  const b = browser(); b.enter();
  assert.equal(b.effects.length,1); assert.equal(b.effects[0].settings.fill,'backwards');
  assert.equal(b.observers[0].items.has(b.card),false);
  b.effects[0].onfinish(); b.enter(); assert.equal(b.effects.length,1);
  assert.equal(b.card.hidden,false); assert.equal(b.card.style.values.size,0);
  const frame = b.frames.shift(); frame(); assert.equal(b.frames.length,0);
});

test('newly rendered cards get reveal behavior; removed cards release observers', () => {
  const b = browser(), fresh = new b.Element('fresh',['product-card']); fresh.parentElement = b.body;
  b.observers[1].callback([{type:'childList',addedNodes:[fresh]}]); b.flush();
  assert.ok(b.observers[0].items.has(fresh));
  b.card.isConnected = false;
  b.observers[1].callback([{type:'childList',addedNodes:[]}]); b.flush();
  assert.equal(b.observers[0].items.has(b.card),false);
  b.enter(fresh); assert.equal(b.effects[0].element,fresh);
});

test('using controls stops movement immediately and changing motion preference cancels active effects', () => {
  const b = browser(); b.enter(); b.handlers.get('focusin')({target:b.card});
  assert.equal(b.effects[0].cancelled,true);
  const fresh = new b.Element('fresh',['product-card']); fresh.parentElement = b.body;
  b.observers[1].callback([{type:'childList',addedNodes:[fresh]}]); b.flush(); b.enter(fresh);
  b.prefs[0].matches = true; b.prefs[0].change();
  assert.equal(b.effects[1].cancelled,true); assert.equal(b.observers[0].items.size,0);
  assert.equal(b.root.dataset.motion,'reduced'); assert.equal(fresh.hidden,false);
});

test('an animation exception disables enhancement while preserving usable visible content', () => {
  const b = browser({animationThrows:true}); b.enter();
  assert.equal(b.root.dataset.motion,'unavailable'); assert.equal(b.root.classList.contains('motion-ready'),false);
  assert.equal(b.observers[0].items.size,0); assert.equal(b.observers[1].disconnected,true);
  assert.equal(b.card.hidden,false); assert.equal(b.card.style.values.size,0);
});

test('unchanged polled inbox rows stay still while changed rows animate', () => {
  const b = browser(), first = new b.Element('inbox',['customer-service-admin-card']);
  first.parentElement = b.body; first.className = 'customer-service-admin-card'; first.textContent = 'Question: product info; Pending';
  b.observers[1].callback([{type:'childList',addedNodes:[first]}]); b.flush(); b.enter(first);
  const duplicate = new b.Element('inbox',['customer-service-admin-card']);
  duplicate.parentElement = b.body; duplicate.className = first.className; duplicate.textContent = first.textContent;
  b.observers[1].callback([{type:'childList',addedNodes:[duplicate]}]); b.flush();
  assert.equal(b.observers[0].items.has(duplicate),false);
  const changed = new b.Element('inbox',['customer-service-admin-card']);
  changed.parentElement = b.body; changed.className = first.className; changed.textContent = 'Question: product info; Handled';
  b.observers[1].callback([{type:'childList',addedNodes:[changed]}]); b.flush();
  assert.equal(b.observers[0].items.has(changed),true);
});

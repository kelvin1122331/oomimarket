const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const html = fs.readFileSync(path.join(__dirname,'..','index.html'),'utf8');
const source = html.split('/* intro-galaxy:start */')[1].split('/* intro-galaxy:end */')[0];

function browser(options = {}) {
  const frames = new Map(), observers = [], windowEvents = new Map(), documentEvents = new Map();
  let frameId = 0, bounds = {left:0,top:0,width:options.width || 1200,height:800};
  const context = { positions:[], throws:false, setTransform(){}, clearRect(){if(this.throws)throw Error('GPU lost');this.positions=[];},
    createRadialGradient(){return {addColorStop(){}};}, fillRect(...args){this.positions.push(args);}, drawImage(...args){this.positions.push(args.slice(1));}, beginPath(){},arc(){},ellipse(){},stroke(){} };
  class Element {
    constructor(){this.dataset={};this.events=new Map();this.children=[];this.hidden=false;this.classes=new Set();this.classList={contains:c=>this.classes.has(c)};}
    setAttribute(){} getBoundingClientRect(){return bounds;}
    getContext(){return options.noCanvas?null:context;}
    prepend(child){this.children.unshift(child);child.parent=this;}
    remove(){this.removed=true;if(this.parent)this.parent.children=this.parent.children.filter(c=>c!==this);}
    closest(){return this.control?this:null;}
    addEventListener(type,fn,settings){this.events.set(type,{fn,settings});}
  }
  const host=new Element();host.hidden=Boolean(options.hidden);
  const reduce={matches:Boolean(options.reduced),addEventListener(type,fn){this.change=fn;}};
  class MutationObserver {constructor(callback){this.callback=callback;observers.push(this);}observe(){}disconnect(){this.disconnected=true;}}
  class ResizeObserver {constructor(callback){this.callback=callback;observers.push(this);}observe(){}disconnect(){this.disconnected=true;}}
  const navigator={connection:{saveData:Boolean(options.saveData)}};
  const document={visibilityState:'visible',getElementById(){return host;},createElement(){return new Element();},addEventListener(type,fn){documentEvents.set(type,fn);}};
  const window={devicePixelRatio:3,ResizeObserver,matchMedia(){return reduce;},
    requestAnimationFrame(fn){frames.set(++frameId,fn);return frameId;},cancelAnimationFrame(id){frames.delete(id);},
    addEventListener(type,fn){windowEvents.set(type,fn);}};
  vm.runInNewContext(source,{window,document,navigator,MutationObserver,ResizeObserver});
  const canvas=host.children[0];
  return {host,canvas,context,frames,observers,reduce,document,documentEvents,windowEvents,
    step(time){const next=frames.entries().next().value;assert.ok(next);frames.delete(next[0]);next[1](time);},
    emit(type,overrides={}){let prevented=false;const event={clientX:300,clientY:250,button:0,target:new Element(),preventDefault(){prevented=true;},...overrides};host.events.get(type).fn(event);return prevented;},
    resize(width,height){bounds={...bounds,width,height};observers[1].callback();},
    mutate(){observers[0].callback();}
  };
}

test('intro enhancement skips hidden admin routes and survives missing canvas support',()=>{
  const hidden=browser({hidden:true});assert.equal(hidden.host.children.length,0);assert.equal(hidden.frames.size,0);
  const unsupported=browser({noCanvas:true});assert.equal(unsupported.host.dataset.galaxy,'unavailable');assert.equal(unsupported.host.children.length,0);assert.equal(unsupported.frames.size,0);
});

test('pointer motion and touch presses move particles without cancelling native input or controls',()=>{
  const b=browser();b.step(20);const before=JSON.stringify(b.context.positions);
  assert.equal(b.emit('pointermove'),false);b.step(40);assert.notEqual(JSON.stringify(b.context.positions),before);
  assert.equal(b.emit('pointerdown',{pointerType:'touch'}),false);assert.equal(b.canvas.dataset.galaxyInteractions,'1');
  b.emit('pointerdown',{target:{closest:()=>({})}});b.emit('pointerdown',{button:2});
  assert.equal(b.canvas.dataset.galaxyInteractions,'1');
  for(const type of ['pointermove','pointerdown','pointerleave','pointercancel','pointerup'])assert.equal(b.host.events.get(type).settings.passive,true);
});

test('touch and pen release stop repulsion while mouse release preserves hover interaction',()=>{
  function afterRelease(releaseType){
    const b=browser();b.step(20);
    // The centered pointer removes camera movement from this comparison.
    b.emit('pointerdown',{clientX:600,clientY:400,pointerType:'touch'});
    b.step(40);b.step(60);
    if(releaseType==='leave')b.emit('pointerleave');
    else if(releaseType)assert.equal(b.emit('pointerup',{pointerType:releaseType}),false);
    const positions=[];
    for(const time of [80,100,120,140,160]){b.step(time);positions.push(JSON.stringify(b.context.positions));}
    assert.equal(b.frames.size,1);
    return positions;
  }
  const left=afterRelease('leave'), held=afterRelease();
  assert.notDeepEqual(left,held,'a held pointer must continue affecting nearby particles');
  assert.deepEqual(afterRelease('touch'),left,'lifting a finger must behave like leaving the canvas');
  assert.deepEqual(afterRelease('pen'),left,'lifting a pen must also release particle repulsion');
  assert.deepEqual(afterRelease('mouse'),held,'mouse hover should remain interactive after a click');
});

test('hidden intro, open modal, leaving state and background tabs stop frames and resume once',()=>{
  const b=browser();assert.equal(b.frames.size,1);
  for(const property of ['hidden','inert']){b.host[property]=true;b.mutate();assert.equal(b.frames.size,0);b.host[property]=false;b.mutate();b.mutate();assert.equal(b.frames.size,1);}
  b.host.classes.add('is-leaving');b.mutate();assert.equal(b.frames.size,0);b.host.classes.clear();b.mutate();assert.equal(b.frames.size,1);
  b.document.visibilityState='hidden';b.documentEvents.get('visibilitychange')();assert.equal(b.frames.size,0);
  b.document.visibilityState='visible';b.documentEvents.get('visibilitychange')();assert.equal(b.frames.size,1);
  b.windowEvents.get('pagehide')();assert.equal(b.frames.size,0);b.windowEvents.get('pageshow')();assert.equal(b.frames.size,1);
});

test('reduced motion renders a static galaxy and live preference changes cancel animation',()=>{
  const b=browser({reduced:true});assert.equal(b.frames.size,0);assert.equal(b.canvas.dataset.galaxyState,'reduced');assert.ok(b.context.positions.length>0);
  b.emit('pointerdown');assert.equal(b.canvas.dataset.galaxyInteractions,'0');
  b.reduce.matches=false;b.reduce.change();assert.equal(b.frames.size,1);
  b.reduce.matches=true;b.reduce.change();assert.equal(b.frames.size,0);assert.equal(b.canvas.dataset.galaxyState,'reduced');
});

test('small screens cap resolution and data saver limits stars and frame rate',()=>{
  const mobile=browser({width:390});assert.equal(mobile.canvas.width,585);assert.ok(Number(mobile.canvas.dataset.starCount)<=280);
  mobile.resize(1440,1000);assert.equal(mobile.canvas.width,2880);assert.ok(Number(mobile.canvas.dataset.starCount)<=600);assert.equal(mobile.frames.size,1);
  const b=browser({saveData:true});assert.equal(b.canvas.width,1200);assert.equal(b.canvas.dataset.starCount,'80');
  b.step(100);b.emit('pointermove');const previous=JSON.stringify(b.context.positions);b.step(116);assert.equal(JSON.stringify(b.context.positions),previous);
  b.step(150);assert.notEqual(JSON.stringify(b.context.positions),previous);
});

test('drawing failures remove only the decorative canvas and release the animation loop',()=>{
  const b=browser();b.context.throws=true;b.step(100);assert.equal(b.host.dataset.galaxy,'unavailable');assert.equal(b.canvas.removed,true);
  assert.equal(b.frames.size,0);assert.equal(b.host.hidden,false);assert.ok(b.observers.every(o=>o.disconnected));
});

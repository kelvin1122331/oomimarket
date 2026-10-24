const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const html = fs.readFileSync(path.join(__dirname,'..','index.html'),'utf8');
const source = html.split('/* intro-galaxy:start */')[1].split('/* intro-galaxy:end */')[0];

function browser(options = {}) {
  const frames = new Map(), observers = [], windowEvents = new Map(), documentEvents = new Map();
  let frameId = 0, bounds = {left:0,top:0,width:options.width || 1200,height:options.height || 800};
  const context = { positions:[], geometry:[], throws:false, setTransform(){}, clearRect(){if(this.throws)throw Error('GPU lost');this.positions=[];this.geometry=[];},
    createRadialGradient(){return {addColorStop(){}};},
    record(op,args){this.geometry.push({op,args});},
    fillRect(...args){this.positions.push(args);this.record('fillRect',args);},
    drawImage(...args){this.positions.push(args.slice(1));this.record('drawImage',args.slice(1));},
    arc(...args){this.record('arc',args);},ellipse(...args){this.record('ellipse',args);},
    moveTo(...args){this.record('moveTo',args);},lineTo(...args){this.record('lineTo',args);},
    beginPath(){},closePath(){},save(){},restore(){},clip(){},fill(){},stroke(){} };
  class Element {
    constructor(){this.dataset={};this.events=new Map();this.children=[];this.hidden=false;this.classes=new Set();this.classList={contains:c=>this.classes.has(c)};
      this.style={values:new Map(),setProperty(k,v){this.values.set(k,v);},getPropertyValue(k){return this.values.get(k)||'';}};}
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

function tiltIsReset(host) {
  for(const name of ['--intro-rx','--intro-ry','--intro-px','--intro-py'])assert.equal(Number.parseFloat(host.style.getPropertyValue(name)),0,name);
}

test('perspective projection enlarges near objects and keeps the near plane finite',()=>{
  const declaration=source.match(/function perspectiveScale\(z,focalLength\)\s*\{[^}]*\}/);
  assert.ok(declaration,'the shipped renderer must expose its pure perspective projection helper');
  const perspective=vm.runInNewContext('('+declaration[0]+')');
  for(const focal of [650,920,1600]){
    assert.equal(perspective(0,focal),1);
    assert.ok(perspective(-focal*.4,focal)>1,'near objects must appear larger');
    assert.ok(perspective(focal,focal)<1,'far objects must appear smaller');
    assert.ok(perspective(-focal*.4,focal)>perspective(focal,focal));
    for(const z of [-1e9,-focal,-focal*.99,-focal*.4,0,focal,1e9]){
      const scale=perspective(z,focal);assert.ok(Number.isFinite(scale)&&scale>0&&scale<=5,'projection must have a bounded positive scale, including behind the near plane');
    }
  }
});

test('intro enhancement skips hidden admin routes and survives missing canvas support',()=>{
  const hidden=browser({hidden:true});assert.equal(hidden.host.children.length,0);assert.equal(hidden.frames.size,0);
  const unsupported=browser({noCanvas:true});assert.equal(unsupported.host.dataset.galaxy,'unavailable');assert.equal(unsupported.host.children.length,0);assert.equal(unsupported.frames.size,0);
  assert.equal(unsupported.host.dataset.galaxyActive,'false');tiltIsReset(unsupported.host);
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
  const b=browser();assert.equal(b.frames.size,1);assert.equal(b.host.dataset.galaxyActive,'true');
  const paused=()=>{assert.equal(b.frames.size,0);assert.equal(b.host.dataset.galaxyActive,'false');tiltIsReset(b.host);};
  const resumed=()=>{assert.equal(b.frames.size,1);assert.equal(b.host.dataset.galaxyActive,'true');};
  for(const property of ['hidden','inert']){b.host[property]=true;b.mutate();paused();b.host[property]=false;b.mutate();b.mutate();resumed();}
  b.host.classes.add('is-leaving');b.mutate();paused();b.host.classes.clear();b.mutate();resumed();
  b.document.visibilityState='hidden';b.documentEvents.get('visibilitychange')();paused();
  b.document.visibilityState='visible';b.documentEvents.get('visibilitychange')();resumed();
  b.windowEvents.get('pagehide')();paused();b.windowEvents.get('pageshow')();resumed();
});

test('reduced motion renders a static galaxy and live preference changes cancel animation',()=>{
  const b=browser({reduced:true});assert.equal(b.frames.size,0);assert.equal(b.canvas.dataset.galaxyState,'reduced');assert.ok(b.context.positions.length>0);assert.equal(b.host.dataset.galaxyActive,'false');tiltIsReset(b.host);
  b.emit('pointerdown');assert.equal(b.canvas.dataset.galaxyInteractions,'0');
  b.reduce.matches=false;b.reduce.change();assert.equal(b.frames.size,1);
  b.emit('pointermove',{clientX:1200,clientY:0});b.step(20);assert.notEqual(Number.parseFloat(b.host.style.getPropertyValue('--intro-ry')),0);
  b.reduce.matches=true;b.reduce.change();assert.equal(b.frames.size,0);assert.equal(b.canvas.dataset.galaxyState,'reduced');assert.equal(b.host.dataset.galaxyActive,'false');tiltIsReset(b.host);
});

test('3D UI tilt stays bounded and resets when pointer or modal interaction ends',()=>{
  const b=browser();assert.equal(b.canvas.dataset.galaxyRenderer,'perspective-3d');
  b.emit('pointermove',{clientX:1e8,clientY:-1e8});b.step(20);b.step(40);
  for(const [name,limit] of [['--intro-rx',3],['--intro-ry',3],['--intro-px',9],['--intro-py',7]]){
    const value=Number.parseFloat(b.host.style.getPropertyValue(name));assert.ok(Number.isFinite(value)&&Math.abs(value)>0&&Math.abs(value)<=limit,name);
  }
  b.emit('pointerleave');tiltIsReset(b.host);
  b.emit('pointermove',{clientX:1100,clientY:100});b.step(60);b.emit('pointerup',{pointerType:'touch'});tiltIsReset(b.host);
  b.emit('pointermove',{clientX:1100,clientY:100});b.step(80);b.host.inert=true;b.mutate();tiltIsReset(b.host);
  assert.equal(b.host.dataset.galaxyActive,'false');assert.equal(b.frames.size,0);
});

test('projected stardust, orbit curves and particle impulses render finite geometry at all supported sizes',()=>{
  for(const [width,height] of [[320,568],[390,844],[812,375],[1440,900],[2560,1440]]){
    const b=browser({width,height});
    for(const time of [20,40,400,15000,16000]){
      b.emit('pointermove',{clientX:time%2?0:width,clientY:time%3?height:0});
      b.emit('pointerdown',{clientX:width*.25,clientY:height*.7,pointerType:'touch'});b.step(time);
      assert.equal(b.host.dataset.galaxy,'ready');assert.ok(b.context.geometry.length>200);
      assert.ok(b.context.geometry.some(g=>g.op==='lineTo'),'the projected rings must be rendered');
      assert.ok(b.context.geometry.some(g=>g.op==='drawImage'),'the star glow sprites must be rendered');
      for(const {op,args} of b.context.geometry)for(const value of args)assert.ok(Number.isFinite(value)&&Math.abs(value)<Math.max(width,height)*20,op+' must receive finite bounded coordinates');
      assert.equal(b.frames.size,1);
    }
  }
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
  assert.equal(b.frames.size,0);assert.equal(b.host.hidden,false);assert.ok(b.observers.every(o=>o.disconnected));assert.equal(b.host.dataset.galaxyActive,'false');tiltIsReset(b.host);
});

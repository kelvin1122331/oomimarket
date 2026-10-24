const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { createLoginAudit, deviceInfo, clientIp, approximateLocation } = require('../login-audit.cjs');
function temp(t) {
  const parent=path.resolve(__dirname,'.tmp');fs.mkdirSync(parent,{recursive:true});const dir=fs.mkdtempSync(path.join(parent,'audit-'));
  t.after(()=>{if(path.dirname(path.resolve(dir))!==parent || !path.basename(dir).startsWith('audit-'))throw Error('unsafe cleanup');fs.rmSync(dir,{recursive:true,force:true});});return dir;
}
const request=(ip='127.0.0.1',headers={})=>({socket:{remoteAddress:ip},headers});
const user={id:'user-1',username:'audit_test',role:'customer'};
const fixed=()=>new Date('2026-10-23T12:34:56Z');

test('device detection uses available model hints and does not invent a Windows manufacturer',()=>{
  const android=deviceInfo(request('1.1.1.1',{'user-agent':'Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 Chrome/140.0.0.0 Mobile Safari/537.36'}),{model:'SM-S918B'});
  assert.equal(android.brand,'Samsung');assert.equal(android.model,'SM-S918B');assert.equal(android.os,'Android');assert.equal(android.type,'Ponsel');assert.equal(android.browser,'Chrome');
  const windows=deviceInfo(request('',{'user-agent':'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/140.0.0.0 Safari/537.36 Edg/140.0.0.0'}));
  assert.equal(windows.brand,'');assert.equal(windows.os,'Windows');assert.equal(windows.browser,'Microsoft Edge');
  const iphone=deviceInfo(request('',{'user-agent':'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) Version/18.0 Mobile/15E148 Safari/604.1'}));
  assert.equal(iphone.brand,'Apple');assert.equal(iphone.model,'iPhone');assert.equal(iphone.browser,'Safari');
});

test('IP forwarding is ignored unless every traversed proxy is explicitly trusted',()=>{
  const req=request('::ffff:127.0.0.1',{'x-forwarded-for':'8.8.8.8, 9.9.9.9, 10.0.0.2'});
  assert.equal(clientIp(req),'127.0.0.1');
  assert.equal(clientIp(req,['127.0.0.1','10.0.0.2']),'9.9.9.9');
  assert.equal(clientIp(request('127.0.0.1',{'x-forwarded-for':'not-an-ip'}),['127.0.0.1']),'127.0.0.1');
});

test('local addresses never reach GeoIP; lookup failures and unmapped addresses are explicit',()=>{
  let called=0;const lookup=()=>{called++;throw Error('lookup unavailable');};
  for(const ip of ['127.0.0.1','10.2.3.4','192.168.1.1','::1','fd00::1']) assert.equal(approximateLocation(ip,lookup).status,'local');
  assert.equal(called,0);assert.equal(approximateLocation('8.8.8.8',lookup).status,'unknown');
  const place=approximateLocation('8.8.8.8',()=>({country:'ID',city:'Jakarta',region:'JK',ll:[-6.2,106.8]}));
  assert.equal(place.status,'estimated');assert.equal(place.city,'Jakarta');assert.equal('ll' in place,false);
});

test('audit records use server time and survive restart without storing passwords, tokens or GPS',t=>{
  const dir=temp(t),a=createLoginAudit({dataDir:dir,now:fixed,lookup:()=>({country:'ID',city:'Jakarta',ll:[1,2]})});
  assert.equal(a.record(request('8.8.8.8',{'user-agent':'Android Mobile Chrome/140'}),user,{model:'SM-A546E',timeZone:'Asia/Jakarta',password:'never-store-this',sessionToken:'private-token',createdAt:'1999-01-01'}),true);
  const b=createLoginAudit({dataDir:dir,now:fixed});const row=b.list()[0];
  assert.equal(row.createdAt,'2026-10-23T12:34:56.000Z');assert.equal(row.device.brand,'Samsung');assert.equal(row.location.city,'Jakarta');
  const disk=fs.readFileSync(path.join(dir,'login-activity.json'),'utf8');assert.doesNotMatch(disk,/never-store-this|private-token|latitude|longitude|"ll"/);
  assert.equal(a.record(request(),user,null),true);
});

test('logs retain at most 500 entries and exclude records older than 90 days',t=>{
  const dir=temp(t),file=path.join(dir,'login-activity.json');
  const seed=Array.from({length:500},(_,id)=>({id:String(id),username:user.username,role:'customer',createdAt:fixed().toISOString()}));
  fs.writeFileSync(file,JSON.stringify(seed));const a=createLoginAudit({dataDir:dir,now:fixed});a.record(request(),user);
  assert.equal(a.list().length,500);assert.equal(a.list().some(row=>row.id==='499'),false);
  fs.writeFileSync(file,JSON.stringify([{...seed[0],createdAt:'2000-01-01T00:00:00Z'},seed[1]]));
  const b=createLoginAudit({dataDir:dir,now:fixed});assert.equal(b.list().length,1);b.record(request(),user);assert.equal(JSON.parse(fs.readFileSync(file)).length,2);
});

test('damaged audit files are preserved and cannot be silently replaced by a login',t=>{
  const dir=temp(t),file=path.join(dir,'login-activity.json');fs.writeFileSync(file,'{corrupt');const a=createLoginAudit({dataDir:dir,now:fixed});
  assert.equal(a.record(request(),user),false);assert.throws(()=>a.list(),/unavailable/);assert.equal(fs.readFileSync(file,'utf8'),'{corrupt');
});

const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const net = require('node:net');
const geoip = require('geoip-lite');
const MAX_RECORDS = 500;
const RETENTION_MS = 90 * 24 * 60 * 60 * 1000;
const clean = (value, max = 100) => typeof value === 'string' ? value.replace(/[\x00-\x1f\x7f]/g, '').trim().slice(0, max) : '';
function normalizeIp(value) {
  const ip = clean(value).replace(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/i, '$1');
  return net.isIP(ip) ? ip : '';
}
function clientIp(req, proxies = []) {
  const peer = normalizeIp(req.socket?.remoteAddress || '');
  const trusted = new Set(proxies.map(normalizeIp).filter(Boolean));
  if (!trusted.has(peer)) return peer;
  const chain = String(req.headers['x-forwarded-for'] || '').split(',').map(ip => normalizeIp(ip.trim()));
  if (!chain.length || chain.length > 20 || chain.some(ip => !ip)) return peer;
  let current = peer;
  for (let i = chain.length - 1; i >= 0 && trusted.has(current); i--) current = chain[i];
  return current;
}
function localIp(ip) {
  if (net.isIP(ip) === 4) {
    const [a,b,c] = ip.split('.').map(Number);
    return a === 0 || a === 10 || a === 127 || a >= 224 || (a === 100 && b >= 64 && b <= 127) ||
      (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) ||
      (a === 192 && b === 0) || (a === 198 && [18,19].includes(b)) || (a === 198 && b === 51 && c === 100) ||
      (a === 203 && b === 0 && c === 113);
  }
  return !ip || /^(?:::1$|::$|f[cd]|fe[89ab]|ff|2001:db8:)/i.test(ip);
}
function deviceInfo(req, context = {}) {
  const ua = clean(req.headers['user-agent'], 1024);
  const suppliedModel = clean(context.model || req.headers['sec-ch-ua-model'], 80).replace(/^"|"$/g, '');
  const androidModel = ua.match(/Android[^;)]*;\s*(?:[a-z]{2}[-_][a-z]{2};\s*)?([^;)]+?)(?:\s+Build\/[^;)]*)?\)/i)?.[1] || '';
  let model = suppliedModel || (/Android/i.test(ua) ? clean(androidModel,80) : '');
  if (/^(?:K|wv|unknown)$/i.test(model)) model = '';
  let os = /Android/i.test(ua) ? 'Android' : /iPhone|iPad|iPod/i.test(ua) ? 'iOS / iPadOS' : /Windows NT/i.test(ua) ? 'Windows' : /Macintosh|Mac OS X/i.test(ua) ? 'macOS' : /CrOS/i.test(ua) ? 'ChromeOS' : /Linux/i.test(ua) ? 'Linux' : '';
  if (!os && ['Android','Windows','macOS','Linux','Chrome OS','iOS'].includes(context.platform)) os = context.platform;
  let brand = /iPhone|iPad|iPod|Macintosh/i.test(ua) ? 'Apple' : /^(?:SM-|GT-|SCH-|SAMSUNG)/i.test(model) ? 'Samsung' : /^(?:Pixel|Nexus)/i.test(model) ? 'Google' : /^(?:Redmi|POCO|Mi\s|Xiaomi)/i.test(model) ? 'Xiaomi' : /^OPPO/i.test(model) ? 'OPPO' : /^vivo/i.test(model) ? 'vivo' : /^realme/i.test(model) ? 'realme' : /^OnePlus/i.test(model) ? 'OnePlus' : /^(?:HUAWEI|HONOR)/i.test(model) ? model.split(/[\s-]/)[0] : '';
  if (!model && /iPhone/i.test(ua)) model = 'iPhone';
  if (!model && /iPad/i.test(ua)) model = 'iPad';
  const type = /iPad|Tablet/i.test(ua) || (/Android/i.test(ua) && !/Mobile/i.test(ua)) ? 'Tablet' : /Mobile|iPhone|iPod/i.test(ua) || context.mobile === true ? 'Ponsel' : os ? 'Komputer' : 'Perangkat';
  const browser = /Edg(?:e|A|iOS)?\//i.test(ua) ? 'Microsoft Edge' : /OPR\//i.test(ua) ? 'Opera' : /SamsungBrowser\//i.test(ua) ? 'Samsung Internet' : /Firefox\/|FxiOS\//i.test(ua) ? 'Firefox' : /Chrome\/|CriOS\//i.test(ua) ? 'Chrome' : /Safari\//i.test(ua) ? 'Safari' : 'Browser tidak diketahui';
  return { brand, model, type, os:os || 'Sistem tidak diketahui', browser, source:'browser' };
}
function approximateLocation(ip, lookup) {
  if (!ip) return { status:'unknown', city:'', region:'', country:'', source:'ip' };
  if (localIp(ip)) return { status:'local', city:'', region:'', country:'', source:'ip' };
  try {
    const place = lookup(ip);
    if (place && /^[A-Z]{2}$/.test(place.country)) return { status:'estimated', city:clean(place.city), region:clean(place.region), country:place.country, source:'ip' };
  } catch (_) {}
  return { status:'unknown', city:'', region:'', country:'', source:'ip' };
}
function createLoginAudit({ dataDir, proxies = [], lookup = ip => geoip.lookup(ip), now = () => new Date() }) {
  const file = path.join(dataDir,'login-activity.json');
  let records = [], healthy = true;
  try {
    const stored = JSON.parse(fs.readFileSync(file,'utf8'));
    if (!Array.isArray(stored) || stored.length > MAX_RECORDS || stored.some(row => !row || typeof row.id !== 'string' || typeof row.username !== 'string' || !Number.isFinite(Date.parse(row.createdAt)) || !['admin','customer'].includes(row.role))) throw new Error('invalid login activity');
    records = stored;
  } catch (error) { if (error.code !== 'ENOENT') { healthy = false; console.error('Login activity storage unavailable; preserve login-activity.json.'); } }
  const recent = () => records.filter(row => Date.parse(row.createdAt) >= now().getTime()-RETENTION_MS).slice(0,MAX_RECORDS);
  return {
    record(req, user, context = {}, action = 'login') {
      if (!healthy) return false;
      context = context && typeof context === 'object' && !Array.isArray(context) ? context : {};
      const ip = clientIp(req,proxies);
      let timeZone = clean(context.timeZone,80);
      try { if (timeZone) new Intl.DateTimeFormat('id-ID',{timeZone}); } catch (_) { timeZone = ''; }
      const row = { id:crypto.randomUUID(), userId:clean(user.id), username:clean(user.username,32), role:user.role === 'admin'?'admin':'customer', action:action === 'register'?'register':'login', createdAt:now().toISOString(), device:deviceInfo(req,context), timeZone, ip, location:approximateLocation(ip,lookup) };
      const next = [row,...recent()].slice(0,MAX_RECORDS), temp = `${file}.${crypto.randomUUID()}.tmp`;
      try {
        fs.writeFileSync(temp,JSON.stringify(next),{encoding:'utf8',flag:'wx',mode:0o600});
        fs.renameSync(temp,file); try { fs.chmodSync(file,0o600); } catch (_) {}
        records = next; return true;
      } catch (_) { healthy = false; try { fs.unlinkSync(temp); } catch (_) {} console.error('Login activity could not be saved.'); return false; }
    },
    list() { if (!healthy) { const error = new Error('login activity unavailable'); error.status = 503; throw error; } return JSON.parse(JSON.stringify(recent())); }
  };
}
module.exports = { createLoginAudit, deviceInfo, clientIp, localIp, approximateLocation };

'use strict';
const fs = require('node:fs/promises');
const path = require('node:path');
const os = require('node:os');
const { Writable } = require('node:stream');
process.env.OOMNI_CLOUD_HANDLER = '1';
const { createApplication } = require('../server');
const { Pool } = require('pg');
const pool = new Pool({ connectionString: process.env.DATABASE_URL, max: 3, connectionTimeoutMillis: 10000, idleTimeoutMillis: 10000 });
let initialized;
function initialize() {
  return initialized ||= pool.query(`CREATE TABLE IF NOT EXISTS oomni_runtime (id integer PRIMARY KEY CHECK (id = 1), files jsonb NOT NULL, security jsonb NOT NULL)`)
    .then(() => pool.query(`INSERT INTO oomni_runtime VALUES (1, '{}'::jsonb, '{}'::jsonb) ON CONFLICT DO NOTHING`))
    .catch(error => { initialized = undefined; throw error; });
}
function validFile(name) {
  return ['store.json','accounts.json','login-activity.json','gemini-api-key'].includes(name) || /^brand-uploads\/[a-f0-9-]+\.(png|jpg|webp)$/.test(name);
}
async function restore(directory, files) {
  for (const [name, content] of Object.entries(files)) {
    if (!validFile(name) || typeof content !== 'string') throw new Error('Invalid persisted file');
    const target = path.join(directory, name);
    await fs.mkdir(path.dirname(target), { recursive:true, mode:0o700 });
    await fs.writeFile(target, Buffer.from(content, 'base64'), { mode:0o600 });
  }
}
async function snapshot(directory) {
  const files = {};
  async function visit(relative = '') {
    for (const entry of await fs.readdir(path.join(directory, relative), { withFileTypes:true })) {
      const name = relative ? `${relative}/${entry.name}` : entry.name;
      if (entry.isDirectory() && name === 'brand-uploads') await visit(name);
      else if (entry.isFile() && validFile(name)) files[name] = (await fs.readFile(path.join(directory,name))).toString('base64');
    }
  }
  await visit();
  return files;
}
class BufferedResponse extends Writable {
  constructor() { super(); this.statusCode=200; this.headers={}; this.chunks=[]; this.headersSent=false; }
  setHeader(name,value) { this.headers[name.toLowerCase()]=value; }
  getHeader(name) { return this.headers[name.toLowerCase()]; }
  removeHeader(name) { delete this.headers[name.toLowerCase()]; }
  writeHead(status, headers) { this.statusCode=status; for(const [k,v] of Object.entries(headers || {})) this.setHeader(k,v); this.headersSent=true; return this; }
  _write(chunk, encoding, done) { this.chunks.push(Buffer.from(chunk)); done(); }
}
async function invoke(app, req) {
  const response = new BufferedResponse();
  await new Promise((resolve,reject) => { response.once('finish',resolve); response.once('error',reject); const handler=app.listeners('request')[0]; Promise.resolve(handler(req,response)).catch(reject); });
  return response;
}
module.exports = async function handler(req,res) {
  let client, directory;
  try {
    if (!process.env.DATABASE_URL) throw new Error('Database configuration missing');
    await initialize();
    directory = await fs.mkdtemp(path.join(os.tmpdir(),'oomni-'));
    client = await pool.connect();
    await client.query('BEGIN');
    // One locked state row preserves the existing single-writer semantics across instances.
    const { rows } = await client.query('SELECT files, security FROM oomni_runtime WHERE id=1 FOR UPDATE');
    const current = rows[0];
    await restore(directory,current.files);
    const app = createApplication({ dataDir:directory, security:current.security });
    const result = await invoke(app,req);
    const files = await snapshot(directory);
    await client.query('UPDATE oomni_runtime SET files=$1::jsonb, security=$2::jsonb WHERE id=1', [JSON.stringify(files),JSON.stringify(app.securitySnapshot())]);
    await client.query('COMMIT');
    res.writeHead(result.statusCode,result.headers);
    res.end(Buffer.concat(result.chunks));
  } catch(error) {
    if(client) await client.query('ROLLBACK').catch(()=>{});
    console.error('OomniMarket request failed:',error.code || error.message);
    if(!res.headersSent) { res.writeHead(503,{'Content-Type':'application/json','Cache-Control':'no-store'}); res.end(JSON.stringify({error:'Layanan sementara tidak tersedia. Silakan coba lagi.'})); }
  } finally {
    if(client) client.release();
    if(directory) await fs.rm(directory,{recursive:true,force:true}).catch(()=>{});
  }
};
module.exports._test = { validFile, restore, snapshot, invoke, BufferedResponse };

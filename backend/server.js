
const express = require('express');
const fs = require('fs');
const path = require('path');
const { exec } = require('child_process');

const app = express();
app.use(express.json());
app.use(express.static(path.join(__dirname, '..', 'frontend')));

const CONFIG_DIR = '/config';
const ACCOUNTS_FILE = path.join(CONFIG_DIR, 'accounts.json');
const SCHEDULE_FILE = path.join(CONFIG_DIR, 'schedule.json');
const LOG_DIR = '/data/logs';

function ensureFile(file, fallback){
  if(!fs.existsSync(file)) fs.writeFileSync(file, JSON.stringify(fallback, null, 2));
  try { return JSON.parse(fs.readFileSync(file, 'utf8') || 'null') || fallback; } catch(e){ return fallback; }
}
function saveJSON(file, data){ fs.writeFileSync(file, JSON.stringify(data, null, 2)); }
function listAccounts(){ return ensureFile(ACCOUNTS_FILE, { accounts: [] }); }
function upsertAccount(acc){
  const cfg = listAccounts();
  const idx = cfg.accounts.findIndex(a => a.name === acc.name);
  if(idx >= 0) cfg.accounts[idx] = acc; else cfg.accounts.push(acc);
  saveJSON(ACCOUNTS_FILE, cfg);
  return cfg;
}
function deleteAccount(name){
  const cfg = listAccounts();
  const out = { accounts: cfg.accounts.filter(a => a.name !== name) };
  saveJSON(ACCOUNTS_FILE, out);
  return out;
}
function buildRcloneCmd(acc, mode='sync'){
  const yearFolder = acc.yearFolder ? (new Date().getFullYear().toString()) : '';
  const baseDst = (acc.destPath || '/data/backups').replace(/\/g,'/');
  const dst = yearFolder ? path.posix.join(baseDst, yearFolder) : baseDst;
  const src = `${acc.remote}:media/all`;
  if(acc.cryptRemote && acc.cryptRemote.trim().length>0){
    const cryptPath = (acc.cryptPath && acc.cryptPath.trim().length>0) ? acc.cryptPath.trim() : '/';
    const dstRemote = `${acc.cryptRemote}:${cryptPath === '/' ? '' : cryptPath}` + (yearFolder?`/${yearFolder}`:'');
    return `rclone ${mode} ${src} ${dstRemote} --fast-list --create-empty-src-dirs --config=/config/rclone.conf --log-file=${path.posix.join(LOG_DIR, acc.name + '.log')} --use-json-log --stats=30s`;
  }
  return `rclone ${mode} ${src} ${dst} --fast-list --create-empty-src-dirs --config=/config/rclone.conf --log-file=${path.posix.join(LOG_DIR, acc.name + '.log')} --use-json-log --stats=30s`;
}
function run(cmd){ return new Promise(r => exec(cmd, {maxBuffer:1024*1024*20}, (e,so,se)=> r({ok:!e, out: so+se}))); }

// Healthcheck
app.get('/health', (req,res)=> res.json({ok:true}));

// API
app.get('/api/config', (req,res)=>{
  res.json({ accounts: listAccounts().accounts, schedule: ensureFile(SCHEDULE_FILE, { entries: [] }) });
});
app.post('/api/accounts', (req,res)=>{
  const { name, remote, destPath, yearFolder, cryptRemote, cryptPath } = req.body || {};
  if(!name || !remote || !destPath) return res.status(400).json({ ok:false, msg:'name, remote, destPath là bắt buộc' });
  const acc = { name, remote, destPath, yearFolder: !!yearFolder, cryptRemote: cryptRemote||'', cryptPath: cryptPath||'' };
  const data = upsertAccount(acc);
  res.json({ ok:true, accounts: data.accounts });
});
app.delete('/api/accounts/:name', (req,res)=>{
  const data = deleteAccount(req.params.name);
  res.json({ ok:true, accounts: data.accounts });
});
app.post('/api/sync', async (req,res)=>{
  const { account, mode } = req.body || {};
  const cfg = listAccounts();
  const acc = cfg.accounts.find(a => a.name === account);
  if(!acc) return res.status(404).json({ ok:false, msg:'Không tìm thấy account' });
  const cmd = buildRcloneCmd(acc, mode==='copy'?'copy':'sync');
  const result = await run(cmd);
  res.json({ ok: result.ok, cmd, log: result.out });
});
app.get('/api/logs', (req,res)=>{
  const { account } = req.query;
  if(!account) return res.status(400).send('Thiếu account');
  const f = path.join(LOG_DIR, account + '.log');
  if(!fs.existsSync(f)) return res.send('Chưa có log');
  res.send(fs.readFileSync(f,'utf8'));
});
app.get('/api/restore', (req,res)=>{
  const dir = req.query.dir || '/data';
  try{
    const entries = fs.readdirSync(dir, {withFileTypes:true}).map(d=>({name:d.name, dir:d.isDirectory()}));
    res.json({ ok:true, dir, entries });
  }catch(e){ res.status(400).json({ ok:false, msg:e.message }); }
});
app.get('/api/rclone-url', (req,res)=> res.json({ url: `${req.protocol}://${req.hostname}:5573` }));
app.post('/api/schedule', (req,res)=>{ const body = req.body || { entries: [] }; saveJSON(SCHEDULE_FILE, body); res.json({ ok:true }); });

function scheduleLoop(){
  const sched = ensureFile(SCHEDULE_FILE, { entries: [] });
  const now = new Date();
  const hh = String(now.getHours()).padStart(2,'0');
  const mm = String(now.getMinutes()).padStart(2,'0');
  const key = `${now.getFullYear()}-${now.getMonth()}-${now.getDate()}-${hh}:${mm}`;
  if(!global.__lastRun) global.__lastRun = new Set();
  for(const ent of sched.entries){
    if(!ent.enabled || !ent.account) continue;
    const cfg = listAccounts();
    const acc = cfg.accounts.find(a=>a.name===ent.account);
    if(!acc) continue;
    const when = `${hh}:${mm}`;
    if(ent.type==='daily'){
      if(ent.time===when && !global.__lastRun.has(acc.name+'@'+key)){
        exec(buildRcloneCmd(acc, ent.mode==='copy'?'copy':'sync'));
        global.__lastRun.add(acc.name+'@'+key);
      }
    } else if(ent.type==='weekly'){
      const dw = now.getDay();
      if(Array.isArray(ent.days) && ent.days.includes(dw) && ent.time===when && !global.__lastRun.has(acc.name+'@'+key)){
        exec(buildRcloneCmd(acc, ent.mode==='copy'?'copy':'sync'));
        global.__lastRun.add(acc.name+'@'+key);
      }
    }
  }
}
setInterval(scheduleLoop, 15000);

const PORT = 5572;
app.listen(PORT, ()=>{
  if(!fs.existsSync(LOG_DIR)) fs.mkdirSync(LOG_DIR, { recursive:true });
  ensureFile(ACCOUNTS_FILE, { accounts: [] });
  ensureFile(SCHEDULE_FILE, { entries: [] });
  console.log('UI running on :'+PORT);
});

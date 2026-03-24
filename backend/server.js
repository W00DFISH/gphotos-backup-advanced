const express=require('express');
const fs=require('fs');
const path=require('path');
const {exec}=require('child_process');

const app=express();
app.use(express.json());
app.use(express.static(path.join(__dirname,'..','frontend')));

const CONFIG_DIR='/config';
const ACCOUNTS_FILE=path.join(CONFIG_DIR,'accounts.json');
const SCHEDULE_FILE=path.join(CONFIG_DIR,'schedule.json');
const LOG_DIR='/data/logs';

function ensureFile(f,fb){ if(!fs.existsSync(f)) fs.writeFileSync(f,JSON.stringify(fb,null,2)); try{ return JSON.parse(fs.readFileSync(f,'utf8')||'null')||fb; }catch(e){ return fb; } }
function saveJSON(f,d){ fs.writeFileSync(f, JSON.stringify(d,null,2)); }
function listAccounts(){ return ensureFile(ACCOUNTS_FILE,{accounts:[]}); }
function upsertAccount(a){ const cfg=listAccounts(); const i=cfg.accounts.findIndex(x=>x.name===a.name); if(i>=0) cfg.accounts[i]=a; else cfg.accounts.push(a); saveJSON(ACCOUNTS_FILE,cfg); return cfg; }
function deleteAccount(n){ const cfg=listAccounts(); const out={accounts: cfg.accounts.filter(x=>x.name!==n)}; saveJSON(ACCOUNTS_FILE,out); return out; }

function buildRcloneCmd(a,mode='sync'){
  const year=a.yearFolder?(new Date().getFullYear()+'' ):'';
  const base=(a.destPath||'/data/backups').replace(/\/g,'/');
  const dst=year?path.posix.join(base,year):base;
  const src=`${a.remote}:media/all`;
  if(a.cryptRemote && a.cryptRemote.trim().length>0){
    const cryptPath=(a.cryptPath && a.cryptPath.trim().length>0 ? a.cryptPath.trim() : '/');
    const dstRemote=`${a.cryptRemote}:${cryptPath==='/'?'':cryptPath}` + (year?`/${year}`:'');
    return `rclone ${mode} ${src} ${dstRemote} --fast-list --create-empty-src-dirs --config=/config/rclone.conf --log-file=${path.posix.join(LOG_DIR,a.name+'.log')} --use-json-log --stats=30s`;
  }
  return `rclone ${mode} ${src} ${dst} --fast-list --create-empty-src-dirs --config=/config/rclone.conf --log-file=${path.posix.join(LOG_DIR,a.name+'.log')} --use-json-log --stats=30s`;
}

function run(cmd){ return new Promise(r=>exec(cmd,{maxBuffer:1024*1024*20},(e,so,se)=>r({ok:!e,out:so+se}))); }

// Health
app.get('/health', (req,res)=> res.json({ok:true}));

// API
app.get('/api/config',(req,res)=>{
  res.json({accounts:listAccounts().accounts, schedule: ensureFile(SCHEDULE_FILE,{entries:[]})});
});
app.post('/api/accounts',(req,res)=>{
  const {name,remote,destPath,yearFolder,cryptRemote,cryptPath}=req.body||{};
  if(!name||!remote||!destPath) return res.status(400).json({ok:false,msg:'name, remote, destPath là bắt buộc'});
  const a={name,remote,destPath,yearFolder:!!yearFolder,cryptRemote:cryptRemote||'',cryptPath:cryptPath||''};
  res.json({ok:true,accounts:upsertAccount(a).accounts});
});
app.delete('/api/accounts/:name',(req,res)=> res.json({ok:true,accounts:deleteAccount(req.params.name).accounts}));
app.post('/api/sync', async (req,res)=>{
  const {account,mode}=req.body||{};
  const cfg=listAccounts();
  const a=cfg.accounts.find(x=>x.name===account);
  if(!a) return res.status(404).json({ok:false,msg:'Không tìm thấy account'});
  const cmd=buildRcloneCmd(a, mode==='copy'?'copy':'sync');
  const rs=await run(cmd);
  res.json({ok:rs.ok, cmd, log:rs.out});
});
app.get('/api/logs',(req,res)=>{
  const a=req.query.account; if(!a) return res.status(400).send('Thiếu account');
  const f=path.join(LOG_DIR,a+'.log'); if(!fs.existsSync(f)) return res.send('Chưa có log');
  res.send(fs.readFileSync(f,'utf8'));
});
app.get('/api/restore',(req,res)=>{
  const d=req.query.dir||'/data';
  try{ const es=fs.readdirSync(d,{withFileTypes:true}).map(x=>({name:x.name,dir:x.isDirectory()})); res.json({ok:true,dir:d,entries:es}); }
  catch(e){ res.status(400).json({ok:false,msg:e.message}); }
});
app.get('/api/rclone-url',(req,res)=> res.json({url:`${req.protocol}://${req.hostname}:5573`}));
app.post('/api/schedule',(req,res)=>{ const body=req.body||{entries:[]}; saveJSON(SCHEDULE_FILE,body); res.json({ok:true}); });

function scheduleLoop(){
  const sch=ensureFile(SCHEDULE_FILE,{entries:[]});
  const now=new Date();
  const hh=String(now.getHours()).padStart(2,'0');
  const mm=String(now.getMinutes()).padStart(2,'0');
  const key=`${now.getFullYear()}-${now.getMonth()}-${now.getDate()}-${hh}:${mm}`;
  if(!global.__lr) global.__lr=new Set();
  for(const e of sch.entries){
    if(!e.enabled||!e.account) continue;
    const cfg=listAccounts();
    const a=cfg.accounts.find(x=>x.name===e.account);
    if(!a) continue;
    if(e.type==='daily'){
      if(e.time===`${hh}:${mm}` && !global.__lr.has(a.name+'@'+key)){
        exec(buildRcloneCmd(a, e.mode==='copy'?'copy':'sync'));
        global.__lr.add(a.name+'@'+key);
      }
    } else if(e.type==='weekly'){
      const dw=now.getDay();
      if(Array.isArray(e.days)&&e.days.includes(dw)&&e.time===`${hh}:${mm}` && !global.__lr.has(a.name+'@'+key)){
        exec(buildRcloneCmd(a, e.mode==='copy'?'copy':'sync'));
        global.__lr.add(a.name+'@'+key);
      }
    }
  }
}
setInterval(scheduleLoop,15000);

const PORT=5572;
app.listen(PORT, ()=>{
  if(!fs.existsSync(LOG_DIR)) fs.mkdirSync(LOG_DIR,{recursive:true});
  ensureFile(ACCOUNTS_FILE,{accounts:[]});
  ensureFile(SCHEDULE_FILE,{entries:[]});
  console.log('UI running on :'+PORT);
});

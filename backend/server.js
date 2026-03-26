/**
 * gphotos-backup-advanced - v2.6
 * Tính năng mới (v2.6): Google OAuth redirect flow — user bấm link, app tự nhận token và ghi rclone.conf
 */
const express = require('express');
const fs = require('fs');
const path = require('path');
const { exec, spawn } = require('child_process');
const util = require('util');
const execPromise = util.promisify(exec);

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
  const baseDst = (acc.destPath || '/data/backups').replace(/\\/g,'/');
  const dst = yearFolder ? path.posix.join(baseDst, yearFolder) : baseDst;
  const src = `${acc.remote}:media/all`;
  if(acc.cryptRemote && acc.cryptRemote.trim().length>0){
    const cryptPath = (acc.cryptPath && acc.cryptPath.trim().length>0) ? acc.cryptPath.trim() : '/';
    const dstRemote = `${acc.cryptRemote}:${cryptPath === '/' ? '' : cryptPath}` + (yearFolder?`/${yearFolder}`:'');
    return `rclone ${mode} ${src} ${dstRemote} --fast-list --create-empty-src-dirs --config=/config/rclone.conf --log-file=${path.posix.join(LOG_DIR, acc.name + '.log')} --use-json-log --stats=30s`;
  }
  return `rclone ${mode} ${src} ${dst} --fast-list --create-empty-src-dirs --config=/config/rclone.conf --log-file=${path.posix.join(LOG_DIR, acc.name + '.log')} --use-json-log --stats=30s`;
}
async function runBgJob(acc, mode='sync') {
  if (!global.activeJobs) global.activeJobs = {};
  if (global.activeJobs[acc.name]) return { ok: false, msg: 'Tiến trình cũ đang chạy, bỏ qua.' };
  
  try {
     const stat = fs.statfsSync('/data');
     const freeGB = (stat.bavail * stat.bsize) / (1024*1024*1024);
     const globalMin = listAccounts().globalMinGB || 5;
     if (freeGB < globalMin) {
        return { ok: false, msg: `KHÔNG THỂ CHẠY: Dung lượng trống toàn cục NAS (${freeGB.toFixed(2)} GB) thấp hơn mốc an toàn (${globalMin} GB).` };
     }
  } catch(e) {}
  
  if (acc.maxQuotaGB && acc.maxQuotaGB > 0) {
      const dest = acc.destPath || '/data/backups';
      if (fs.existsSync(dest)) {
         try {
             const { stdout } = await execPromise(`du -sk "${dest}"`);
             const kb = parseInt(stdout.split('\t')[0]);
             const folderGB = kb / (1024*1024);
             if (folderGB >= acc.maxQuotaGB) {
                 return { ok: false, msg: `CẤM CHẠY: Thư mục account này đã dùng ${folderGB.toFixed(2)} GB, vượt quá Quota cho phép (${acc.maxQuotaGB} GB).` };
             }
         } catch(e) {}
      }
  }

  const cmd = buildRcloneCmd(acc, mode);

  // Tự động tạo thư mục đích trên NAS trước khi chạy rclone (fix: DSM không thấy folder mới)
  const destToCreate = (acc.destPath || '/data/backups').replace(/\\/g, '/');
  try { fs.mkdirSync(destToCreate, { recursive: true }); } catch(e) {}
  if (acc.yearFolder) {
    try { fs.mkdirSync(path.posix.join(destToCreate, new Date().getFullYear().toString()), { recursive: true }); } catch(e) {}
  }

  // Ghi log báo hiệu cho Web App
  try {
     const logFile = path.posix.join(LOG_DIR, acc.name + '.log');
     fs.appendFileSync(logFile, `{"time":"${new Date().toISOString()}","level":"info","msg":"[Web App] Đã ra lệnh bắt đầu tiến trình Rclone ${mode}. Đang quét máy chủ Cloud để dò tìm file (Nếu acc Google không có ảnh thì sẽ không có gì tải về)..."}\n`);
  } catch(e) {}

  const child = spawn(cmd, { shell: true, stdio: 'ignore' });
  global.activeJobs[acc.name] = child;
  
  child.on('exit', () => { 
     delete global.activeJobs[acc.name]; 
     try { fs.appendFileSync(path.posix.join(LOG_DIR, acc.name + '.log'), `{"time":"${new Date().toISOString()}","level":"info","msg":"[Web App] Tiến trình Rclone đã KẾT THÚC."}\n`); } catch(e){}
  });
  child.on('error', () => { delete global.activeJobs[acc.name]; });
  
  return { ok: true, msg: 'Đã tạo tiến trình ngầm' };
}

// Healthcheck
app.get('/health', (req,res)=> res.json({ok:true}));

// API
app.get('/api/config', (req,res)=>{
  const cfg = listAccounts();
  res.json({ accounts: cfg.accounts, globalMinGB: cfg.globalMinGB, schedule: ensureFile(SCHEDULE_FILE, { entries: [] }) });
});
app.get('/api/rclone-remotes', async (req,res)=>{
  try {
    const { stdout } = await execPromise('rclone listremotes --config=/config/rclone.conf');
    const remotes = stdout.split('\n').map(r=>r.trim()).filter(r=>r.endsWith(':')).map(r=>r.slice(0,-1));
    res.json({ ok:true, remotes });
  } catch(e) {
    res.json({ ok:false, remotes: [] });
  }
});
app.post('/api/accounts', (req,res)=>{
  const { name, remote, destPath, yearFolder, cryptRemote, cryptPath, maxQuotaGB } = req.body || {};
  if(!name || !remote || !destPath) return res.status(400).json({ ok:false, msg:'name, remote, destPath là bắt buộc' });
  const acc = { name, remote, destPath, yearFolder: !!yearFolder, cryptRemote: cryptRemote||'', cryptPath: cryptPath||'', maxQuotaGB: parseFloat(maxQuotaGB)||0 };
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
  const result = await runBgJob(acc, mode==='copy'?'copy':'sync');
  res.json({ ok: result.ok, msg: result.msg });
});
app.get('/api/logs', (req,res)=>{
  const { account } = req.query;
  if(!account) return res.status(400).send('Thiếu account');
  const f = path.join(LOG_DIR, account + '.log');
  if(!fs.existsSync(f)) return res.send('Chưa có log');
  res.send(fs.readFileSync(f,'utf8'));
});

// Trả về N dòng cuối của log (dùng cho auto-refresh polling)
app.get('/api/logs/tail', (req,res)=>{
  const { account, lines } = req.query;
  if(!account) return res.status(400).json({ ok:false });
  const f = path.join(LOG_DIR, account + '.log');
  if(!fs.existsSync(f)) return res.json({ ok:true, content:'Chưa có log cho account này.', running: false });
  const all = fs.readFileSync(f,'utf8');
  const n = parseInt(lines)||100;
  const tail = all.split('\n').filter(Boolean).slice(-n).join('\n');
  const isRunning = !!(global.activeJobs && global.activeJobs[account]);
  res.json({ ok:true, content: tail, running: isRunning });
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

// ===========================================================================
// GOOGLE OAUTH - TERMINAL EMULATOR FLOW
// ===========================================================================
if (!global.rcloneAuthState) {
  global.rcloneAuthState = { status: 'idle', output: '', remoteName: null, readOnly: true };
}

// Khởi động tiến trình rclone authorize, stream output vào global state
app.post('/api/rclone-authorize', (req, res) => {
  const { remoteName, readOnly } = req.body || {};
  if (!remoteName) return res.status(400).json({ ok: false, msg: 'Thiếu remoteName' });

  // Kill phiên cũ nếu còn
  try { if (global.rcloneAuthChild) global.rcloneAuthChild.kill(); } catch(e) {}

  global.rcloneAuthState = { status: 'running', output: '$ rclone authorize "google photos" --auth-no-open-browser\n', remoteName, readOnly: !!readOnly };

  const child = spawn('rclone', ['authorize', 'google photos', '--auth-no-open-browser', '--config=/config/rclone.conf'], { shell: false });
  global.rcloneAuthChild = child;

  function onData(chunk) {
    global.rcloneAuthState.output += chunk.toString();
  }
  child.stdout.on('data', onData);
  child.stderr.on('data', onData);

  child.on('exit', () => {
    global.rcloneAuthState.status = 'done';
    global.rcloneAuthState.output += '\n[Tiến trình đã kết thúc]\n';
  });
  child.on('error', (e) => {
    global.rcloneAuthState.status = 'error';
    global.rcloneAuthState.output += `\n[LỖI: ${e.message}]\n`;
  });

  res.json({ ok: true });
});

// Frontend poll output này mỗi 1s để hiển thị terminal giả
app.get('/api/rclone-auth-output', (req, res) => {
  const s = global.rcloneAuthState || { status: 'idle', output: '' };
  res.json({ ok: true, status: s.status, output: s.output, remoteName: s.remoteName });
});

// Reset
app.post('/api/rclone-auth-reset', (req, res) => {
  try { if (global.rcloneAuthChild) global.rcloneAuthChild.kill(); } catch(e) {}
  global.rcloneAuthState = { status: 'idle', output: '', remoteName: null, readOnly: true };
  res.json({ ok: true });
});

// [Legacy] Vẫn giữ lại để tương thích nếu cần paste token thủ công
app.post('/api/rclone-token-import', async (req, res) => {
  const { remoteName, token, readOnly } = req.body || {};
  if (!remoteName || !token) return res.status(400).json({ ok: false, msg: 'Thiếu remoteName hoặc token' });
  try {
    const ro = readOnly ? 'true' : 'false';
    JSON.parse(token);
    await execPromise(`rclone config create "${remoteName}" "google photos" read_only=${ro} token=${JSON.stringify(token)} --config=/config/rclone.conf`);
    res.json({ ok: true, msg: `✅ Remote "${remoteName}" đã được tạo thành công!` });
  } catch(e) {
    res.status(500).json({ ok: false, msg: e.message });
  }
});


app.post('/api/settings', (req, res) => {
  const cfg = listAccounts();
  cfg.globalMinGB = parseFloat(req.body.globalMinGB) || 0;
  saveJSON(ACCOUNTS_FILE, cfg);
  res.json({ ok:true });
});

app.get('/api/remote-size', async (req,res) => {
   const { account } = req.query;
   const cfg = listAccounts();
   const accIndex = cfg.accounts.findIndex(a => a.name === account);
   if (accIndex < 0) return res.status(404).json({ ok:false, msg:'Không tìm thấy account' });
   try {
      const src = `${cfg.accounts[accIndex].remote}:media/all`;
      const { stdout } = await execPromise(`rclone size ${src} --config=/config/rclone.conf --json`);
      const data = JSON.parse(stdout);
      const gb = (data.bytes / (1024*1024*1024)).toFixed(2);
      
      cfg.accounts[accIndex].lastSizeGB = gb;
      cfg.accounts[accIndex].lastFileCount = data.count;
      saveJSON(ACCOUNTS_FILE, cfg);
      
      res.json({ ok: true, sizeGB: gb, count: data.count });
   } catch(e) {
      res.status(500).json({ ok: false, msg: e.message });
   }
});

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
        runBgJob(acc, ent.mode==='copy'?'copy':'sync');
        global.__lastRun.add(acc.name+'@'+key);
      }
    } else if(ent.type==='weekly'){
      const dw = now.getDay();
      if(Array.isArray(ent.days) && ent.days.includes(dw) && ent.time===when && !global.__lastRun.has(acc.name+'@'+key)){
        runBgJob(acc, ent.mode==='copy'?'copy':'sync');
        global.__lastRun.add(acc.name+'@'+key);
      }
    }
  }
}
setInterval(scheduleLoop, 15000);

setInterval(() => {
  if (global.activeJobs && Object.keys(global.activeJobs).length > 0) {
    try {
      const stat = fs.statfsSync('/data');
      const freeGB = (stat.bavail * stat.bsize) / (1024*1024*1024);
      const globalMin = listAccounts().globalMinGB || 5;
      if (freeGB < globalMin) {
        for (const [name, child] of Object.entries(global.activeJobs)) {
          if (child && typeof child.kill === 'function') {
            child.kill('SIGKILL');
            const logFile = path.posix.join(LOG_DIR, name + '.log');
            fs.appendFileSync(logFile, `\n\n[HỆ THỐNG] DUNG LƯỢNG NAS CÒN DƯỚI MỨC AN TOÀN (${globalMin}GB). TIẾN TRÌNH RỒNG BỘ ĐÃ BỊ HỦY!\n`);
          }
        }
        global.activeJobs = {};
      }
    } catch(e) {}
  }
}, 30000);

const PORT = 5572;
app.listen(PORT, ()=>{
  if(!fs.existsSync(LOG_DIR)) fs.mkdirSync(LOG_DIR, { recursive:true });
  ensureFile(ACCOUNTS_FILE, { accounts: [] });
  ensureFile(SCHEDULE_FILE, { entries: [] });
  console.log('UI running on :'+PORT);
});

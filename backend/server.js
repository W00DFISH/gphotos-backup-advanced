/**
 * gphotos-backup-advanced - v2.8
 * v2.8: Multi-remote setup — Google Drive, OneDrive Personal/Business support
 */
const express = require('express');
const fs = require('fs');
const path = require('path');
const http = require('http');
const { exec, spawn } = require('child_process');
const util = require('util');
const execPromise = util.promisify(exec);

const app = express();
app.use(express.json());

// Proxy /rclone-oauth/* → http://127.0.0.1:53682/* (rclone auth server nội bộ Docker)
// Giúp browser không cần expose port 53682 ra ngoài
app.all('/rclone-oauth/*', (req, res) => {
  const upstreamPath = req.url.replace('/rclone-oauth', '') || '/';
  if (global.rcloneAuthState) {
    global.rcloneAuthState.output += `\\n[PROXY-DEBUG] Trình duyệt vừa gửi URL: ${upstreamPath}\\n`;
  }
  
  const options = {
    hostname: '127.0.0.1',
    port: 53682,
    path: upstreamPath,
    method: req.method,
    headers: { ...req.headers, host: '127.0.0.1:53682' },
    timeout: 5000 // 5 giây timeout d\u1ef1 ph\u00f2ng
  };
  
  const proxy = http.request(options, (proxyRes) => {
    if (global.rcloneAuthState) global.rcloneAuthState.output += `[PROXY-DEBUG] Rclone tr\u1ea3 l\u1eddi HTTP ${proxyRes.statusCode}\\n`;
    res.writeHead(proxyRes.statusCode, proxyRes.headers);
    proxyRes.pipe(res, { end: true });
  });
  
  proxy.on('timeout', () => {
    if (global.rcloneAuthState) global.rcloneAuthState.output += `[PROXY-DEBUG] Rclone kh\u00f4ng tr\u1ea3 l\u1eddi (Timeout)\\n`;
    proxy.destroy();
    if (!res.headersSent) res.status(504).send('Gateway Timeout');
  });
  
  proxy.on('error', (e) => {
    if (global.rcloneAuthState) global.rcloneAuthState.output += `[PROXY-DEBUG] L\u1ed7i n\u1ed1i \u0111\u1ebfn rclone: ${e.message}\\n`;
    if (!res.headersSent) res.status(502).send('rclone auth server ch\u01b0a s\u1eb5n s\u00e0ng ho\u1eb7c \u0111\u00e3 tho\u00e1t. L\u1ed7i: ' + e.message);
  });
  
  req.pipe(proxy, { end: true });
});

app.use(express.static(path.join(__dirname, '..', 'frontend')));


const CONFIG_DIR = '/config';
const ACCOUNTS_FILE = path.join(CONFIG_DIR, 'accounts.json');
const SCHEDULE_FILE = path.join(CONFIG_DIR, 'schedule.json');
const LOG_DIR = '/data/logs';

function ensureFile(file, fallback){
  if(!fs.existsSync(file)) fs.writeFileSync(file, JSON.stringify(fallback, null, 2));
  try { return JSON.parse(fs.readFileSync(file, 'utf8') || 'null') || fallback; } catch(e){ return fallback; }
}
function getGMT7() {
  return new Date().toLocaleString('en-GB', { timeZone: 'Asia/Ho_Chi_Minh', hour12: false }).replace(',', '');
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
  const acc = cfg.accounts.find(a => a.name === name);
  if (acc) {
    try {
      const logFile = path.posix.join(LOG_DIR, name + '.log');
      if (fs.existsSync(logFile)) fs.unlinkSync(logFile);
      if (acc.destPath && acc.destPath.startsWith('/data')) {
        fs.rmSync(acc.destPath, { recursive: true, force: true });
      }
    } catch (e) {}
  }
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
    return `rclone ${mode} "${src}" "${dstRemote}" --fast-list --create-empty-src-dirs --config=/config/rclone.conf --log-file="${path.posix.join(LOG_DIR, acc.name + '.log')}" --use-json-log --stats=30s --gphotos-read-only`;
  }
  return `rclone ${mode} "${src}" "${dst}" --fast-list --create-empty-src-dirs --config=/config/rclone.conf --log-file="${path.posix.join(LOG_DIR, acc.name + '.log')}" --use-json-log --stats=30s --gphotos-read-only`;
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

  // Kiểm tra xem Remote có thực sự tồn tại trong rclone.conf không?
  try {
    const { stdout: rList } = await execPromise('rclone listremotes --config=/config/rclone.conf');
    const existingRemotes = rList.split('\n').map(r=>r.trim().replace(':','')).filter(Boolean);
    if (!existingRemotes.includes(acc.remote)) {
       return { ok: false, msg: `LỖI CẤU HÌNH: Remote "${acc.remote}" không tồn tại trong rclone.conf! Các remote đang có: ${existingRemotes.join(', ')}` };
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
     fs.appendFileSync(logFile, `{"time":"${getGMT7()}","level":"info","msg":"[Web App] Bắt đầu quét GPhotos thư mục \\"media/all\\" (Remote: ${acc.remote}). Nếu không thấy ảnh, hãy kiểm tra xem bạn đã cấp quyền Google Photos chưa."}\n`);
  } catch(e) {}

  const child = spawn(cmd, { shell: true, stdio: 'ignore' });
  global.activeJobs[acc.name] = child;
  
  child.on('exit', () => { 
     delete global.activeJobs[acc.name]; 
     try { fs.appendFileSync(path.posix.join(LOG_DIR, acc.name + '.log'), `{"time":"${getGMT7()}","level":"info","msg":"[Web App] Tiến trình Rclone đã KẾT THÚC."}\n`); } catch(e){}
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
app.get('/api/version', async (req,res) => {
  let v = "v2.10";
  try {
    const st = fs.statSync(__filename);
    const dateStr = new Date(st.mtimeMs).toLocaleString('en-GB', { timeZone: 'Asia/Ho_Chi_Minh' });
    const { stdout: rv } = await execPromise('rclone version');
    const rvShort = rv.split('\n')[0];
    v = `[App v2.10 - ${dateStr} GMT+7] | [${rvShort}]`;
  } catch(e){}
  res.json({ version: v });
});
app.post('/api/schedule', (req,res)=>{ const body = req.body || { entries: [] }; saveJSON(SCHEDULE_FILE, body); res.json({ ok:true }); });

// ===========================================================================
// GOOGLE OAUTH - TERMINAL EMULATOR FLOW
// ===========================================================================
if (!global.rcloneAuthState) {
  global.rcloneAuthState = { status: 'idle', output: '', remoteName: null, readOnly: true };
}

// Khởi động tiến trình rclone authorize, stream output vào global state
// remoteType: 'googledrive' | 'google photos' | 'onedrive'
app.post('/api/rclone-authorize', (req, res) => {
  const { remoteName, remoteType, readOnly } = req.body || {};
  if (!remoteName) return res.status(400).json({ ok: false, msg: 'Thiếu remoteName' });

  const type = remoteType || 'drive';

  // Kill phiên cũ nếu còn
  try { if (global.rcloneAuthChild) global.rcloneAuthChild.kill(); } catch(e) {}

  global.rcloneAuthState = { status: 'running', output: `$ rclone authorize "${type}" --auth-no-open-browser\n`, remoteName, remoteType: type, readOnly: !!readOnly };

  // Build env theo loại remote
  const authEnv = { ...process.env };
  if (type === 'google photos') {
    authEnv.RCLONE_GPHOTOS_READ_ONLY = readOnly ? 'true' : 'false';
  }

  const child = spawn('rclone', ['authorize', type, '--auth-no-open-browser', '--config=/config/rclone.conf'], { 
    shell: false,
    env: authEnv
  });
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

// Ghi remote vào rclone.conf trực tiếp (không dùng CLI → tránh shell escaping)
// remoteType: 'googledrive' | 'google photos' | 'onedrive'
// driveType (OneDrive only): 'personal' | 'business'
function writeRcloneRemoteToConf(remoteName, tokenStr, remoteType, options) {
  const confPath = '/config/rclone.conf';
  const tokenObj = JSON.parse(tokenStr); // validate JSON
  const tokenLine = JSON.stringify(tokenObj); // normalize
  const type = remoteType || 'drive';
  const opts = options || {};

  let conf = '';
  if (fs.existsSync(confPath)) {
    conf = fs.readFileSync(confPath, 'utf8');
    // Xóa section cũ nếu tồn tại
    const lines = conf.split('\n');
    const out = [];
    let skip = false;
    for (const line of lines) {
      if (line.trim() === `[${remoteName}]`) { skip = true; continue; }
      if (skip && line.trim().startsWith('[')) skip = false;
      if (!skip) out.push(line);
    }
    conf = out.join('\n').trimEnd();
  }

  // Build section theo loại remote
  const sectionLines = [`\n\n[${remoteName}]`];
  if (type === 'google photos') {
    sectionLines.push(`type = google photos`);
    sectionLines.push(`token = ${tokenLine}`);
    sectionLines.push(`read_only = ${opts.readOnly ? 'true' : 'false'}`);
  } else if (type === 'drive') {
    sectionLines.push(`type = drive`);
    sectionLines.push(`scope = drive.readonly`);
    sectionLines.push(`token = ${tokenLine}`);
  } else if (type === 'onedrive') {
    sectionLines.push(`type = onedrive`);
    sectionLines.push(`token = ${tokenLine}`);
    // drive_type: personal | business
    sectionLines.push(`drive_type = ${opts.driveType || 'personal'}`);
    if (opts.driveId) sectionLines.push(`drive_id = ${opts.driveId}`);
  }

  const section = sectionLines.join('\n') + '\n';
  fs.writeFileSync(confPath, conf + section, 'utf8');
}

app.post('/api/rclone-token-import', (req, res) => {
  const { remoteName, token, remoteType, readOnly, driveType, driveId } = req.body || {};
  if (!remoteName || !token) return res.status(400).json({ ok: false, msg: 'Thiếu remoteName hoặc token' });
  
  // Kill rclone auth process cũ (giải phóng port 53682)
  try { if (global.rcloneAuthChild) { global.rcloneAuthChild.kill('SIGKILL'); global.rcloneAuthChild = null; } } catch(e) {}
  
  try {
    writeRcloneRemoteToConf(remoteName, token, remoteType || global.rcloneAuthState?.remoteType || 'drive', { readOnly, driveType, driveId });
    const label = remoteType === 'onedrive' ? 'OneDrive' : remoteType === 'google photos' ? 'Google Photos' : 'Google Drive';
    res.json({ ok: true, msg: `✅ Remote "${remoteName}" (${label}) đã được tạo thành công! Vào tab Accounts để sử dụng.` });
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
      const { stdout } = await execPromise(`rclone size "${src}" --config=/config/rclone.conf --json`);
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

app.get('/api/rclone-ls', async (req,res) => {
  const { account } = req.query;
  const cfg = listAccounts();
  const acc = cfg.accounts.find(a => a.name === account);
  if(!acc) return res.status(404).json({ ok:false, msg:'Không tìm thấy account' });
  
  let debugLog = [];
  try {
     // 1. Thử quét media/all (Tiêu chuẩn)
     debugLog.push("--- Thử quét media/all ---");
     try {
       const { stdout } = await execPromise(`rclone lsf "${acc.remote}:media/all" --config=/config/rclone.conf --max-depth 1 --gphotos-read-only`);
       if(stdout.trim()) return res.json({ ok:true, source:'media/all', files: stdout.split('\n').filter(Boolean) });
       debugLog.push("media/all rỗng.");
     } catch(e) { debugLog.push("media/all lỗi: " + e.message); }

     // 2. Thử quét media (Root của ảnh)
     debugLog.push("--- Thử quét media ---");
     try {
       const { stdout } = await execPromise(`rclone lsf "${acc.remote}:media" --config=/config/rclone.conf --max-depth 1 --gphotos-read-only`);
       if(stdout.trim()) return res.json({ ok:true, source:'media', files: stdout.split('\n').filter(Boolean) });
       debugLog.push("media rỗng.");
     } catch(e) { debugLog.push("media lỗi: " + e.message); }

     // 3. Quét Root (:) để xem cấu trúc
     debugLog.push("--- Quét cấu trúc gốc (root) ---");
     const { stdout: rootList } = await execPromise(`rclone lsf "${acc.remote}:" --config=/config/rclone.conf --max-depth 1 --gphotos-read-only`);
     res.json({ ok:true, source:'root', files: rootList.split('\n').filter(Boolean), debug: debugLog.join('\n') });

  } catch(e) {
     res.status(500).json({ ok:false, msg: e.message, debug: debugLog.join('\n') });
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

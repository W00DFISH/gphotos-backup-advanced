/**
 * gphotos-backup-advanced - v2.6
 * Tính năng mới (v2.6): Tab Setup Google OAuth - hướng dẫn kết nối Google Photos trong Docker
 */
async function reqJSON(url, opts){ const r = await fetch(url, opts); if(!r.ok) throw new Error(await r.text()); return r.json(); }
async function init(){ try{ const j = await reqJSON('/api/rclone-url'); document.getElementById('rcloneLink').href = j.url; }catch(e){} tab('accounts'); }
async function tab(name){ const v = document.getElementById('view'); 
  if(name==='accounts'){ 
    const cfg = await reqJSON('/api/config'); 
    let remotesHTML = '<option value="">-- Đang tải danh sách Remote... --</option>';
    reqJSON('/api/rclone-remotes').then(r => {
      if(r.ok && r.remotes.length>0) {
        remotesHTML = '<option value="">-- Chạm để chọn cấu hình Rclone --</option>' + r.remotes.map(x=>`<option value="${x}">${x}</option>`).join('');
        const sel = document.getElementById('acc_remote');
        if(sel) sel.innerHTML = remotesHTML;
      } else {
        const sel = document.getElementById('acc_remote');
        if(sel) sel.innerHTML = '<option value="">Chưa có Rclone Remote nào. Bạn hãy lấy Auth và ném vào rclone.conf trước!</option>';
      }
    }).catch(e=>{});
    
    v.innerHTML = `
<section>
  <h2>Cấu hình chung (Global NAS Protection)</h2>
  <div class="small">Nếu dung lượng trống trên NAS rớt xuống dưới mốc này, toàn bộ tiến trình rclone sẽ chặn khởi chạy hoặc tự động ép ngưng.</div>
  <label>Ngưỡng dung lượng trống tối thiểu (GB)</label>
  <input id="global_min_gb" value="${cfg.globalMinGB!==undefined?cfg.globalMinGB:5}" type="number" step="0.5"/>
  <button onclick="saveGlobalConfig()">Lưu cấu hình Global</button>
</section>
<section>
  <h2>Quản lý Accounts</h2>
  <div class="flex">
    <div class="w50">
      <h3>Thêm / Sửa account</h3>
      <label>Tên account</label>
      <input id="acc_name" placeholder="vd: family" />
      <label>Rclone Remote (Google Photos)</label>
      <select id="acc_remote" onchange="document.getElementById('acc_dest').value = this.value ? '/data/' + this.value : ''">
        <option value="">-- Xin chờ tải danh sách... --</option>
      </select>
      <label>Thư mục đích trên DSM (bên trong /data)</label>
      <input id="acc_dest" placeholder="vd: /data/family" />
      <label>Hạn mức Quota cho thư mục này (GB) - Nhập 0 để Unlimit</label>
      <input id="acc_quota" placeholder="vd: 50" type="number" step="1" value="0"/>
      <label><input type="checkbox" id="acc_year" /> Tạo thư mục theo năm (…/YYYY)</label>
      <details>
        <summary>Tùy chọn: Mã hoá (Crypt)</summary>
        <div class="small">Bạn cần tạo Crypt remote trong Rclone Web GUI (:5573) trước.</div>
        <label>Crypt Remote</label>
        <input id="acc_crypt_remote" placeholder="vd: crypt_family" />
        <label>Đường dẫn trong Crypt Remote</label>
        <input id="acc_crypt_path" placeholder="vd: /gphotos" />
      </details>
      <button onclick="saveAccount()">Lưu account</button>
    </div>
    <div class="w50">
      <h3>Danh sách</h3>
      <table class="table"><thead><tr><th>Account</th><th>Remote</th><th>Dest</th><th>Quota</th><th>Size Mây</th><th>Hành động</th></tr></thead>
      <tbody id="acc_rows"></tbody></table>
      <div id="quota_warning" style="margin-top:15px; font-size:13px; color:#555;"></div>
    </div>
  </div>
</section>`; 
window._lastCfg = cfg;
const sumQuota = (cfg.accounts||[]).reduce((sum, a) => sum + (parseFloat(a.maxQuotaGB)||0), 0);
const sumUsed = (cfg.accounts||[]).reduce((sum, a) => sum + (parseFloat(a.lastSizeGB)||0), 0);

document.getElementById('acc_rows').innerHTML = (cfg.accounts||[]).map(a=>`<tr>
  <td>${a.name}</td>
  <td>${a.remote}</td>
  <td class="mono">${a.destPath}</td>
  <td>${a.maxQuotaGB?a.maxQuotaGB+'GB':'∞'}</td>
  <td>${a.lastSizeGB!==undefined ? a.lastSizeGB+' GB' : 'Chưa quét'}</td>
  <td>
    <button onclick="editAccount('${a.name}')">Sửa</button>
    <button onclick="estimateRemoteSize('${a.name}', event)">Check GB</button>
    <button onclick="delAccount('${a.name}')">Xoá</button>
  </td>
</tr>`).join('');

const warnDiv = document.getElementById('quota_warning');
if(warnDiv) {
  warnDiv.innerHTML = `<br><b>Thống kê:</b> Tổng Hạn mức đã cấp: ${sumQuota||0} GB | Tổng mây đã quét: ${sumUsed.toFixed(2)} GB.<br><span style="color:red">${sumQuota > 0 ? '(Lưu ý: Tổng hạn mức nên nhỏ hơn dung lượng trống của NAS)' : ''}</span>`;
}
}
  if(name==='sync'){ const cfg = await reqJSON('/api/config'); v.innerHTML = `
<section>
  <h2>Sync</h2>
  <label>Chọn account</label>
  <select id="sync_acc">${(cfg.accounts||[]).map(a=>`<option>${a.name}</option>`).join('')}</select>
  <label>Chế độ</label>
  <select id="sync_mode"><option value="sync">sync (khuyến nghị)</option><option value="copy">copy</option></select>
  <button onclick="runSync()">Chạy ngay</button>
  <h3>Kết quả</h3>
  <div id="sync_out" class="mono"></div>
</section>`; }
  if(name==='scheduler'){ const j = await reqJSON('/api/config'); const accounts = j.accounts||[]; const sched = j.schedule||{entries:[]}; v.innerHTML = `
<section>
  <h2>Scheduler</h2>
  <div class="small">Container kiểm tra lịch mỗi 15s.</div>
  <div id="sched_rows"></div>
  <button onclick="addDaily()">+ Daily</button>
  <button onclick="addWeekly()">+ Weekly</button>
  <button onclick="saveSchedule()">Lưu lịch</button>
</section>`; window.__accounts = accounts; window.__sched = sched; renderSchedule(); }
  if(name==='logs'){
    stopLogPolling();
    const cfg = await reqJSON('/api/config');
    v.innerHTML = `
<section>
  <h2>Logs <span id="log_status_badge" style="font-size:13px;margin-left:8px;"></span></h2>
  <label>Chọn account</label>
  <select id="log_acc">${(cfg.accounts||[]).map(a=>`<option>${a.name}</option>`).join('')}</select>
  <button onclick="loadLog()">Tải / Refresh log</button>
  <button onclick="stopLogPolling(); document.getElementById('log_status_badge').textContent='⏸ Tạm dừng'">⏸ Dừng refresh</button>
  <div id="log_out" class="mono" style="max-height:60vh;overflow-y:auto;"></div>
</section>`;
  }
  if(name==='setup'){
    v.innerHTML = `
<section>
  <h2>⚡ Bước 1 — Lấy link xác thực Google</h2>
  <div class="small">Server sẽ chạy <code>rclone authorize</code> và trả về đường link OAuth. Bạn mở link đó trên máy tính, đăng nhập Google và copy token JSON.</div>
  <button onclick="getAuthUrl()" id="btn_get_url">🔗 Lấy link OAuth từ Server</button>
  <div id="setup_url_box" style="margin-top:12px;"></div>
</section>
<section>
  <h2>📝 Bước 2 — Dán Token và tạo Remote</h2>
  <div class="small">Sau khi authorize xong, trang redirect sẽ hiện token JSON dạng: <code>{"access_token":"...","refresh_token":"...", ...}</code><br>Copy toàn bộ đoạn JSON đó vào ô dưới.</div>
  <label>Tên Remote (chỉ dùng chữ cái, số, gạch dưới)</label>
  <input id="setup_remote_name" placeholder="vđ: family_photos" />
  <label>Token JSON (dán vào đây)</label>
  <textarea id="setup_token" rows="5" style="width:100%;padding:8px;border-radius:6px;border:1px solid #334155;background:#0b1220;color:#e6eefc;font-family:monospace;" placeholder='{"access_token":"ya29...","refresh_token":"1//...","expiry":"..."}'></textarea>
  <label><input type="checkbox" id="setup_readonly"> Chế độ chỉ đọc (Read Only) — nên tick nếu chỉ cçn backup</label>
  <button onclick="importToken()" id="btn_import">✅ Tạo Remote vào rclone.conf</button>
  <div id="setup_result" style="margin-top:12px;"></div>
</section>
<section style="background:#0a1e0a;border-color:#166534">
  <h3>💡 Hướng dẫn chi tiết</h3>
  <ol style="padding-left:18px;line-height:1.9;font-size:13px;">
    <li>Bấm <b>Lấy link OAuth</b> → chờ đến khi xuất hiện đường link dài</li>
    <li>Click vào link đó → đăng nhập bằng tài khoản Google Photos cần backup</li>
    <li>Google sẽ điều hướng về trang <code>localhost</code> và hiện token JSON</li>
    <li>Copy toàn bộ JSON đó vào <b>Bước 2</b> → Điền tên Remote → Bấm Tạo</li>
    <li>Sau khi tạo xong, vào tab <b>Accounts</b> chọn Remote mới để đăng ký rồi Sync</li>
  </ol>
</section>`;
  }
  if(name==='restore'){ v.innerHTML = `
<section>
  <h2>Restore / Duyệt thư mục</h2>
  <label>Đường dẫn</label>
  <input id="rst_dir" value="/data" />
  <button onclick="browse()">Duyệt</button>
  <div id="rst_out" class="mono"></div>
</section>`; }
}
async function saveGlobalConfig() { const gb = global_min_gb.value; await reqJSON('/api/settings', {method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({globalMinGB:gb})}); alert('Đã lưu cấu hình chung!'); }
async function getAuthUrl() {
  const btn = document.getElementById('btn_get_url');
  btn.disabled = true; btn.textContent = '⏳ Đang chứng thực với Google...';
  const box = document.getElementById('setup_url_box');
  box.innerHTML = '<div class="small">Vui lòng chờ ~10s... server đang chạy rclone authorize</div>';
  try {
    const j = await reqJSON('/api/rclone-authorize', { method: 'POST', headers: {'Content-Type':'application/json'}, body: '{}' });
    if (j.ok && j.url) {
      box.innerHTML = `
        <div style="margin-top:8px">✅ Đã lấy được link. Mở link này trên trình duyệt máy tính của bạn:</div>
        <div style="word-break:break-all;margin-top:8px;">
          <a href="${j.url}" target="_blank" style="color:#60a5fa;">${j.url}</a>
        </div>
        <button onclick="navigator.clipboard.writeText('${j.url.replace(/'/g,"\\'")}')">Copy link</button>`;
    } else {
      box.innerHTML = '<div style="color:red">LỖI: ' + (j.msg||'Không lấy được URL') + '<br><pre style="font-size:11px">' + (j.raw||'') + '</pre></div>';
    }
  } catch(e) { box.innerHTML = '<div style="color:red">LỖI: ' + e.message + '</div>'; }
  btn.disabled = false; btn.textContent = '🔗 Lấy lại link OAuth';
}
async function importToken() {
  const remoteName = document.getElementById('setup_remote_name').value.trim();
  const token = document.getElementById('setup_token').value.trim();
  const readOnly = document.getElementById('setup_readonly').checked;
  const res = document.getElementById('setup_result');
  if (!remoteName || !token) { res.innerHTML = '<div style="color:orange">⚠️ Vui lòng nhập tên remote và token.</div>'; return; }
  try { JSON.parse(token); } catch(e) { res.innerHTML = '<div style="color:red">Token JSON không hợp lệ. Hãy kiểm tra lại.</div>'; return; }
  const btn = document.getElementById('btn_import'); btn.disabled = true; btn.textContent = '⏳ Đang tạo...';
  try {
    const j = await reqJSON('/api/rclone-token-import', { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({remoteName, token, readOnly}) });
    res.innerHTML = j.ok ? `<div style="color:#4ade80">${j.msg}</div>` : `<div style="color:red">LỖI: ${j.msg}</div>`;
  } catch(e) { res.innerHTML = '<div style="color:red">LỖI: ' + e.message + '</div>'; }
  btn.disabled = false; btn.textContent = '✅ Tạo Remote vào rclone.conf';
}
async function saveAccount(){ const body = { name: acc_name.value.trim(), remote: acc_remote.value.trim(), destPath: acc_dest.value.trim(), yearFolder: acc_year.checked, maxQuotaGB: acc_quota.value||0, cryptRemote: acc_crypt_remote.value.trim(), cryptPath: acc_crypt_path.value.trim() }; if(!body.name||!body.remote||!body.destPath){ alert('Thiếu tên/remote/thư mục đích'); return; } await reqJSON('/api/accounts',{ method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify(body)}); tab('accounts'); }
async function delAccount(n){ if(!confirm('Xoá account '+n+'?')) return; await reqJSON('/api/accounts/'+encodeURIComponent(n), { method:'DELETE' }); tab('accounts'); }
async function estimateRemoteSize(name, event) { 
  const btn = event ? event.target : null;
  if(btn) { btn.innerText = 'Đang quét...'; btn.disabled = true; }
  try { 
    await reqJSON('/api/remote-size?account='+encodeURIComponent(name)); 
    tab('accounts'); 
  } catch(e) { 
    alert('LỖI: ' + e.message); 
    if(btn) { btn.innerText = 'Check GB'; btn.disabled = false; }
  } 
}
function editAccount(n) {
  const cfg = window._lastCfg;
  if(!cfg) return;
  const a = cfg.accounts.find(x => x.name === n);
  if(!a) return;
  document.getElementById('acc_name').value = a.name;
  const sel = document.getElementById('acc_remote');
  if(![...sel.options].find(o=>o.value===a.remote)) { sel.innerHTML += `<option value="${a.remote}">${a.remote} (Cũ)</option>`; }
  sel.value = a.remote;
  document.getElementById('acc_dest').value = a.destPath;
  document.getElementById('acc_quota').value = a.maxQuotaGB || 0;
  document.getElementById('acc_year').checked = !!a.yearFolder;
  document.getElementById('acc_crypt_remote').value = a.cryptRemote || '';
  document.getElementById('acc_crypt_path').value = a.cryptPath || '';
  document.getElementById('acc_name').focus();
}
// ── Auto-refresh log polling ──────────────────────────────────────────────
let _logPollTimer = null;
let _logPollAccount = null;
function stopLogPolling() { if(_logPollTimer){ clearInterval(_logPollTimer); _logPollTimer=null; } }
function startLogPolling(account) {
  stopLogPolling();
  _logPollAccount = account;
  async function poll() {
    try {
      const j = await reqJSON('/api/logs/tail?account='+encodeURIComponent(account)+'&lines=200');
      const el = document.getElementById('log_out');
      if(el) {
        el.textContent = parseLogContent(j.content || '');
        el.scrollTop = el.scrollHeight;
      }
      const badge = document.getElementById('log_status_badge');
      if(badge) badge.textContent = j.running ? '🟢 Đang chạy...' : '⚫ Đã xong';
      if(!j.running) stopLogPolling();
    } catch(e) {}
  }
  poll();
  _logPollTimer = setInterval(poll, 2000);
}
function parseLogContent(raw) {
  // Parse JSON log lines từ rclone --use-json-log sang text đẹp hơn
  return raw.split('\n').map(line => {
    try {
      const o = JSON.parse(line);
      const t = (o.time||'').replace('T',' ').slice(0,19);
      return `[${t}] [${(o.level||'').toUpperCase()}] ${o.msg||''}`;
    } catch(e) { return line; }
  }).join('\n');
}
async function runSync(){
  const account = sync_acc.value;
  const mode = sync_mode.value;
  const j = await reqJSON('/api/sync',{ method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({account, mode})});
  if(j.ok) {
    // Tự chuyển sang tab Logs và bắt đầu auto-refresh
    await tab('logs');
    // Chọn đúng account trong dropdown logs
    const sel = document.getElementById('log_acc');
    if(sel) { sel.value = account; }
    startLogPolling(account);
  } else {
    document.getElementById('sync_out').textContent = 'LỖI:\n'+j.msg;
  }
}
async function loadLog(){
  const acc = log_acc.value;
  stopLogPolling();
  startLogPolling(acc);
}
function renderSchedule(){ const el = document.getElementById('sched_rows'); const accounts = window.__accounts || []; const entries = (window.__sched && window.__sched.entries) || []; el.innerHTML = entries.map((e,idx)=> `
<section>
  <div class="flex">
    <div class="w50">
      <label>Loại</label>
      <select data-idx="${idx}" onchange="chgType(event)"><option ${e.type==='daily'?'selected':''}>daily</option><option ${e.type==='weekly'?'selected':''}>weekly</option></select>
      <label>Account</label>
      <select data-idx="${idx}" onchange="chgAccount(event)">${accounts.map(a=>`<option ${a.name===e.account?'selected':''}>${a.name}</option>`).join('')}</select>
    </div>
    <div class="w50">
      <label>Giờ (HH:mm)</label>
      <input data-idx="${idx}" value="${e.time||'02:00'}" onchange="chgTime(event)" />
      <label>Chế độ</label>
      <select data-idx="${idx}" onchange="chgMode(event)"><option ${e.mode==='sync'?'selected':''}>sync</option><option ${e.mode==='copy'?'selected':''}>copy</option></select>
      ${e.type==='weekly'? `<label>Ngày (0=CN…6=T7, cách nhau dấu phẩy)</label><input data-idx="${idx}" value="${(e.days||[]).join(',')}" onchange="chgDays(event)" />` : ''}
      <label><input type="checkbox" data-idx="${idx}" ${e.enabled?'checked':''} onchange="chgEnabled(event)" /> Kích hoạt</label>
      <button onclick="rmEntry(${idx})">Xoá</button>
    </div>
  </div>
</section>`).join(''); }
function addDaily(){ (window.__sched.entries||(window.__sched.entries=[])).push({ type:'daily', time:'02:00', account:(window.__accounts[0]||{}).name||'', mode:'sync', enabled:true }); renderSchedule(); }
function addWeekly(){ (window.__sched.entries||(window.__sched.entries=[])).push({ type:'weekly', time:'02:00', days:[0], account:(window.__accounts[0]||{}).name||'', mode:'sync', enabled:true }); renderSchedule(); }
function rmEntry(i){ window.__sched.entries.splice(i,1); renderSchedule(); }
function chgType(e){ const i=+e.target.dataset.idx; window.__sched.entries[i].type = e.target.value; renderSchedule(); }
function chgAccount(e){ const i=+e.target.dataset.idx; window.__sched.entries[i].account = e.target.value; }
function chgTime(e){ const i=+e.target.dataset.idx; window.__sched.entries[i].time = e.target.value; }
function chgMode(e){ const i=+e.target.dataset.idx; window.__sched.entries[i].mode = e.target.value; }
function chgDays(e){ const i=+e.target.dataset.idx; window.__sched.entries[i].days = e.target.value.split(',').map(s=>s.trim()).filter(Boolean).map(Number); }
function chgEnabled(e){ const i=+e.target.dataset.idx; window.__sched.entries[i].enabled = e.target.checked; }
async function saveSchedule(){ await reqJSON('/api/schedule',{ method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify(window.__sched)}); alert('Đã lưu lịch'); }
async function browse(){ const p = document.getElementById('rst_dir').value.trim()||'/data'; const j = await reqJSON('/api/restore?dir='+encodeURIComponent(p)); document.getElementById('rst_out').textContent = [ 'Thư mục: '+j.dir, '', ...j.entries.map(e=> (e.dir? '[DIR] ':'      ')+e.name ) ].join('\n'); }
window.addEventListener('DOMContentLoaded', init);

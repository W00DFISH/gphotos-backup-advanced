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
    stopAuthPolling();
    v.innerHTML = `
<section style="background:#0d1f0d;border-color:#166534;border-radius:10px;padding:18px 20px;margin-bottom:16px">
  <h2 style="color:#4ade80;margin-top:0">🔐 Kết nối Google Photos</h2>
  <div class="small" style="color:#86efac;line-height:1.8">
    Nhập tên remote, bấm <b>Lấy link OAuth</b>, rồi click vào link Google để đăng nhập.<br>
    Sau khi bạn bấm <b>Allow</b>, app sẽ tự động nhận token và tạo remote — không cần paste gì thêm.
  </div>
</section>
<section>
  <h2>⚡ Bước 1 — Đặt tên Remote</h2>
  <label>Tên Remote <span style="color:#94a3b8;font-size:12px">(chỉ dùng chữ, số, gạch dưới — vd: family_photos)</span></label>
  <input id="setup_remote_name" placeholder="vd: family_photos" style="max-width:340px"/>
  <label style="margin-top:10px"><input type="checkbox" id="setup_readonly" checked> Chế độ chỉ đọc (Read Only) — khuyến nghị khi chỉ backup</label>
  <div style="margin-top:14px">
    <button onclick="getAuthUrl()" id="btn_get_url" style="font-size:15px;padding:10px 22px">🔗 Lấy link OAuth Google</button>
    <button onclick="resetAuthFlow()" style="margin-left:10px;background:#334155;color:#cbd5e1">↺ Làm mới</button>
  </div>
</section>
<section id="setup_link_section" style="display:none">
  <h2>🌐 Bước 2 — Mở link và đăng nhập Google</h2>
  <div class="small" style="margin-bottom:10px;color:#fde68a">Bấm vào link bên dưới. Sau khi bạn đăng nhập và bấm Allow, app sẽ tự động hoàn tất.</div>
  <div id="setup_url_box"></div>
</section>
<section id="setup_status_section" style="display:none">
  <h2>📊 Bước 3 — Trạng thái</h2>
  <div id="setup_status_box" style="font-size:15px;line-height:2"></div>
</section>
<section style="border-color:#334155;background:#0b1220">
  <details>
    <summary style="cursor:pointer;color:#94a3b8;font-size:13px">🛠 Thủ công: Paste token JSON (nâng cao)</summary>
    <div style="margin-top:12px">
      <label>Tên Remote</label>
      <input id="setup_remote_name2" placeholder="vd: family_photos" style="max-width:300px"/>
      <label>Token JSON</label>
      <textarea id="setup_token" rows="4" style="width:100%;padding:8px;border-radius:6px;border:1px solid #334155;background:#0b1220;color:#e6eefc;font-family:monospace;box-sizing:border-box" placeholder='{"access_token":"ya29...","token_type":"Bearer","refresh_token":"1//...","expiry":"2026-..."}'></textarea>
      <label><input type="checkbox" id="setup_readonly2" checked> Read Only</label>
      <button onclick="importTokenManual()" id="btn_import" style="margin-top:8px">✅ Tạo Remote (thủ công)</button>
      <div id="setup_result" style="margin-top:10px"></div>
    </div>
  </details>
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
// ── Google OAuth auto redirect flow ──────────────────────────────────────
let _authPollTimer = null;
function stopAuthPolling() { if(_authPollTimer){ clearInterval(_authPollTimer); _authPollTimer=null; } }

async function getAuthUrl() {
  const remoteName = (document.getElementById('setup_remote_name')||{}).value?.trim();
  if (!remoteName) { alert('Vui lòng nhập tên remote trước!'); return; }
  const readOnly = (document.getElementById('setup_readonly')||{}).checked !== false;
  const btn = document.getElementById('btn_get_url');
  btn.disabled = true; btn.textContent = '⏳ Đang lấy link...';
  // Reset state trên server
  try { await reqJSON('/api/rclone-auth-reset', { method:'POST', headers:{'Content-Type':'application/json'}, body:'{}' }); } catch(e) {}
  // Hiện section link
  const linkSec = document.getElementById('setup_link_section');
  const statusSec = document.getElementById('setup_status_section');
  const urlBox = document.getElementById('setup_url_box');
  if(linkSec) linkSec.style.display = '';
  if(statusSec) statusSec.style.display = '';
  if(urlBox) urlBox.innerHTML = '<div class="small">⏳ Đang yêu cầu Google auth URL, vui lòng chờ...</div>';
  try {
    const j = await reqJSON('/api/rclone-authorize', {
      method: 'POST',
      headers: {'Content-Type':'application/json'},
      body: JSON.stringify({ remoteName, readOnly })
    });
    if (j.ok && j.url) {
      const safeUrl = j.url.replace(/"/g,'&quot;');
      if(urlBox) urlBox.innerHTML = `
        <div style="word-break:break-all;padding:12px;background:#0b1a35;border-radius:8px;border:1px solid #1e40af">
          <a href="${safeUrl}" target="_blank" style="color:#60a5fa;font-size:14px;line-height:1.8">${j.url}</a>
        </div>
        <button onclick="navigator.clipboard.writeText(this.dataset.url);this.textContent='✅ Đã copy!'" data-url="${safeUrl}" style="margin-top:8px">📋 Copy link</button>`;
      // Bắt đầu polling trạng thái
      startAuthPolling();
    } else {
      if(urlBox) urlBox.innerHTML = '<div style="color:#f87171">❌ Lỗi: ' + (j.msg||'Không lấy được URL') + '</div>';
    }
  } catch(e) {
    if(urlBox) urlBox.innerHTML = '<div style="color:#f87171">❌ Lỗi: ' + e.message + '</div>';
  }
  btn.disabled = false; btn.textContent = '🔗 Lấy lại link OAuth';
}

function startAuthPolling() {
  stopAuthPolling();
  _authPollTimer = setInterval(async () => {
    try {
      const j = await reqJSON('/api/rclone-auth-status');
      const box = document.getElementById('setup_status_box');
      if (!box) { stopAuthPolling(); return; }
      if (j.status === 'pending') {
        box.innerHTML = '⏳ Đang chờ bạn authorize trên Google...';
      } else if (j.status === 'success') {
        stopAuthPolling();
        box.innerHTML = `<div style="color:#4ade80;font-size:16px">${j.msg}</div>`;
        // Ẩn link section vì đã xong
        const ls = document.getElementById('setup_link_section');
        if(ls) ls.style.display = 'none';
      } else if (j.status === 'error') {
        stopAuthPolling();
        box.innerHTML = `<div style="color:#f87171">❌ ${j.msg}</div>`;
      }
    } catch(e) {}
  }, 2000);
}

async function resetAuthFlow() {
  stopAuthPolling();
  try { await reqJSON('/api/rclone-auth-reset', { method:'POST', headers:{'Content-Type':'application/json'}, body:'{}' }); } catch(e) {}
  const linkSec = document.getElementById('setup_link_section');
  const statusSec = document.getElementById('setup_status_section');
  if(linkSec) linkSec.style.display = 'none';
  if(statusSec) statusSec.style.display = 'none';
  const nameEl = document.getElementById('setup_remote_name');
  if(nameEl) nameEl.value = '';
}

async function importTokenManual() {
  const remoteName = (document.getElementById('setup_remote_name2')||{}).value?.trim();
  const token = (document.getElementById('setup_token')||{}).value?.trim();
  const readOnly = (document.getElementById('setup_readonly2')||{}).checked !== false;
  const res = document.getElementById('setup_result');
  if (!remoteName || !token) { res.innerHTML = '<div style="color:orange">⚠️ Vui lòng nhập tên remote và token.</div>'; return; }
  try { JSON.parse(token); } catch(e) { res.innerHTML = '<div style="color:#f87171">Token JSON không hợp lệ.</div>'; return; }
  const btn = document.getElementById('btn_import'); btn.disabled = true; btn.textContent = '⏳ Đang tạo...';
  try {
    const j = await reqJSON('/api/rclone-token-import', { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({remoteName, token, readOnly}) });
    res.innerHTML = j.ok ? `<div style="color:#4ade80">${j.msg}</div>` : `<div style="color:#f87171">LỖI: ${j.msg}</div>`;
  } catch(e) { res.innerHTML = '<div style="color:#f87171">LỖI: ' + e.message + '</div>'; }
  btn.disabled = false; btn.textContent = '✅ Tạo Remote (thủ công)';
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

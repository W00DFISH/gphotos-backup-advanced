/**
 * gphotos-backup-advanced - v2.8
 * v2.8: Multi-remote — Google Drive, OneDrive Personal/Business
 */
async function reqJSON(url, opts){ const r = await fetch(url, opts); if(!r.ok) throw new Error(await r.text()); return r.json(); }
async function init(){ 
  try{ const j = await reqJSON('/api/rclone-url'); document.getElementById('rcloneLink').href = j.url; }catch(e){} 
  try{ 
    const v = await reqJSON('/api/version'); 
    const f = document.createElement('footer');
    f.style.textAlign = 'center'; f.style.padding = '10px'; f.style.color = '#475569'; f.style.fontSize = '12px'; f.style.marginTop = '20px';
    f.innerHTML = `Git Tracking: <b>${v.version}</b>`;
    document.body.appendChild(f);
  }catch(e){}
  tab('accounts'); 
}
async function tab(name){ const v = document.getElementById('view'); 
  if(name==='accounts'){ 
    const cfg = await reqJSON('/api/config'); 
    let remotesHTML = '<option value="">-- Đang tải danh sách Remote... --</option>';
    reqJSON('/api/rclone-remotes').then(r => {
      if(r.ok && r.remotes.length>0) {
        const usedRemotes = (cfg.accounts||[]).map(a => a.remote);
        const avail = r.remotes.filter(x => !usedRemotes.includes(x));
        if (avail.length > 0) {
          remotesHTML = '<option value="">-- Chạm để chọn cấu hình Rclone --</option>' + avail.map(x=>`<option value="${x}">${x}</option>`).join('');
        } else {
          remotesHTML = '<option value="">(Tất cả Remote đã được khởi tạo thành Account)</option>';
        }
        const sel = document.getElementById('acc_remote');
        if(sel) sel.innerHTML = remotesHTML;
      } else {
        const sel = document.getElementById('acc_remote');
        if(sel) sel.innerHTML = '<option value="">Chưa có Rclone Remote nào. Bạn hãy lấy Auth và ném vào rclone.conf trước!</option>';
      }
    }).catch(e=>{});
    
    v.innerHTML = `
<div class="flex">
  <div class="w50" style="padding-right:10px;">
    <section>
      <h2>Cấu hình chung (Global NAS Protection)</h2>
      <div class="small">Nếu dung lượng trống trên NAS rớt xuống dưới mốc này, rclone sẽ chặn khởi chạy.</div>
      <label>Ngưỡng dung lượng trống tối thiểu (GB)</label>
      <input id="global_min_gb" value="${cfg.globalMinGB!==undefined?cfg.globalMinGB:5}" type="number" step="0.5"/>
      <button onclick="saveGlobalConfig()">Lưu cấu hình Global</button>
    </section>
    <section>
      <h2>Quản lý Accounts - Thêm / Sửa</h2>
      <button onclick="newAccount()" style="font-size:12px;margin-bottom:10px;background:#334155">+ Bắt đầu nhập Account mới</button>
      <label>Tên account</label>
      <input id="acc_name" placeholder="vd: family" />
      <label>Rclone Remote</label>
      <select id="acc_remote" onchange="document.getElementById('acc_dest').value = this.value ? '/data/' + this.value : ''">
        <option value="">-- Xin chờ tải danh sách... --</option>
      </select>
      <label>Thư mục đích trên DSM (bên trong /data)</label>
      <input id="acc_dest" placeholder="vd: /data/family" />
      <label>Hạn mức Quota cho thư mục này (GB) - Nhập 0 để Unlimit</label>
      <input id="acc_quota" placeholder="vd: 50" type="number" step="1" value="0"/>
      <details>
        <summary>Tùy chọn: Mã hoá (Crypt)</summary>
        <div class="small">Bạn cần tạo Crypt remote trong Rclone Web GUI (:5573) trước.</div>
        <label>Crypt Remote</label>
        <input id="acc_crypt_remote" placeholder="vd: crypt_family" />
        <label>Đường dẫn trong Crypt Remote</label>
        <input id="acc_crypt_path" placeholder="vd: /gphotos" />
      </details>
      <button id="btn_save_acc" onclick="saveAccount()">Lưu account mới</button>
    </section>
  </div>
  <div class="w50" style="padding-left:10px;">
    <section style="height:calc(100% - 40px);">
      <h2>Danh sách Accounts</h2>
      <table class="table">
        <thead>
          <tr>
            <th>Account</th>
            <th>Loại</th>
            <th>Remote</th>
            <th>Dest</th>
            <th>Quota</th>
            <th>Size Mây</th>
            <th>Hành động</th>
          </tr>
        </thead>
        <tbody id="acc_rows"></tbody>
      </table>
      <div id="quota_warning" style="margin-top:15px; font-size:13px; color:#555;"></div>
    </section>
  </div>
</div>`; 
window._lastCfg = cfg;
const sumQuota = (cfg.accounts||[]).reduce((sum, a) => sum + (parseFloat(a.maxQuotaGB)||0), 0);
const sumUsed = (cfg.accounts||[]).reduce((sum, a) => sum + (parseFloat(a.lastSizeGB)||0), 0);

document.getElementById('acc_rows').innerHTML = (cfg.accounts||[]).map(a=>`<tr>
  <td>${a.name}</td>
  <td style="font-size:12px;color:#a78bfa">${a.providerType || 'N/A'}</td>
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
  if(name==='sync'){ 
    const cfg = await reqJSON('/api/config'); 
    window._syncCfg = cfg;
    v.innerHTML = `
<section>
  <h2>Sync</h2>
  <label>Chọn account</label>
  <select id="sync_acc" onchange="updateSyncInfo()">${(cfg.accounts||[]).map(a=>`<option value="${a.name}">${a.name}</option>`).join('')}</select>
  
  <div id="sync_info" style="margin:10px 0; padding:12px; background:#0f172a; border:1px solid #1e3a5f; border-radius:6px; font-size:13px; color:#cbd5e1; display:none;">
      Loading...
  </div>
  
  <button onclick="runSync()" style="margin-top:10px; background:#2563eb; color:white;">▶ Chạy Sync ngay</button>
  
  <h3 style="margin-top:20px;">Kết quả</h3>
  <div id="sync_out" class="mono" style="background:#0b0f1a; color:#f8fafc; padding:15px; border-radius:8px; min-height:100px; white-space:pre-wrap; border:1px solid #1e3a5f;"></div>
</section>`; 
    setTimeout(updateSyncInfo, 50);
  }
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
    reqJSON('/api/rclone-auth-reset', {method:'POST'}).catch(()=>{});
    v.innerHTML = `
<section style="background:#0d1421;border-color:#1e3a5f;padding:20px">
  <h2 style="color:#60a5fa;margin-top:0">🔌 Kết nối Cloud Storage</h2>
  <div class="small" style="color:#94a3b8;margin-bottom:18px">Chọn dịch vụ muốn thêm. Mỗi dịch vụ dùng OAuth — bạn chỉ cần đăng nhập và bấm Allow.</div>
  <div style="display:flex;gap:14px;flex-wrap:wrap;margin-bottom:6px">
    <div id="card_gdrive" onclick="selectProvider('googledrive')" style="cursor:pointer;border:2px solid #1e3a5f;border-radius:12px;padding:18px 22px;min-width:150px;flex:1;text-align:center;transition:all .2s">
      <div style="font-size:32px">📂</div>
      <div style="color:#60a5fa;font-weight:700;font-size:15px;margin-top:6px">Google Drive</div>
      <div style="color:#64748b;font-size:12px;margin-top:4px">Tất cả file trên Drive</div>
    </div>
    <div id="card_od_personal" onclick="selectProvider('onedrive_personal')" style="cursor:pointer;border:2px solid #1e3a5f;border-radius:12px;padding:18px 22px;min-width:150px;flex:1;text-align:center;transition:all .2s">
      <div style="font-size:32px">🪟</div>
      <div style="color:#38bdf8;font-weight:700;font-size:15px;margin-top:6px">OneDrive Personal</div>
      <div style="color:#64748b;font-size:12px;margin-top:4px">Tài khoản cá nhân</div>
    </div>
    <div id="card_od_business" onclick="selectProvider('onedrive_business')" style="cursor:pointer;border:2px solid #1e3a5f;border-radius:12px;padding:18px 22px;min-width:150px;flex:1;text-align:center;transition:all .2s">
      <div style="font-size:32px">🏢</div>
      <div style="color:#a78bfa;font-weight:700;font-size:15px;margin-top:6px">OneDrive Business</div>
      <div style="color:#64748b;font-size:12px;margin-top:4px">Microsoft 365 / Work</div>
    </div>
    <div id="card_gphotos" onclick="selectProvider('gphotos')" style="cursor:pointer;border:2px solid #1e3a5f;border-radius:12px;padding:18px 22px;min-width:150px;flex:1;text-align:center;transition:all .2s">
      <div style="font-size:32px">🖼️</div>
      <div style="color:#4ade80;font-weight:700;font-size:15px;margin-top:6px">Google Photos</div>
      <div style="color:#64748b;font-size:12px;margin-top:4px">Chỉ ảnh do rclone upload</div>
    </div>
  </div>
</section>
<div id="setup_flow" style="display:none">
<section>
  <h2>⚡ Bước 1 — Chạy Auth</h2>
  <div id="setup_provider_label" style="margin-bottom:10px;font-size:13px;color:#94a3b8"></div>
  <label>Tên Remote <span style="color:#94a3b8;font-size:12px">(vd: gdrive_backup)</span></label>
  <input id="setup_remote_name" placeholder="vd: gdrive_backup" style="max-width:300px"/>
  <div id="setup_od_business_extra" style="display:none;margin-top:10px;background:#0f172a;border:1px solid #334155;border-radius:8px;padding:12px">
    <div style="color:#fde68a;font-size:12px;margin-bottom:8px">⚠️ OneDrive Business: Drive ID thường để trống — rclone tự detect. Chỉ nhập nếu cần chỉ định SharePoint cụ thể.</div>
    <label>Drive ID <span style="color:#64748b;font-size:11px">(tuỳ chọn — thường để trống)</span></label>
    <input id="setup_drive_id" placeholder="tự động nếu để trống" style="max-width:360px"/>
  </div>
  <div style="margin-top:12px;display:flex;gap:8px;flex-wrap:wrap">
    <button onclick="startRcloneTerminal()" id="btn_run_rclone" style="font-size:15px;padding:10px 20px;background:#2563eb;color:#fff">▶ Chạy rclone authorize</button>
    <button onclick="resetRcloneTerminal()" style="background:#334155;color:#cbd5e1">↺ Reset</button>
  </div>
</section>
<section>
  <h2>💻 Terminal rclone</h2>
  <div id="rclone_terminal" style="background:#0b0f1a;border:1px solid #1e3a5f;border-radius:8px;padding:14px;min-height:120px;max-height:340px;overflow-y:auto;font-family:monospace;font-size:13px;color:#93c5fd;white-space:pre-wrap;word-break:break-all">Chưa chạy. Bấm ▶ để bắt đầu...</div>
  <div style="margin-top:8px;font-size:12px;color:#64748b">⚠️ Khi thấy link <code>http://127.0.0.1:53682/...</code> hãy bấm link đó.</div>
</section>
<section>
  <h2>🔗 Bước 2 — Dán Link báo lỗi để hoàn tất</h2>
  <div class="small" style="color:#fde68a;margin-bottom:10px">Sau khi bấm Allow, bạn sẽ bị kẹt ở trang báo lỗi (127.0.0.1 refused). Copy toàn bộ URL đó dán vào đây:</div>
  <input id="setup_redirect_url" placeholder="http://127.0.0.1:53682/?state=...&code=..." style="width:100%;max-width:none"/>
  <button onclick="submitRedirectUrl()" id="btn_submit_url" style="margin-top:8px;background:#2563eb;color:#fff;font-size:14px;padding:9px 18px">🚀 Nhận Token &amp; Tạo Remote Tự Động</button>
  <details style="margin-top:16px">
    <summary style="cursor:pointer;color:#94a3b8;font-size:13px">🛠 Hoặc tự dán Token JSON (nếu muốn)</summary>
    <textarea id="setup_token" rows="4" style="width:100%;margin-top:8px;padding:8px;border-radius:6px;border:1px solid #334155;background:#0b1220;color:#e6eefc;font-family:monospace;font-size:12px;box-sizing:border-box" placeholder='{"access_token":"ya29..."}'></textarea>
    <button onclick="importFromTerminal()" style="margin-top:8px">✅ Tạo Remote từ Token JSON</button>
  </details>
  <div id="setup_result" style="margin-top:10px"></div>
</section>
</div>`;
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
// ── rclone Terminal Emulator ─────────────────────────────────────────────────
let _authPollTimer = null;
function stopAuthPolling() { if(_authPollTimer){ clearInterval(_authPollTimer); _authPollTimer=null; } }

// -- Provider Selection --
let currentRemoteType = 'drive';
let currentDriveType = 'personal';

function selectProvider(provider) {
  // Reset card styles
  ['card_gdrive','card_od_personal','card_od_business','card_gphotos'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.style.borderColor = '#1e3a5f';
  });
  const cardMap = { googledrive:'card_gdrive', onedrive_personal:'card_od_personal', onedrive_business:'card_od_business', gphotos:'card_gphotos' };
  const activeCard = document.getElementById(cardMap[provider]);
  if (activeCard) activeCard.style.borderColor = '#60a5fa';

  const labelEl = document.getElementById('setup_provider_label');
  const extraEl = document.getElementById('setup_od_business_extra');
  const flowEl = document.getElementById('setup_flow');
  if (flowEl) flowEl.style.display = '';

  if (provider === 'googledrive') {
    currentRemoteType = 'drive'; currentDriveType = null;
    if (labelEl) labelEl.innerHTML = '<span style="color:#60a5fa">📂 Google Drive</span> — Sẽ yêu cầu quyền đọc file trên Drive';
    if (extraEl) extraEl.style.display = 'none';
  } else if (provider === 'onedrive_personal') {
    currentRemoteType = 'onedrive'; currentDriveType = 'personal';
    if (labelEl) labelEl.innerHTML = '<span style="color:#38bdf8">🪟 OneDrive Personal</span> — Tài khoản Microsoft cá nhân';
    if (extraEl) extraEl.style.display = 'none';
  } else if (provider === 'onedrive_business') {
    currentRemoteType = 'onedrive'; currentDriveType = 'business';
    if (labelEl) labelEl.innerHTML = '<span style="color:#a78bfa">🏢 OneDrive Business</span> — Microsoft 365 / Work account';
    if (extraEl) extraEl.style.display = '';
  } else if (provider === 'gphotos') {
    currentRemoteType = 'google photos'; currentDriveType = null;
    if (labelEl) labelEl.innerHTML = '<span style="color:#4ade80">🖼️ Google Photos</span> — Chỉ backup ảnh do rclone upload (giới hạn API từ 31/3/2025)';
    if (extraEl) extraEl.style.display = 'none';
  }
}

async function startRcloneTerminal() {
  const remoteName = (document.getElementById('setup_remote_name')||{}).value?.trim();
  if (!remoteName) { alert('Vui lòng nhập tên remote!'); return; }
  const remoteType = currentRemoteType || 'drive';
  const btn = document.getElementById('btn_run_rclone');
  const term = document.getElementById('rclone_terminal');
  btn.disabled = true; btn.textContent = '⏳ Đang chạy...';
  if(term) term.textContent = `$ rclone authorize "${remoteType}" --auth-no-open-browser\n`;
  // Reset server state
  try { await reqJSON('/api/rclone-auth-reset', { method:'POST', headers:{'Content-Type':'application/json'}, body:'{}' }); } catch(e) {}
  // Spawn rclone
  try {
    await reqJSON('/api/rclone-authorize', { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ remoteName, remoteType, readOnly: true }) });
  } catch(e) {
    if(term) term.textContent += '\n[LỖI kết nối: ' + e.message + ']';
    btn.disabled = false; btn.textContent = '▶ Chạy lại';
    return;
  }
  // Bắt đầu polling output
  startTerminalPolling();
  btn.disabled = false; btn.textContent = '▶ Chạy lại';
}

function startTerminalPolling() {
  stopAuthPolling();
  _authPollTimer = setInterval(async () => {
    try {
      const j = await reqJSON('/api/rclone-auth-output');
      const term = document.getElementById('rclone_terminal');
      if (!term) { stopAuthPolling(); return; }
      
      const proxyBase = window.location.origin + '/rclone-oauth';
      const output = (j.output || '').replace(/http:\/\/127\.0\.0\.1:53682/g, proxyBase);
      term.innerHTML = output.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')
        .replace(/(https?:\/\/[^\s<]+)/g, '<a href="$1" target="_blank" style="color:#60a5fa;text-decoration:underline">$1</a>');
      term.scrollTop = term.scrollHeight;
      
      // Tự động parse Token bằng Marker để chốt chặn 100% token của rclone, kể cả có xuống dòng hay nội dung dư thừa!
      let tokenMatch = null;
      let pasteMatch = j.output.match(/--->\s*(\{.*?\})\s*<---/s);
      if (pasteMatch && pasteMatch[1]) {
          try {
             const p = JSON.parse(pasteMatch[1].trim());
             if (p && p.access_token) { tokenMatch = JSON.stringify(p); }
          } catch(e) {}
      } else {
          // Dự phòng khi không có marker: tìm Json phẳng
          for (const t of j.output.match(/\{[^}]+\}/g) || []) {
             try { const p = JSON.parse(t); if (p && p.access_token) { tokenMatch = JSON.stringify(p); break; } } catch(e) {}
          }
      }

      if (tokenMatch) {
        stopAuthPolling();
        term.innerHTML += '\n<span style="color:#4ade80">[Tự động] Đã tìm thấy mã Token JSON hợp lệ! Đang lưu config...</span>';
        document.getElementById('setup_token').value = tokenMatch;
        await importFromTerminal(); // Tự động tạo
      }
      else if (j.status === 'done' || j.status === 'error') {
        stopAuthPolling();
      }
    } catch(e) {}
  }, 1000);
}

async function submitRedirectUrl() {
  const input = document.getElementById('setup_redirect_url').value.trim();
  const res = document.getElementById('setup_result');
  if (!input) { res.innerHTML = '<div style="color:orange">⚠️ Hãy dán URL đang bị lỗi vào đây.</div>'; return; }
  
  if (!input.includes('state=') || !input.includes('code=')) {
    res.innerHTML = '<div style="color:#f87171">❌ URL không hợp lệ. Hãy đảm bảo copy nguyên cái URL trên thanh địa chỉ có chứa "state=" và "code="</div>';
    return;
  }
  
  // Trích xuất đoạn tham số sau dấu ?
  try {
    const urlObj = new URL(input.startsWith('http') ? input : 'http://localhost/' + input);
    const searchParams = urlObj.search;
    
    // Bắn ngầm fetch URL đó qua proxy local (sử dụng đúng gốc path mà user đã copy để truyền qua rclone, không fix từng url /)
    const exactPath = urlObj.pathname + urlObj.search; // thường giá trị này là sẽ là: /?state=XYZ&...
    res.innerHTML = '<div style="color:#60a5fa">⏳ Đang gửi mã xác thực cho rclone... Vui lòng đợi 1 chút để xem kết quả (nhìn biến log trên terminal đen).</div>';
    fetch('/rclone-oauth' + exactPath)
      .then(async (r) => {
        if (!r.ok) { res.innerHTML = `<div style="color:#f87171">❌ Lỗi từ server backend: HTTP ${r.status} - ${await r.text()}</div>`; }
        else { res.innerHTML += '<div style="color:#fde047">↪ Đã báo thành công tới rclone! Đang chờ terminal bắt được token json để lưu...</div>'; }
      })
      .catch((e)=>{
        res.innerHTML = '<div style="color:#f87171">❌ Mất kết nối tới NAS (fetch fail): ' + e.message + '</div>';
      });
  } catch (e) {
    res.innerHTML = '<div style="color:#f87171">❌ Lỗi xử lý URL: ' + e.message + '</div>';
  }
}


async function resetRcloneTerminal() {
  stopAuthPolling();
  try { await reqJSON('/api/rclone-auth-reset', { method:'POST', headers:{'Content-Type':'application/json'}, body:'{}' }); } catch(e) {}
  const term = document.getElementById('rclone_terminal');
  if(term) term.textContent = 'Đã reset. Bấm ▶ để chạy lại...';
  const res = document.getElementById('setup_result');
  if(res) res.innerHTML = '';
  const ta = document.getElementById('setup_token');
  if(ta) ta.value = '';
}

async function importFromTerminal() {
  const remoteName = (document.getElementById('setup_remote_name')||{}).value?.trim();
  const token = (document.getElementById('setup_token')||{}).value?.trim();
  const remoteType = currentRemoteType || 'drive';
  const driveType = currentDriveType || 'personal';
  const driveId = (document.getElementById('setup_drive_id')||{}).value?.trim() || '';
  const res = document.getElementById('setup_result');
  if (!remoteName) { res.innerHTML = '<div style="color:orange">⚠️ Vui lòng nhập tên remote.</div>'; return; }
  if (!token) { res.innerHTML = '<div style="color:orange">⚠️ Vui lòng paste token JSON.</div>'; return; }
  try { JSON.parse(token); } catch(e) { res.innerHTML = '<div style="color:#f87171">Token JSON không hợp lệ. Hãy copy đúng dòng bắt đầu bằng {</div>'; return; }
  const btn = document.getElementById('btn_import'); if(btn) { btn.disabled = true; btn.textContent = '⏳ Đang tạo...'; }
  try {
    const j = await reqJSON('/api/rclone-token-import', { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({remoteName, token, remoteType, readOnly: true, driveType, driveId}) });
    res.innerHTML = j.ok ? `<div style="color:#4ade80;font-size:15px">${j.msg}</div>` : `<div style="color:#f87171">LỖI: ${j.msg}</div>`;
    if (j.ok) {
      setTimeout(() => {
        tab('accounts');
        setTimeout(() => {
           const n = document.getElementById('acc_name'); if (n) { n.value = remoteName; n.focus(); }
           const d = document.getElementById('acc_dest'); if (d) d.value = '/data/' + remoteName;
           const r = document.getElementById('acc_remote');
           if (r && Array.from(r.options).find(o => o.value === remoteName)) r.value = remoteName;
        }, 600);
      }, 2000);
    }
  } catch(e) { res.innerHTML = '<div style="color:#f87171">LỖI: ' + e.message + '</div>'; }
}

async function saveGlobalConfig() {
  const globalMinGB = parseFloat(document.getElementById('global_min_gb').value) || 0;
  try {
    const j = await reqJSON('/api/settings', { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({globalMinGB}) });
    if(j.ok) alert('Đã lưu cấu hình Global Quota thành công!');
  } catch (e) {
    alert('Lỗi lưu cấu hình: ' + e.message);
  }
}

async function saveAccount(){ const body = { name: acc_name.value.trim(), remote: acc_remote.value.trim(), destPath: acc_dest.value.trim(), maxQuotaGB: acc_quota.value||0, cryptRemote: acc_crypt_remote.value.trim(), cryptPath: acc_crypt_path.value.trim() }; if(!body.name||!body.remote||!body.destPath){ alert('Thiếu tên/remote/thư mục đích'); return; } await reqJSON('/api/accounts',{ method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify(body)}); tab('accounts'); }
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
  const nameInp = document.getElementById('acc_name');
  const remSel = document.getElementById('acc_remote');
  
  nameInp.value = a.name;
  nameInp.disabled = true; // Không cho sửa tên account (key chính)
  
  if(![...remSel.options].find(o=>o.value===a.remote)) { 
      remSel.innerHTML += `<option value="${a.remote}">${a.remote} (Đang dùng)</option>`; 
  }
  remSel.value = a.remote;
  remSel.disabled = true; // Không cho sửa remote (tránh mismatch rclone.conf)

  document.getElementById('acc_dest').value = a.destPath;
  document.getElementById('acc_quota').value = a.maxQuotaGB || 0;
  document.getElementById('acc_crypt_remote').value = a.cryptRemote || '';
  document.getElementById('acc_crypt_path').value = a.cryptPath || '';
  
  const btn = document.getElementById('btn_save_acc');
  if(btn) btn.textContent = 'Cập nhật Account';
  document.getElementById('acc_dest').focus();
}

function newAccount() {
  const nameInp = document.getElementById('acc_name');
  const remSel = document.getElementById('acc_remote');
  if(nameInp) { nameInp.value = ''; nameInp.disabled = false; }
  if(remSel) { remSel.disabled = false; tab('accounts'); } // reload list remotes
  const btn = document.getElementById('btn_save_acc');
  if(btn) btn.textContent = 'Lưu account mới';
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
  const account = document.getElementById('sync_acc').value;
  const mode = 'sync';
  const out = document.getElementById('sync_out');
  if(out) out.textContent = 'Đang bắt đầu tiến trình sync...';
  
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
function updateSyncInfo() {
  const sel = document.getElementById('sync_acc');
  const info = document.getElementById('sync_info');
  if (!sel || !info || !window._syncCfg) return;
  const accName = sel.value;
  const acc = (window._syncCfg.accounts || []).find(a => a.name === accName);
  if (acc) {
    info.style.display = 'block';
    info.innerHTML = `<b>Remote Config:</b> <span style="color:#60a5fa">${acc.remote}</span> &nbsp;|&nbsp; <b>Loại Remote:</b> <span style="color:#a78bfa">${acc.providerType || 'N/A'}</span> &nbsp;|&nbsp; <b>Đích Lưu Local:</b> <span style="color:#fde047">${acc.destPath}</span>`;
  } else {
    info.style.display = 'none';
  }
}

async function checkCloudFiles() {
  const account = sync_acc.value;
  const out = document.getElementById('sync_out');
  out.textContent = 'Đang quét danh sách file trên mây... vui lòng đợi...';
  try {
    const j = await reqJSON('/api/rclone-ls?account='+encodeURIComponent(account));
    if(j.ok) {
      const debugText = j.debug ? `\n\n--- Debug Log ---\n${j.debug}` : '';
      if(j.files.length === 0) {
        out.innerHTML = `<div style="color:#fbbf24">⚠ Rclone không tìm thấy file nào!${debugText ? '<pre style="font-size:11px;color:#94a3b8">'+debugText+'</pre>' : ''}</div>`;
      } else {
        out.textContent = `[Nguồn: ${j.source}] Tìm thấy ${j.files.length} file:\n` + j.files.slice(0, 50).join('\n') + (j.files.length > 50 ? '\n...' : '') + debugText;
      }
    } else {
      out.textContent = 'LỖI: ' + j.msg + (j.debug ? '\n\nDebug:\n'+j.debug : '');
    }
  } catch(e) { out.textContent = 'LỖI: ' + e.message; }
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

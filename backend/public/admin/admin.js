/* ═══════════════════════════════════════════════════════════
   VendorBridge Admin — Shared JS Utilities
   Used by all admin pages
═══════════════════════════════════════════════════════════ */

const API = '/api/admin';

/* ── Auth ─────────────────────────────────────────────── */
function getToken() { return localStorage.getItem('vb_token'); }
function getRole()  { return localStorage.getItem('vb_role'); }

function requireAdmin() {
  const token = getToken();
  const role  = getRole();
  if (!token || role !== 'admin') {
    window.location.href = '/pages/login.html';
    return false;
  }
  return true;
}

/* ── API fetch helper ─────────────────────────────────── */
async function apiFetch(endpoint, options = {}) {
  const token = getToken();
  const headers = { 'Content-Type': 'application/json', ...(options.headers || {}) };
  if (token) headers['Authorization'] = 'Bearer ' + token;
  const res = await fetch(API + endpoint, {
    ...options,
    headers,
    credentials: 'include',
  });
  if (res.status === 401 || res.status === 403) {
    localStorage.removeItem('vb_token');
    localStorage.removeItem('vb_role');
    window.location.href = '/pages/login.html';
    throw new Error('Unauthorized');
  }
  return res.json();
}

async function apiGet(endpoint)         { return apiFetch(endpoint); }
async function apiPost(endpoint, body)  { return apiFetch(endpoint, { method: 'POST', body: JSON.stringify(body) }); }
async function apiPut(endpoint, body)   { return apiFetch(endpoint, { method: 'PUT',  body: JSON.stringify(body) }); }
async function apiPatch(endpoint, body) { return apiFetch(endpoint, { method: 'PATCH', body: JSON.stringify(body) }); }
async function apiDelete(endpoint)      { return apiFetch(endpoint, { method: 'DELETE' }); }

/* ── Toast notifications ──────────────────────────────── */
let toastContainer;
function ensureToastContainer() {
  if (!toastContainer) {
    toastContainer = document.createElement('div');
    toastContainer.className = 'toast-container';
    document.body.appendChild(toastContainer);
  }
}

const TOAST_ICONS = {
  success: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>',
  error:   '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/></svg>',
  warning: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>',
  info:    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/></svg>',
};

function showToast(message, type = 'info', duration = 3500) {
  ensureToastContainer();
  const t = document.createElement('div');
  t.className = `toast ${type}`;
  t.innerHTML = `${TOAST_ICONS[type] || ''}<span style="flex:1">${message}</span>
    <button class="toast-close" onclick="this.parentElement.remove()">
      <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
    </button>`;
  toastContainer.appendChild(t);
  setTimeout(() => { t.style.opacity = '0'; t.style.transition = 'opacity .3s'; setTimeout(() => t.remove(), 300); }, duration);
}

/* ── Confirm modal ────────────────────────────────────── */
function showConfirm({ title, message, confirmText = 'Confirm', type = 'danger' }) {
  return new Promise(resolve => {
    const overlay = document.createElement('div');
    overlay.className = 'modal-overlay open';
    overlay.innerHTML = `
      <div class="modal" style="max-width:400px">
        <div class="modal-body" style="padding:28px 24px 20px;text-align:center">
          <div class="confirm-icon ${type}">
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/>
              <line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/>
            </svg>
          </div>
          <div class="confirm-text">
            <h3>${title}</h3><p>${message}</p>
          </div>
          <div style="display:flex;gap:8px;justify-content:center">
            <button class="btn btn-outline" id="cancelBtn">Cancel</button>
            <button class="btn btn-${type}" id="confirmBtn">${confirmText}</button>
          </div>
        </div>
      </div>`;
    document.body.appendChild(overlay);
    overlay.querySelector('#cancelBtn').onclick  = () => { overlay.remove(); resolve(false); };
    overlay.querySelector('#confirmBtn').onclick = () => { overlay.remove(); resolve(true); };
    overlay.onclick = e => { if (e.target === overlay) { overlay.remove(); resolve(false); } };
  });
}

/* ── Modal helpers ────────────────────────────────────── */
function openModal(id)  { const m = document.getElementById(id); if (m) m.classList.add('open'); }
function closeModal(id) { const m = document.getElementById(id); if (m) m.classList.remove('open'); }
function closeAllModals() { document.querySelectorAll('.modal-overlay.open').forEach(m => m.classList.remove('open')); }

/* ── Loading state ────────────────────────────────────── */
function setLoading(btn, loading, text = '') {
  if (!btn) return;
  btn.disabled = loading;
  btn.classList.toggle('loading', loading);
  if (!loading && text) btn.querySelector('.btn-label').textContent = text;
}

/* ── Format helpers ───────────────────────────────────── */
function formatDate(d) {
  if (!d) return '—';
  return new Date(d).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
}
function formatDateTime(d) {
  if (!d) return '—';
  return new Date(d).toLocaleString('en-IN', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}
function formatCurrency(n, currency = 'INR') {
  if (n == null || isNaN(n)) return '₹0';
  return new Intl.NumberFormat('en-IN', { style: 'currency', currency, maximumFractionDigits: 0 }).format(n);
}
function formatNumber(n) {
  if (n == null) return '0';
  if (n >= 1e7) return (n / 1e7).toFixed(1) + 'Cr';
  if (n >= 1e5) return (n / 1e5).toFixed(1) + 'L';
  if (n >= 1000) return (n / 1000).toFixed(1) + 'K';
  return String(n);
}
function timeAgo(d) {
  if (!d) return '';
  const diff = Date.now() - new Date(d).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1) return 'just now';
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const days = Math.floor(h / 24);
  if (days < 7) return `${days}d ago`;
  return formatDate(d);
}

function roleBadge(role) {
  const labels = { admin:'Admin', procurement_officer:'Procurement Officer', manager:'Manager', vendor:'Vendor' };
  return `<span class="badge badge-${role}">${labels[role] || role}</span>`;
}
function statusBadge(status) {
  return `<span class="badge badge-${status}">${status.charAt(0).toUpperCase()+status.slice(1)}</span>`;
}
function verifiedBadge(v) {
  return v ? `<span class="badge badge-active">Verified</span>` : `<span class="badge badge-pending">Unverified</span>`;
}

/* ── Pagination ───────────────────────────────────────── */
function renderPagination(containerId, pagination, onPageChange) {
  const c = document.getElementById(containerId);
  if (!c) return;
  const { total, page, limit, pages } = pagination;
  const from = Math.min((page - 1) * limit + 1, total);
  const to   = Math.min(page * limit, total);
  let html = `<span class="pagination-info">Showing ${from}–${to} of ${total}</span>`;
  html += `<button class="page-btn" ${page <= 1 ? 'disabled' : ''} onclick="(${onPageChange.toString()})(${page - 1})">‹</button>`;
  const start = Math.max(1, page - 2), end = Math.min(pages, page + 2);
  if (start > 1) html += `<button class="page-btn" onclick="(${onPageChange.toString()})(1)">1</button>${start > 2 ? '<span class="page-btn" style="border:none;cursor:default">…</span>' : ''}`;
  for (let i = start; i <= end; i++) html += `<button class="page-btn ${i === page ? 'active' : ''}" onclick="(${onPageChange.toString()})(${i})">${i}</button>`;
  if (end < pages) html += `${end < pages - 1 ? '<span class="page-btn" style="border:none;cursor:default">…</span>' : ''}<button class="page-btn" onclick="(${onPageChange.toString()})(${pages})">${pages}</button>`;
  html += `<button class="page-btn" ${page >= pages ? 'disabled' : ''} onclick="(${onPageChange.toString()})(${page + 1})">›</button>`;
  c.innerHTML = html;
}

/* ── Sidebar active state ─────────────────────────────── */
function setActiveNav(page) {
  document.querySelectorAll('.nav-item').forEach(item => {
    item.classList.toggle('active', item.dataset.page === page);
  });
}

/* ── Sidebar toggle (mobile) ──────────────────────────── */
function initSidebarToggle() {
  const hamburger = document.getElementById('hamburger');
  const sidebar   = document.getElementById('sidebar');
  const overlay   = document.getElementById('sidebarOverlay');
  if (!hamburger) return;
  hamburger.onclick = () => { sidebar.classList.toggle('open'); overlay.classList.toggle('open'); };
  if (overlay) overlay.onclick = () => { sidebar.classList.remove('open'); overlay.classList.remove('open'); };
}

/* ── Load admin user info into sidebar ────────────────── */
async function loadAdminInfo() {
  try {
    const data = await apiGet('/dashboard/stats').catch(() => null);
    const stored = { name: localStorage.getItem('vb_name') || 'Admin', role: 'admin' };
    const nameEl = document.getElementById('adminName');
    const roleEl = document.getElementById('adminRole');
    if (nameEl) nameEl.textContent = stored.name;
    if (roleEl) roleEl.textContent = 'Administrator';
    // avatar initials
    const av = document.getElementById('adminAvatar');
    if (av) av.textContent = stored.name.charAt(0).toUpperCase();
  } catch(e) {}
}

/* ── Update notification badge ────────────────────────── */
async function updateNotifBadge() {
  try {
    const data = await apiGet('/notifications/unread-count');
    const badge = document.getElementById('notifBadge');
    if (badge) {
      if (data.unread_count > 0) {
        badge.textContent = data.unread_count > 99 ? '99+' : data.unread_count;
        badge.style.display = 'inline-block';
      } else {
        badge.style.display = 'none';
      }
    }
    const dot = document.getElementById('notifDot');
    if (dot) dot.style.display = data.unread_count > 0 ? 'block' : 'none';
  } catch(e) {}
}

/* ── Logout ───────────────────────────────────────────── */
async function adminLogout() {
  try { await apiPost('/../../auth/logout', {}); } catch(e) {}
  localStorage.removeItem('vb_token');
  localStorage.removeItem('vb_role');
  localStorage.removeItem('vb_name');
  window.location.href = '/pages/login.html';
}

/* ── Simple bar chart on canvas ──────────────────────── */
function drawBarChart(canvasId, labels, datasets, opts = {}) {
  const canvas = document.getElementById(canvasId);
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  const dpr = window.devicePixelRatio || 1;
  const W = canvas.parentElement.offsetWidth || 600;
  const H = opts.height || 220;
  canvas.width = W * dpr; canvas.height = H * dpr;
  canvas.style.width = W + 'px'; canvas.style.height = H + 'px';
  ctx.scale(dpr, dpr);

  const pad = { top: 20, right: 16, bottom: 40, left: 52 };
  const cW = W - pad.left - pad.right;
  const cH = H - pad.top - pad.bottom;
  const maxVal = Math.max(...datasets.flatMap(d => d.data), 1);
  const barW = Math.max(4, (cW / labels.length) * 0.5);
  const gap  = cW / labels.length;

  // Grid
  ctx.strokeStyle = '#e2e8f0'; ctx.lineWidth = 1;
  for (let i = 0; i <= 4; i++) {
    const y = pad.top + (i / 4) * cH;
    ctx.beginPath(); ctx.moveTo(pad.left, y); ctx.lineTo(pad.left + cW, y); ctx.stroke();
    ctx.fillStyle = '#94a3b8'; ctx.font = '10px Inter,sans-serif'; ctx.textAlign = 'right';
    ctx.fillText(formatNumber(Math.round(maxVal * (1 - i / 4))), pad.left - 6, y + 4);
  }

  // Bars
  datasets.forEach((ds, di) => {
    const offset = di * (barW + 2) - ((datasets.length - 1) * (barW + 2)) / 2;
    ds.data.forEach((val, i) => {
      const x = pad.left + i * gap + gap / 2 + offset - barW / 2;
      const bH = Math.max(2, (val / maxVal) * cH);
      const y  = pad.top + cH - bH;
      ctx.fillStyle = ds.color || '#2563eb';
      ctx.beginPath();
      ctx.roundRect ? ctx.roundRect(x, y, barW, bH, [3, 3, 0, 0]) : ctx.rect(x, y, barW, bH);
      ctx.fill();
    });
  });

  // X labels
  ctx.fillStyle = '#94a3b8'; ctx.font = '10px Inter,sans-serif'; ctx.textAlign = 'center';
  labels.forEach((lbl, i) => {
    ctx.fillText(lbl, pad.left + i * gap + gap / 2, H - 10);
  });
}

/* ── Simple line chart on canvas ─────────────────────── */
function drawLineChart(canvasId, labels, datasets, opts = {}) {
  const canvas = document.getElementById(canvasId);
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  const dpr = window.devicePixelRatio || 1;
  const W = canvas.parentElement.offsetWidth || 600;
  const H = opts.height || 200;
  canvas.width = W * dpr; canvas.height = H * dpr;
  canvas.style.width = W + 'px'; canvas.style.height = H + 'px';
  ctx.scale(dpr, dpr);

  const pad = { top: 16, right: 16, bottom: 36, left: 52 };
  const cW = W - pad.left - pad.right;
  const cH = H - pad.top - pad.bottom;
  const allVals = datasets.flatMap(d => d.data);
  const maxVal  = Math.max(...allVals, 1);

  ctx.strokeStyle = '#e2e8f0'; ctx.lineWidth = 1;
  for (let i = 0; i <= 4; i++) {
    const y = pad.top + (i / 4) * cH;
    ctx.beginPath(); ctx.moveTo(pad.left, y); ctx.lineTo(pad.left + cW, y); ctx.stroke();
    ctx.fillStyle = '#94a3b8'; ctx.font = '10px Inter'; ctx.textAlign = 'right';
    ctx.fillText(formatNumber(Math.round(maxVal * (1 - i / 4))), pad.left - 6, y + 4);
  }

  datasets.forEach(ds => {
    const pts = ds.data.map((v, i) => ({
      x: pad.left + (i / Math.max(labels.length - 1, 1)) * cW,
      y: pad.top + cH - (v / maxVal) * cH,
    }));
    if (pts.length < 2) return;

    // Area fill
    const grad = ctx.createLinearGradient(0, pad.top, 0, pad.top + cH);
    const col = ds.color || '#2563eb';
    grad.addColorStop(0, col + '28'); grad.addColorStop(1, col + '00');
    ctx.beginPath();
    ctx.moveTo(pts[0].x, pts[0].y);
    pts.slice(1).forEach((p, i) => {
      const cp = (pts[i].x + p.x) / 2;
      ctx.bezierCurveTo(cp, pts[i].y, cp, p.y, p.x, p.y);
    });
    ctx.lineTo(pts[pts.length - 1].x, pad.top + cH);
    ctx.lineTo(pts[0].x, pad.top + cH);
    ctx.closePath(); ctx.fillStyle = grad; ctx.fill();

    // Line
    ctx.beginPath(); ctx.moveTo(pts[0].x, pts[0].y);
    pts.slice(1).forEach((p, i) => {
      const cp = (pts[i].x + p.x) / 2;
      ctx.bezierCurveTo(cp, pts[i].y, cp, p.y, p.x, p.y);
    });
    ctx.strokeStyle = col; ctx.lineWidth = 2.5; ctx.stroke();

    // Dots
    pts.forEach(p => {
      ctx.beginPath(); ctx.arc(p.x, p.y, 3.5, 0, Math.PI * 2);
      ctx.fillStyle = col; ctx.fill();
      ctx.beginPath(); ctx.arc(p.x, p.y, 1.5, 0, Math.PI * 2);
      ctx.fillStyle = '#fff'; ctx.fill();
    });
  });

  ctx.fillStyle = '#94a3b8'; ctx.font = '10px Inter'; ctx.textAlign = 'center';
  labels.forEach((lbl, i) => {
    const x = pad.left + (i / Math.max(labels.length - 1, 1)) * cW;
    ctx.fillText(lbl, x, H - 8);
  });
}

/* ── CSV export from table ────────────────────────────── */
function exportTableToCSV(tableId, filename) {
  const table = document.getElementById(tableId);
  if (!table) return;
  const rows = Array.from(table.querySelectorAll('tr'));
  const csv  = rows.map(row =>
    Array.from(row.querySelectorAll('th,td'))
      .map(cell => {
        let t = cell.innerText.replace(/\n/g, ' ').trim();
        return t.includes(',') || t.includes('"') ? `"${t.replace(/"/g, '""')}"` : t;
      }).join(',')
  ).join('\n');
  const blob = new Blob([csv], { type: 'text/csv' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = filename || 'export.csv';
  a.click();
}

/* ── AI Insights Functions ────────────────────────────── */

async function loadAIInsights() {
  const type = document.getElementById('aiInsightType').value;
  const period = document.getElementById('aiInsightPeriod').value;
  const loader = document.getElementById('aiInsightsLoader');
  const content = document.getElementById('aiInsightsContent');
  
  try {
    loader.style.display = 'block';
    content.innerHTML = '';
    
    const response = await fetch(`/api/admin/analytics/ai-insights?type=${type}&period=${period}`, {
      headers: { 'Authorization': `Bearer ${getToken()}` }
    });
    
    if (!response.ok) throw new Error('Failed to load AI insights');
    
    const result = await response.json();
    loader.style.display = 'none';
    
    if (result.success) {
      renderAIInsights(result.data);
    } else {
      content.innerHTML = `<div class="alert alert-error">${result.message}</div>`;
    }
    
  } catch (error) {
    console.error('AI insights error:', error);
    loader.style.display = 'none';
    content.innerHTML = `<div class="alert alert-error">Failed to generate AI insights: ${error.message}</div>`;
  }
}

function renderAIInsights(data) {
  const content = document.getElementById('aiInsightsContent');
  const insights = data.insights;
  
  let html = `
    <div style="margin-bottom: 20px;">
      <div class="insight-meta" style="background: #f8fafc; padding: 12px; border-radius: 8px; margin-bottom: 20px;">
        <strong>Analysis Type:</strong> ${data.type.charAt(0).toUpperCase() + data.type.slice(1)} | 
        <strong>Period:</strong> Last ${data.period} days | 
        <strong>Generated:</strong> ${new Date(data.generated_at).toLocaleString()}
      </div>
    </div>
  `;
  
  // Insights section
  if (insights.insights && insights.insights.length > 0) {
    html += `
      <div class="insight-section" style="margin-bottom: 30px;">
        <h3 style="color: #1f2937; margin-bottom: 15px;">🔍 Key Insights</h3>
        <div class="insights-grid" style="display: grid; gap: 12px;">
    `;
    
    insights.insights.forEach(insight => {
      html += `<div class="insight-item" style="background: #ecfdf5; border: 1px solid #d1fae5; padding: 15px; border-radius: 8px;">
        <p style="margin: 0; color: #065f46;">${insight}</p>
      </div>`;
    });
    
    html += `</div></div>`;
  }
  
  // Recommendations section
  if (insights.recommendations && insights.recommendations.length > 0) {
    html += `
      <div class="insight-section" style="margin-bottom: 30px;">
        <h3 style="color: #1f2937; margin-bottom: 15px;">💡 Recommendations</h3>
        <div class="recommendations-grid" style="display: grid; gap: 12px;">
    `;
    
    insights.recommendations.forEach(rec => {
      html += `<div class="recommendation-item" style="background: #eff6ff; border: 1px solid #bfdbfe; padding: 15px; border-radius: 8px;">
        <p style="margin: 0; color: #1e40af;">${rec}</p>
      </div>`;
    });
    
    html += `</div></div>`;
  }
  
  // Risk factors section
  if (insights.risk_factors && insights.risk_factors.length > 0) {
    html += `
      <div class="insight-section" style="margin-bottom: 30px;">
        <h3 style="color: #1f2937; margin-bottom: 15px;">⚠️ Risk Factors</h3>
        <div class="risks-grid" style="display: grid; gap: 12px;">
    `;
    
    insights.risk_factors.forEach(risk => {
      html += `<div class="risk-item" style="background: #fef2f2; border: 1px solid #fecaca; padding: 15px; border-radius: 8px;">
        <p style="margin: 0; color: #dc2626;">${risk}</p>
      </div>`;
    });
    
    html += `</div></div>`;
  }
  
  // Cost optimization section
  if (insights.cost_optimization && insights.cost_optimization.length > 0) {
    html += `
      <div class="insight-section" style="margin-bottom: 30px;">
        <h3 style="color: #1f2937; margin-bottom: 15px;">💰 Cost Optimization</h3>
        <div class="optimization-grid" style="display: grid; gap: 12px;">
    `;
    
    insights.cost_optimization.forEach(opt => {
      html += `<div class="optimization-item" style="background: #fefce8; border: 1px solid #fde68a; padding: 15px; border-radius: 8px;">
        <p style="margin: 0; color: #a16207;">${opt}</p>
      </div>`;
    });
    
    html += `</div></div>`;
  }
  
  // Trend analysis
  if (insights.trend_analysis) {
    html += `
      <div class="insight-section">
        <h3 style="color: #1f2937; margin-bottom: 15px;">📈 Trend Analysis</h3>
        <div class="trend-analysis" style="background: #f3f4f6; border: 1px solid #d1d5db; padding: 20px; border-radius: 8px;">
          <p style="margin: 0; color: #374151; line-height: 1.6;">${insights.trend_analysis}</p>
        </div>
      </div>
    `;
  }
  
  // Add CSS for spinner if not already present
  if (!document.querySelector('#ai-spinner-styles')) {
    html += `
      <style id="ai-spinner-styles">
        .spinner {
          width: 40px;
          height: 40px;
          border: 4px solid #f3f3f3;
          border-top: 4px solid #3498db;
          border-radius: 50%;
          animation: spin 1s linear infinite;
          margin: 0 auto;
        }
        @keyframes spin {
          0% { transform: rotate(0deg); }
          100% { transform: rotate(360deg); }
        }
        .alert {
          padding: 12px 16px;
          border-radius: 6px;
          margin: 10px 0;
        }
        .alert-error {
          background-color: #fee2e2;
          border: 1px solid #fecaca;
          color: #dc2626;
        }
      </style>
    `;
  }
  
  content.innerHTML = html;
}

/* ── Init page (call on every admin page) ─────────────── */
function initAdminPage(activeNav) {
  if (!requireAdmin()) return false;
  initSidebarToggle();
  setActiveNav(activeNav);
  loadAdminInfo();
  updateNotifBadge();
  // Auto-refresh notif badge every 60s
  setInterval(updateNotifBadge, 60000);

  // Close modals on overlay click
  document.addEventListener('click', e => {
    if (e.target.classList.contains('modal-overlay')) {
      e.target.classList.remove('open');
    }
  });
  // ESC key closes modals
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape') closeAllModals();
  });

  return true;
}

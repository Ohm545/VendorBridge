/* VendorBridge Procurement Module — Shared JS */
const API = '/api/procurement';

function getToken(){ return localStorage.getItem('vb_token'); }
function getRole(){  return localStorage.getItem('vb_role'); }

function requireProcurement(){
  const token = getToken(), role = getRole();
  if (!token || role !== 'procurement_officer'){
    window.location.href = '/pages/login.html'; return false;
  }
  return true;
}

async function apiFetch(endpoint, options={}){
  const token = getToken();
  const headers = {'Content-Type':'application/json',...(options.headers||{})};
  if(token) headers['Authorization'] = 'Bearer '+token;
  const res = await fetch(API+endpoint,{...options,headers,credentials:'include'});
  if(res.status===401||res.status===403){
    localStorage.removeItem('vb_token');localStorage.removeItem('vb_role');
    window.location.href='/pages/login.html'; throw new Error('Unauthorized');
  }
  return res.json();
}
async function apiGet(ep)         { return apiFetch(ep); }
async function apiPost(ep,body)   { return apiFetch(ep,{method:'POST',body:JSON.stringify(body)}); }
async function apiPut(ep,body)    { return apiFetch(ep,{method:'PUT',body:JSON.stringify(body)}); }
async function apiPatch(ep,body)  { return apiFetch(ep,{method:'PATCH',body:JSON.stringify(body)}); }
async function apiDelete(ep)      { return apiFetch(ep,{method:'DELETE'}); }

/* Toast */
let _tc;
function ensureTC(){ if(!_tc){_tc=document.createElement('div');_tc.className='toast-container';document.body.appendChild(_tc);} }
const TICONS={success:'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>',error:'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/></svg>',warning:'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>',info:'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/></svg>'};
function showToast(msg,type='info',dur=3500){
  ensureTC();
  const t=document.createElement('div'); t.className=`toast ${type}`;
  t.innerHTML=`${TICONS[type]||''}<span style="flex:1">${msg}</span><button class="toast-close" onclick="this.parentElement.remove()"><svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg></button>`;
  _tc.appendChild(t);
  setTimeout(()=>{t.style.opacity='0';t.style.transition='opacity .3s';setTimeout(()=>t.remove(),300);},dur);
}

function showConfirm({title,message,confirmText='Confirm',type='danger'}){
  return new Promise(resolve=>{
    const ov=document.createElement('div'); ov.className='modal-overlay open';
    ov.innerHTML=`<div class="modal" style="max-width:400px"><div class="modal-body" style="padding:28px 24px 20px;text-align:center">
      <div class="confirm-icon ${type}"><svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg></div>
      <div class="confirm-text"><h3>${title}</h3><p>${message}</p></div>
      <div style="display:flex;gap:8px;justify-content:center">
        <button class="btn btn-outline" id="cc">Cancel</button>
        <button class="btn btn-${type}" id="co">${confirmText}</button>
      </div></div></div>`;
    document.body.appendChild(ov);
    ov.querySelector('#cc').onclick=()=>{ov.remove();resolve(false);};
    ov.querySelector('#co').onclick=()=>{ov.remove();resolve(true);};
    ov.onclick=e=>{if(e.target===ov){ov.remove();resolve(false);}};
  });
}

function openModal(id){ const m=document.getElementById(id); if(m) m.classList.add('open'); }
function closeModal(id){ const m=document.getElementById(id); if(m) m.classList.remove('open'); }
function closeAllModals(){ document.querySelectorAll('.modal-overlay.open').forEach(m=>m.classList.remove('open')); }
function setLoading(btn,loading){ if(!btn)return; btn.disabled=loading; btn.classList.toggle('loading',loading); }

function formatDate(d){ if(!d)return'—'; return new Date(d).toLocaleDateString('en-IN',{day:'2-digit',month:'short',year:'numeric'}); }
function formatDateTime(d){ if(!d)return'—'; return new Date(d).toLocaleString('en-IN',{day:'2-digit',month:'short',year:'numeric',hour:'2-digit',minute:'2-digit'}); }
function formatCurrency(n,c='INR'){ if(n==null||isNaN(n))return'₹0'; return new Intl.NumberFormat('en-IN',{style:'currency',currency:c,maximumFractionDigits:0}).format(n); }
function formatNumber(n){ if(n==null)return'0'; if(n>=1e7)return(n/1e7).toFixed(1)+'Cr'; if(n>=1e5)return(n/1e5).toFixed(1)+'L'; if(n>=1000)return(n/1000).toFixed(1)+'K'; return String(n); }
function timeAgo(d){ if(!d)return''; const diff=Date.now()-new Date(d).getTime(),m=Math.floor(diff/60000); if(m<1)return'just now'; if(m<60)return`${m}m ago`; const h=Math.floor(m/60); if(h<24)return`${h}h ago`; return formatDate(d); }

function statusBadge(s){ if(!s)return''; const map={draft:'draft',active:'active_rfq',quotation_received:'quotation_received',pending_approval:'pending_approval',approved:'approved',rejected:'rejected',po_generated:'po_generated',invoice_generated:'invoice_generated',closed:'closed',cancelled:'cancelled',pending:'pending',paid:'paid',overdue:'overdue',issued:'issued',delivered:'success',acknowledged:'info'}; return `<span class="badge badge-${map[s]||s}">${s.replace(/_/g,' ')}</span>`; }

function renderPagination(containerId,pagination,onPageChange){
  const c=document.getElementById(containerId); if(!c)return;
  const{total,page,limit,pages}=pagination;
  const from=Math.min((page-1)*limit+1,total),to=Math.min(page*limit,total);
  let html=`<span class="pagination-info">Showing ${from}–${to} of ${total}</span>`;
  html+=`<button class="page-btn" ${page<=1?'disabled':''} onclick="(${onPageChange.toString()})(${page-1})">‹</button>`;
  const start=Math.max(1,page-2),end=Math.min(pages,page+2);
  if(start>1) html+=`<button class="page-btn" onclick="(${onPageChange.toString()})(1)">1</button>${start>2?'<span class="page-btn" style="border:none;cursor:default">…</span>':''}`;
  for(let i=start;i<=end;i++) html+=`<button class="page-btn ${i===page?'active':''}" onclick="(${onPageChange.toString()})(${i})">${i}</button>`;
  if(end<pages) html+=`${end<pages-1?'<span class="page-btn" style="border:none;cursor:default">…</span>':''}<button class="page-btn" onclick="(${onPageChange.toString()})(${pages})">${pages}</button>`;
  html+=`<button class="page-btn" ${page>=pages?'disabled':''} onclick="(${onPageChange.toString()})(${page+1})">›</button>`;
  c.innerHTML=html;
}

function setActiveNav(page){ document.querySelectorAll('.nav-item').forEach(i=>i.classList.toggle('active',i.dataset.page===page)); }

function initSidebarToggle(){
  const h=document.getElementById('hamburger'),s=document.getElementById('sidebar'),o=document.getElementById('sidebarOverlay');
  if(!h)return;
  h.onclick=()=>{s.classList.toggle('open');o.classList.toggle('open');};
  if(o) o.onclick=()=>{s.classList.remove('open');o.classList.remove('open');};
}

async function loadUserInfo(){
  try{
    const res=await fetch('/auth/me',{headers:{'Authorization':'Bearer '+getToken()},credentials:'include'});
    const d=await res.json();
    if(d.success&&d.user){
      localStorage.setItem('vb_name',d.user.full_name);
      const nameEl=document.getElementById('userName'); if(nameEl)nameEl.textContent=d.user.full_name;
      const avEl=document.getElementById('userAvatar'); if(avEl)avEl.textContent=d.user.full_name.charAt(0).toUpperCase();
    }
  }catch(e){}
}

async function updateNotifBadge(){
  try{
    const d=await apiGet('/notifications/unread-count');
    const badge=document.getElementById('notifBadge');
    if(badge){badge.textContent=d.unread_count>99?'99+':d.unread_count;badge.style.display=d.unread_count>0?'inline-block':'none';}
    const dot=document.getElementById('notifDot');
    if(dot) dot.style.display=d.unread_count>0?'block':'none';
  }catch(e){}
}

async function procurementLogout(){
  try{await fetch('/auth/logout',{method:'POST',credentials:'include'});}catch(e){}
  localStorage.removeItem('vb_token');localStorage.removeItem('vb_role');localStorage.removeItem('vb_name');
  window.location.href='/pages/login.html';
}

function drawLineChart(canvasId,labels,datasets,opts={}){
  const canvas=document.getElementById(canvasId); if(!canvas)return;
  const ctx=canvas.getContext('2d'); const dpr=window.devicePixelRatio||1;
  const W=canvas.parentElement.offsetWidth||600,H=opts.height||200;
  canvas.width=W*dpr;canvas.height=H*dpr;canvas.style.width=W+'px';canvas.style.height=H+'px';ctx.scale(dpr,dpr);
  const pad={top:16,right:16,bottom:36,left:52},cW=W-pad.left-pad.right,cH=H-pad.top-pad.bottom;
  const maxVal=Math.max(...datasets.flatMap(d=>d.data),1);
  ctx.strokeStyle='#e2e8f0';ctx.lineWidth=1;
  for(let i=0;i<=4;i++){const y=pad.top+(i/4)*cH;ctx.beginPath();ctx.moveTo(pad.left,y);ctx.lineTo(pad.left+cW,y);ctx.stroke();ctx.fillStyle='#94a3b8';ctx.font='10px Inter';ctx.textAlign='right';ctx.fillText(formatNumber(Math.round(maxVal*(1-i/4))),pad.left-6,y+4);}
  datasets.forEach(ds=>{
    const pts=ds.data.map((v,i)=>({x:pad.left+(i/Math.max(labels.length-1,1))*cW,y:pad.top+cH-(v/maxVal)*cH}));
    if(pts.length<2)return;
    const col=ds.color||'#2563eb';
    const grad=ctx.createLinearGradient(0,pad.top,0,pad.top+cH);grad.addColorStop(0,col+'28');grad.addColorStop(1,col+'00');
    ctx.beginPath();ctx.moveTo(pts[0].x,pts[0].y);
    pts.slice(1).forEach((p,i)=>{const cp=(pts[i].x+p.x)/2;ctx.bezierCurveTo(cp,pts[i].y,cp,p.y,p.x,p.y);});
    ctx.lineTo(pts[pts.length-1].x,pad.top+cH);ctx.lineTo(pts[0].x,pad.top+cH);ctx.closePath();ctx.fillStyle=grad;ctx.fill();
    ctx.beginPath();ctx.moveTo(pts[0].x,pts[0].y);
    pts.slice(1).forEach((p,i)=>{const cp=(pts[i].x+p.x)/2;ctx.bezierCurveTo(cp,pts[i].y,cp,p.y,p.x,p.y);});
    ctx.strokeStyle=col;ctx.lineWidth=2.5;ctx.stroke();
    pts.forEach(p=>{ctx.beginPath();ctx.arc(p.x,p.y,3.5,0,Math.PI*2);ctx.fillStyle=col;ctx.fill();ctx.beginPath();ctx.arc(p.x,p.y,1.5,0,Math.PI*2);ctx.fillStyle='#fff';ctx.fill();});
  });
  ctx.fillStyle='#94a3b8';ctx.font='10px Inter';ctx.textAlign='center';
  labels.forEach((lbl,i)=>{ctx.fillText(lbl,pad.left+(i/Math.max(labels.length-1,1))*cW,H-8);});
}

async function downloadCSV(endpoint,filename){
  const res=await fetch(API+endpoint,{headers:{'Authorization':'Bearer '+getToken()},credentials:'include'});
  const blob=await res.blob();const a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download=filename;a.click();
}

function initProcurementPage(activeNav){
  if(!requireProcurement())return false;
  initSidebarToggle();setActiveNav(activeNav);loadUserInfo();updateNotifBadge();
  setInterval(updateNotifBadge,60000);
  document.addEventListener('click',e=>{if(e.target.classList.contains('modal-overlay'))e.target.classList.remove('open');});
  document.addEventListener('keydown',e=>{if(e.key==='Escape')closeAllModals();});
  return true;
}

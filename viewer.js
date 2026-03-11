import * as pdfjsLib from './lib/pdf.mjs';
pdfjsLib.GlobalWorkerOptions.workerSrc = chrome.runtime.getURL('lib/pdf.worker.mjs');

/* ══════════════════ STATE ══════════════════ */
const S={
  pdf:null,total:0,cur:1,scale:1,base:1,
  tool:'pen',color:'#E63946',spx:3,fs:18,opacity:1,
  strokes:{},stickies:{},rotation:{}, // rotation: {pageN: 0|90|180|270}
  redo:{},drawing:false,cs:null,tp:null,
  dragSticky:null,
  panelOpen:false,sidebarOpen:false,curTab:'pages',theme:'lt',
  srchOpen:false,pdfUrl:null,fileName:'',
  recent:[],colorRecent:[],
  bookmarks:[],
  modes:{reading:false,night:false,twoPage:false},
  annotationStorage:null,
  readPos:{},
};

/* ══════════════════ DOM ══════════════════ */
const $=id=>document.getElementById(id);
const D={
  body:document.body,bar:$('bar'),shell:$('shell'),
  vp:$('vp'),pages:$('pages'),dz:$('dz'),
  fileName:$('fileName'),fileChip:$('fileChip'),
  pageInput:$('pageInput'),totalPg:$('totalPg'),
  btnPrev:$('btnPrev'),btnNext:$('btnNext'),
  btnZoomOut:$('btnZoomOut'),btnZoomIn:$('btnZoomIn'),
  btnFit:$('btnFit'),zoomLbl:$('zoomLbl'),
  btnSearch:$('btnSearch'),sbar:$('sbar'),searchInput:$('searchInput'),
  btnSPrev:$('btnSPrev'),btnSNext:$('btnSNext'),btnSClose:$('btnSClose'),
  btnSidebar:$('btnSidebar'),lsidebar:$('lsidebar'),
  panePages:$('pane-pages'),paneToc:$('pane-toc'),paneBk:$('pane-bookmarks'),
  sdl:$('sdl'),btnDlMain:$('btnDlMain'),btnDlArr:$('btnDlArr'),sdlDrop:$('sdlDrop'),
  dlWithMk:$('dlWithMk'),dlNoMk:$('dlNoMk'),
  btnMenu:$('btnMenu'),mdrop:$('mdrop'),
  miOpen:$('miOpen'),miOpenDiv:$('miOpenDiv'),
  miReadMode:$('miReadMode'),miNight:$('miNight'),miTwoPage:$('miTwoPage'),miShowFab:$('miShowFab'),
  miPresent:$('miPresent'),miPrint:$('miPrint'),miRotatePage:$('miRotatePage'),miExtract:$('miExtract'),miExportPNG:$('miExportPNG'),
  miAnnExport:$('miAnnExport'),annFile:$('annFile'),miDocProps:$('miDocProps'),miSettings:$('miSettings'),
  fileInput:$('fileInput'),fileMenu:$('fileMenu'),
  fab:$('fab'),mkp:$('mkp'),btnClear:$('btnClear'),
  btnUndo:$('btnUndo'),btnRedo:$('btnRedo'),
  strokeSec:$('strokeSec'),fontSec:$('fontSec'),
  strokeSl:$('strokeSl'),strokeV:$('strokeV'),
  fontSl:$('fontSl'),fontV:$('fontV'),
  opacSl:$('opacSl'),opacV:$('opacV'),
  colorPicker:$('colorPicker'),cbigInner:$('cbigInner'),cbigLbl:$('cbigLbl'),
  btnEye:$('btnEye'),recentRow:$('recentRow'),
  textFloat:$('textFloat'),textField:$('textField'),
  btnTok:$('btnTok'),btnTno:$('btnTno'),
  recentSection:$('recentSection'),
};

/* ══════════════════ SETTINGS (must be before theme & FAB init) ══════════════════ */
const SETTINGS_DEFAULTS={
  scrollMode:'continuous',
  defaultZoom:'fit',
  openSidebar:false,
  stickyBadges:true,
  annotOpacity:100,
  defaultTool:'pen',
  invertAnnotNight:false,
  autosavePos:true,
  showFab:true,
  themeMode:'system',   // 'system' | 'lt' | 'dk'
};
function loadSettings(){
  try{return Object.assign({},SETTINGS_DEFAULTS,JSON.parse(localStorage.getItem('lm_settings')||'{}'));}
  catch{return {...SETTINGS_DEFAULTS};}
}
function saveSettings(st){localStorage.setItem('lm_settings',JSON.stringify(st));}
S.settings=loadSettings();

/* ══════════════════ THEME ══════════════════ */
function resolveTheme(mode){
  if(mode==='system') return window.matchMedia('(prefers-color-scheme: dark)').matches?'dk':'lt';
  return mode;
}
function setTheme(t){
  S.theme=t;D.body.className=t;
  const dk=t==='dk';
  $('themeIcon').textContent=dk?'dark_mode':'light_mode';
  $('themeLabel').textContent=dk?'Dunkel':'Hell';
  localStorage.setItem('lm_theme',t);
}
// On load: use themeMode from settings; legacy lm_theme key as fallback
{
  const mode=S.settings.themeMode||'system';
  setTheme(resolveTheme(mode));
}
// Listen for OS-level changes if mode is 'system'
window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change',()=>{
  if(S.settings.themeMode==='system') setTheme(resolveTheme('system'));
});
$('themeToggle').addEventListener('click',e=>{e.stopPropagation();setTheme(S.theme==='lt'?'dk':'lt');});

/* ══════════════════ MENUS ══════════════════ */
function closeMenus(){D.mdrop.classList.remove('open');D.sdlDrop.classList.remove('open');}
D.btnMenu.addEventListener('click',e=>{e.stopPropagation();D.sdlDrop.classList.remove('open');D.mdrop.classList.toggle('open');});
D.btnDlArr.addEventListener('click',e=>{e.stopPropagation();closeMenus();D.sdlDrop.classList.toggle('open',!D.sdlDrop.classList.contains('open'));});
document.addEventListener('click',closeMenus);
D.mdrop.addEventListener('click',e=>e.stopPropagation());
D.sdlDrop.addEventListener('click',e=>e.stopPropagation());

/* ══════════════════ DIALOG HELPER ══════════════════ */
function showDialog({icon='warning',iconCls='',title,msg,confirmLabel='OK',confirmCls='pri',input:withInput=false,onConfirm,onCancel}){
  const bd=document.createElement('div');bd.className='backdrop';
  bd.innerHTML=`<div class="dialog-box">
    <div class="dlg-ico ${iconCls||''}"><span class="material-icons-round">${icon}</span></div>
    <div class="dlg-title">${title}</div>
    <div class="dlg-msg">${msg}</div>
    ${withInput?`<input class="dlg-input" id="dlg-inp" type="text" placeholder="Lesezeichen-Name…"/>`:''}
    <div class="dlg-btns">
      <button class="cbtn ghost" id="dlg-no">Abbrechen</button>
      <button class="cbtn ${confirmCls}" id="dlg-yes">${confirmLabel}</button>
    </div>
  </div>`;
  document.body.appendChild(bd);
  const inp=bd.querySelector('#dlg-inp');
  if(inp) setTimeout(()=>inp.focus(),50);
  bd.querySelector('#dlg-no').addEventListener('click',()=>{bd.remove();onCancel?.();});
  bd.querySelector('#dlg-yes').addEventListener('click',()=>{bd.remove();onConfirm?.(inp?.value||'');});
  bd.addEventListener('click',e=>{if(e.target===bd){bd.remove();onCancel?.();}});
  return bd;
}

/* ══════════════════ RECENT FILES ══════════════════ */
function loadRecent(){
  try{S.recent=JSON.parse(localStorage.getItem('lm_recent')||'[]');}catch{S.recent=[];}
  renderRecent();
}
function addRecent(name){
  S.recent=S.recent.filter(n=>n!==name);
  S.recent.unshift(name);
  if(S.recent.length>6) S.recent.pop();
  localStorage.setItem('lm_recent',JSON.stringify(S.recent));
  renderRecent();
}
function renderRecent(){
  if(!S.recent.length){D.recentSection.innerHTML='';return;}
  D.recentSection.innerHTML=`<div class="recent-section">
    <div class="recent-title">Zuletzt geöffnet</div>
    ${S.recent.map(n=>`<div class="recent-item"><span class="material-icons-round">picture_as_pdf</span><span class="recent-name" title="${n}">${n}</span></div>`).join('')}
  </div>`;
}
loadRecent();

/* ══════════════════ FILE HANDLING ══════════════════ */
function hasMarkup(){return Object.values(S.strokes).some(a=>a.length>0)||Object.values(S.stickies).some(a=>a.length>0);}
function handleFile(f){
  if(!f||f.type!=='application/pdf')return;
  const doOpen=()=>{
    if(S.pdfUrl)URL.revokeObjectURL(S.pdfUrl);
    S.pdfUrl=URL.createObjectURL(f);S.fileName=f.name;
    D.fileName.textContent=f.name;D.fileChip.title=f.name;
    D.miOpen.classList.remove('hidden');D.miOpenDiv.classList.remove('hidden');
    addRecent(f.name);closeMenus();loadPDF(S.pdfUrl);
  };
  if(S.pdf&&hasMarkup()){
    showDialog({icon:'warning',iconCls:'',title:'Ungespeichertes Markup',msg:'Das aktuelle Dokument enthält Annotationen. Diese gehen beim Öffnen einer neuen Datei verloren.',confirmLabel:'Trotzdem öffnen',confirmCls:'danger',onConfirm:doOpen});
  } else doOpen();
}
D.fileInput.onchange=e=>handleFile(e.target.files[0]);
D.fileMenu.onchange=e=>handleFile(e.target.files[0]);
D.vp.addEventListener('dragover',e=>{e.preventDefault();D.vp.style.outline='3px dashed var(--pr)';});
D.vp.addEventListener('dragleave',()=>D.vp.style.outline='');
D.vp.addEventListener('drop',e=>{e.preventDefault();D.vp.style.outline='';handleFile(e.dataTransfer.files[0]);});

/* ══════════════════ PDF LOAD ══════════════════ */
async function loadPDF(url){
  D.dz.classList.add('hidden');D.pages.classList.remove('hidden');
  D.pages.innerHTML=`<div class="stov"><div class="spin"></div><p style="font-size:14px;font-weight:600;color:var(--osv)">Lade Dokument…</p></div>`;
  D.panePages.innerHTML='';D.paneToc.innerHTML='';D.paneBk.innerHTML='';
  S.strokes={};S.stickies={};S.rotation={};S.redo={};
  try{S.annotationStorage=new pdfjsLib.AnnotationStorage();}catch(e){S.annotationStorage=null;}
  updFab();updSplit();

  // cMapUrl: lokal aus Extension, falls chrome.runtime verfügbar, sonst CDN-Fallback
  const cMapUrl = (typeof chrome !== 'undefined' && chrome.runtime?.getURL)
    ? chrome.runtime.getURL('lib/cmaps/')
    : 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/4.4.168/cmaps/';

  try{
    let docSource;

    if(url.startsWith('blob:') || url.startsWith('data:') || url.startsWith('file:')){
      // Blob-, Data- und file://-URLs können direkt übergeben werden (kein CORS)
      docSource = {url, cMapUrl, cMapPacked:true};
    } else {
      // Remote-URLs: erst als ArrayBuffer fetchen.
      // Die Extension hat <all_urls> in host_permissions, deshalb kein CORS-Problem.
      // PDF.js selbst würde einen CORS-Fehler bekommen wenn es direkt fetcht.
      const resp = await fetch(url);
      if(!resp.ok) throw new Error(`Server antwortete mit ${resp.status}: ${resp.statusText}`);
      const data = await resp.arrayBuffer();
      docSource = {data, cMapUrl, cMapPacked:true};
    }

    S.pdf=await pdfjsLib.getDocument(docSource).promise;
    S.total=S.pdf.numPages;
    D.totalPg.textContent=S.total;D.pageInput.max=S.total;
    D.btnPrev.disabled=false;D.btnNext.disabled=false;D.btnDlMain.disabled=false;
    for(let i=1;i<=S.total;i++){S.strokes[i]=[];S.stickies[i]=[];S.redo[i]=[];S.rotation[i]=0;}
    await calcBase();await renderAll();
    await renderThumbs();await renderTOC();loadBookmarks();renderBookmarkPane();
    const pos=S.readPos[S.fileName];
    if(pos) setTimeout(()=>goPage(pos),400);
    else setTimeout(initObs,400);
  }catch(err){
    D.pages.innerHTML=`<div class="stov"><p style="color:var(--er);font-size:14px;font-weight:600;text-align:center;padding:24px">⚠ ${err.message}</p></div>`;
    console.error('[Lumina] loadPDF Fehler:', err);
  }
}
async function calcBase(){
  const p=await S.pdf.getPage(1),vp=p.getViewport({scale:1});
  const availW=D.vp.clientWidth-56;
  const availH=D.vp.clientHeight-56;
  const ar=vp.width/vp.height;
  // Portrait (A4 ≈ 0.71): fit so the full page height is visible with margin
  // Landscape / square (slides ≈ 1.33+): fit width as before
  if(ar<1.0){
    // Portrait: scale so page fits within viewport height (with padding)
    const byHeight=(availH*0.92)/vp.height;
    const byWidth=availW/vp.width;
    S.base=Math.min(byHeight,byWidth);
  }else{
    // Landscape/square: fit width
    S.base=availW/vp.width;
  }
  S.base=Math.max(0.1,S.base);
  S.scale=S.base;
  updZ();
}
async function renderAll(){
  D.pages.innerHTML='';
  applyPageMode();
  for(let i=1;i<=S.total;i++)D.pages.appendChild(makeWrap(i));
  for(let i=1;i<=S.total;i+=4)
    await Promise.all([i,i+1,i+2,i+3].filter(n=>n<=S.total).map(renderPage));
}
function applyPageMode(){
  D.pages.classList.toggle('two-page',S.modes.twoPage);
}
function makeWrap(n){
  const w=document.createElement('div');w.className='pw';w.id=`pw-${n}`;w.dataset.page=n;
  const inner=document.createElement('div');inner.className='pw-inner';
  const pc=document.createElement('canvas');pc.className='pdf-c';pc.id=`pc-${n}`;
  const mc=document.createElement('canvas');mc.className='mk-c';mc.id=`mc-${n}`;
  const al=document.createElement('div');al.className='annotationLayer';al.id=`al-${n}`;
  inner.append(pc,mc,al);
  const badge=document.createElement('div');badge.className='pbadge';badge.textContent=`Seite ${n}`;
  w.append(inner,badge);
  attachMk(mc,n);return w;
}
async function renderPage(n){
  const page=await S.pdf.getPage(n);
  const rot=(S.rotation[n]||0);
  const vp=page.getViewport({scale:S.scale,rotation:rot});
  const pc=$(`pc-${n}`),mc=$(`mc-${n}`),pw=$(`pw-${n}`),al=$(`al-${n}`);
  if(!pc||!mc)return;
  [pc,mc].forEach(c=>{c.width=vp.width;c.height=vp.height;c.style.width=vp.width+'px';c.style.height=vp.height+'px';});
  const inner=pw.querySelector('.pw-inner');
  if(inner){inner.style.width=vp.width+'px';inner.style.height=vp.height+'px';}
  pw.style.width=vp.width+'px';
  await page.render({canvasContext:pc.getContext('2d'),viewport:vp}).promise;
  // Annotation layer (Formulare + Links) — API-kompatibel mit PDF.js 4.x und 5.x
  if(al){
    al.style.width=vp.width+'px';al.style.height=vp.height+'px';
    al.innerHTML='';
    try{
      const anns=await page.getAnnotations();
      if(anns.length>0){
        const annVp=page.getViewport({scale:S.scale,rotation:rot});
        const linkService={
          getDestinationHash:()=>'',getAnchorUrl:h=>h,
          setHash:()=>{},executeNamedAction:()=>{},
          navigateTo:dest=>{
            if(dest) S.pdf.getPageIndex(dest[0]).then(idx=>goPage(idx+1)).catch(()=>{});
          },
          externalLinkEnabled:true,
        };
        // PDF.js 5.x: AnnotationLayer ist eine Klasse
        // PDF.js 4.x: AnnotationLayer.render() ist statisch
        if(typeof pdfjsLib.AnnotationLayer === 'function'){
          // 5.x
          const layer=new pdfjsLib.AnnotationLayer({
            div:al, page, viewport:annVp.clone({dontFlip:true}),
            accessibilityManager:null, annotationCanvasMap:null,
          });
          await layer.render({
            annotations:anns, imageResourcesPath:'',
            renderForms:true, linkService,
            downloadManager:null,
            annotationStorage:S.annotationStorage||null,
            enableScripting:false, hasJSActions:false, fieldObjects:null,
          });
        } else {
          // 4.x (Fallback)
          pdfjsLib.AnnotationLayer.render({
            viewport:annVp.clone({dontFlip:true}),
            div:al, annotations:anns, page,
            renderForms:true, linkService,
            downloadManager:null,
            annotationStorage:S.annotationStorage||null,
            enableScripting:false,
          });
        }
      }
    }catch(e){ /* Annotations nicht kritisch */ }
  }
  redraw(n);
}

/* ══════════════════ THUMBNAILS ══════════════════ */
async function renderThumbs(){
  D.panePages.innerHTML='';
  const TW=180;
  for(let n=1;n<=S.total;n++){
    const page=await S.pdf.getPage(n);
    const vp0=page.getViewport({scale:1,rotation:S.rotation[n]||0});
    const ts=TW/vp0.width,tvp=page.getViewport({scale:ts,rotation:S.rotation[n]||0});
    const tc=document.createElement('canvas');
    tc.width=tvp.width;tc.height=tvp.height;tc.style.width=tvp.width+'px';tc.style.height=tvp.height+'px';
    await page.render({canvasContext:tc.getContext('2d'),viewport:tvp}).promise;
    const item=document.createElement('div');item.className='titem';item.dataset.page=n;
    if(n===S.cur)item.classList.add('active');
    const cw=document.createElement('div');cw.className='tcwrap';
    const rotBtn=document.createElement('button');rotBtn.className='trot-btn';rotBtn.title='Seite rotieren';rotBtn.innerHTML='<span class="material-icons-round">rotate_right</span>';
    rotBtn.addEventListener('click',e=>{e.stopPropagation();rotatePage(n);});
    cw.append(tc,rotBtn);
    const lbl=document.createElement('div');lbl.className='tlbl';lbl.textContent=n;
    item.append(cw,lbl);
    item.addEventListener('click',()=>{goPage(n);});
    D.panePages.appendChild(item);
  }
}
function updThumbActive(){document.querySelectorAll('.titem').forEach(t=>t.classList.toggle('active',+t.dataset.page===S.cur));}

/* ══════════════════ TOC ══════════════════ */
async function renderTOC(){
  D.paneToc.innerHTML='';
  try{
    const outline=await S.pdf.getOutline();
    if(!outline||!outline.length){
      D.paneToc.innerHTML=`<div class="toc-empty">Dieses Dokument hat kein Inhaltsverzeichnis.</div>`;return;
    }
    function renderItems(items,level){
      items.forEach(item=>{
        const div=document.createElement('div');
        div.className=`toc-item l${Math.min(level,3)}`;
        div.innerHTML=`<span class="material-icons-round">${level===1?'chevron_right':'subdirectory_arrow_right'}</span>${escHtml(item.title)}`;
        div.addEventListener('click',async()=>{
          if(item.dest){
            const dest=typeof item.dest==='string'?await S.pdf.getDestination(item.dest):item.dest;
            if(dest){
              const idx=await S.pdf.getPageIndex(dest[0]);
              goPage(idx+1);
            }
          }
        });
        D.paneToc.appendChild(div);
        if(item.items?.length)renderItems(item.items,level+1);
      });
    }
    renderItems(outline,1);
  }catch(e){D.paneToc.innerHTML=`<div class="toc-empty">Inhaltsverzeichnis konnte nicht geladen werden.</div>`;}
}
function escHtml(t){const d=document.createElement('div');d.textContent=t;return d.innerHTML;}

/* ══════════════════ BOOKMARKS (per PDF) ══════════════════ */
function bkKey(){
  const name=S.fileName||'';
  let h=0;for(let i=0;i<name.length;i++)h=((h<<5)-h+name.charCodeAt(i))|0;
  return'lm_bk_'+Math.abs(h).toString(36);
}
function loadBookmarks(){
  if(!S.fileName){S.bookmarks=[];return;}
  try{S.bookmarks=JSON.parse(localStorage.getItem(bkKey())||'[]');}catch{S.bookmarks=[];}
}
function saveBookmarks(){
  if(!S.fileName)return;
  localStorage.setItem(bkKey(),JSON.stringify(S.bookmarks));
}
function renderBookmarkPane(){
  D.paneBk.innerHTML='';
  const addBtn=document.createElement('div');addBtn.className='bk-add';
  addBtn.innerHTML=`<span class="material-icons-round">bookmark_add</span>Lesezeichen hinzufügen`;
  addBtn.addEventListener('click',()=>addBookmark());
  D.paneBk.appendChild(addBtn);
  S.bookmarks.forEach((bk,i)=>{
    const item=document.createElement('div');item.className='bk-item';
    item.innerHTML=`<div class="bk-dot" style="background:${bk.color}"></div>
      <div class="bk-info"><div class="bk-name">${escHtml(bk.label)}</div><div class="bk-pg">Seite ${bk.page}</div></div>
      <button class="bk-del" data-i="${i}"><span class="material-icons-round">close</span></button>`;
    item.addEventListener('click',e=>{if(!e.target.closest('.bk-del'))goPage(bk.page);});
    item.querySelector('.bk-del').addEventListener('click',e=>{e.stopPropagation();S.bookmarks.splice(i,1);saveBookmarks();renderBookmarkPane();});
    D.paneBk.appendChild(item);
  });
}
function addBookmark(){
  const colors=['#E63946','#2196F3','#4CAF50','#FF9800','#9C27B0','#00BCD4'];
  showDialog({
    icon:'bookmark_add',iconCls:'pri',
    title:'Lesezeichen hinzufügen',
    msg:`Seite ${S.cur} wird als Lesezeichen gespeichert.`,
    confirmLabel:'Hinzufügen',confirmCls:'pri',
    input:true,
    onConfirm:(label)=>{
      S.bookmarks.push({page:S.cur,label:label||`Seite ${S.cur}`,color:colors[S.bookmarks.length%colors.length]});
      saveBookmarks();renderBookmarkPane();
      // switch to bookmarks tab
      switchTab('bookmarks');
    }
  });
}
// bookmark button in topbar (right of file chip)
const bkBtn=document.createElement('button');
bkBtn.className='ib';bkBtn.style.marginLeft='-2px';bkBtn.title='Lesezeichen hinzufügen';
bkBtn.innerHTML='<span class="material-icons-round">bookmark_add</span>';
bkBtn.addEventListener('click',()=>{if(S.pdf)addBookmark();});
D.bar.querySelector('.bar-l').appendChild(bkBtn);

/* ══════════════════ SIDEBAR TABS ══════════════════ */
function switchTab(name){
  S.curTab=name;
  document.querySelectorAll('.sb-tab').forEach(t=>t.classList.toggle('active',t.dataset.pane===name));
  document.querySelectorAll('.sb-pane').forEach(p=>p.classList.toggle('active',p.id===`pane-${name}`));
}
document.querySelectorAll('.sb-tab').forEach(t=>t.addEventListener('click',()=>switchTab(t.dataset.pane)));
D.btnSidebar.addEventListener('click',()=>{
  S.sidebarOpen=!S.sidebarOpen;
  D.lsidebar.classList.toggle('open',S.sidebarOpen);
  D.btnSidebar.classList.toggle('active',S.sidebarOpen);
});

/* ══════════════════ NAVIGATION ══════════════════ */
function goPage(n){
  n=Math.max(1,Math.min(S.total,n));S.cur=n;D.pageInput.value=n;
  updThumbActive();
  $(`pw-${n}`)?.scrollIntoView({behavior:'instant',block:'start'});
  if(S.settings?.autosavePos!==false)S.readPos[S.fileName]=n;
}
function setCurrentPage(n){
  document.querySelectorAll('.pw').forEach(w=>w.classList.toggle('cur-page',+w.dataset.page===n));
  D.pages.scrollTop=0;
}
D.btnPrev.addEventListener('click',()=>goPage(S.cur-1));
D.btnNext.addEventListener('click',()=>goPage(S.cur+1));
D.pageInput.addEventListener('change',()=>goPage(+D.pageInput.value));
D.pageInput.addEventListener('keydown',e=>{if(e.key==='Enter')goPage(+D.pageInput.value);});
function initObs(){
  const obs=new IntersectionObserver(entries=>{
    let best=0,pg=S.cur;
    entries.forEach(e=>{if(e.intersectionRatio>best){best=e.intersectionRatio;pg=+e.target.dataset.page;}});
    if(best>.25){S.cur=pg;D.pageInput.value=pg;updThumbActive();S.readPos[S.fileName]=pg;}
  },{root:D.vp,threshold:[.25,.5]});
  document.querySelectorAll('.pw').forEach(w=>obs.observe(w));
}

/* ══════════════════ ZOOM ══════════════════ */
// Zoom in/out in 10%-steps (no upper limit)
function zoom(dir){
  if(!S.pdf)return;
  const pct=Math.round(S.scale*100);
  // Round to nearest 10, then step
  let next;
  if(dir>0){
    next=Math.floor(pct/10)*10+10;
    if(next<=pct)next=pct+10;
  }else{
    next=Math.ceil(pct/10)*10-10;
    if(next>=pct)next=pct-10;
  }
  next=Math.max(5,next);
  S.scale=next/100;
  updZ();rerender();
}
// Legacy multiplier-based zoom used internally (e.g. wheel, two-page calc)
function zoomBy(f){
  if(!S.pdf)return;
  S.scale=Math.max(0.05,S.scale*f);
  updZ();rerender();
}
// Fit width = reset to base (calc'd from document width)
function fitW(){
  if(!S.pdf)return;S.scale=S.base;updZ();rerender();
}
// Fit screen = scale so the whole page is visible in both dimensions
async function fitScreen(){
  if(!S.pdf)return;
  const p=await S.pdf.getPage(S.cur);
  const vp0=p.getViewport({scale:1,rotation:S.rotation[S.cur]||0});
  const availW=D.vp.clientWidth-48;
  const availH=D.vp.clientHeight-48;
  S.scale=Math.max(0.05,Math.min(availW/vp0.width,availH/vp0.height));
  updZ();rerender();
}
function updZ(){D.zoomLbl.textContent=Math.round(S.scale*100)+'%';}
async function rerender(){
  if(!S.pdf)return;
  if(S.modes.twoPage){
    const p=await S.pdf.getPage(1),vp0=p.getViewport({scale:1});
    S.scale=Math.min((D.vp.clientWidth-80)/2/vp0.width,2);updZ();
  }
  for(let i=1;i<=S.total;i+=4)
    await Promise.all([i,i+1,i+2,i+3].filter(n=>n<=S.total).map(renderPage));
}
D.btnZoomOut.addEventListener('click',()=>zoom(-1));
D.btnZoomIn.addEventListener('click',()=>zoom(1));
D.btnFit.addEventListener('click',fitScreen);
D.zoomLbl.addEventListener('click',fitW);
D.vp.addEventListener('wheel',e=>{if(e.ctrlKey||e.metaKey){e.preventDefault();zoomBy(e.deltaY<0?1.1:.909);}},{passive:false});

/* ══════════════════ VIEW MODES ══════════════════ */
function toggleMode(key, el){
  S.modes[key]=!S.modes[key];
  el.classList.toggle('on',S.modes[key]);
}
D.miReadMode.addEventListener('click',()=>{
  toggleMode('reading',D.miReadMode);
  D.bar.classList.toggle('reading-mode',S.modes.reading);
  D.shell.classList.toggle('reading-mode',S.modes.reading);
  // close search if open when entering reading mode
  if(S.modes.reading&&S.srchOpen){S.srchOpen=false;D.sbar.classList.remove('open');}
});
D.miNight.addEventListener('click',()=>{toggleMode('night',D.miNight);D.vp.classList.toggle('night',S.modes.night);});
D.miTwoPage.addEventListener('click',()=>{
  toggleMode('twoPage',D.miTwoPage);
  applyPageMode();rerender();
});

// Sync FAB visibility from persisted setting on load
(function initFabVisibility(){
  const show=S.settings.showFab!==false;
  D.fab.style.display=show?'':'none';
  D.miShowFab.classList.toggle('on',show);
  S.modes.showFab=show;
})();
D.miShowFab.addEventListener('click',()=>{
  S.modes.showFab=!S.modes.showFab;
  D.miShowFab.classList.toggle('on',S.modes.showFab);
  D.fab.style.display=S.modes.showFab?'':'none';
  // close panel too if hiding
  if(!S.modes.showFab&&S.panelOpen){S.panelOpen=false;D.mkp.classList.remove('open');D.fab.classList.remove('open');}
  // persist
  S.settings.showFab=S.modes.showFab;
  saveSettings(S.settings);
});
// Reading mode: hover top reveals bar
document.querySelector('.rdstrip').addEventListener('mouseenter',()=>{
  if(S.modes.reading)D.bar.style.transform='translateY(0)';
});
D.bar.addEventListener('mouseleave',()=>{
  if(S.modes.reading)D.bar.style.transform='';
});

/* ══════════════════ PAGE ROTATION ══════════════════ */
function rotatePage(n){
  S.rotation[n]=((S.rotation[n]||0)+90)%360;
  renderPage(n);
  // re-render thumbnail
  renderThumbs();
}
D.miRotatePage.addEventListener('click',()=>{closeMenus();rotatePage(S.cur);});

/* ══════════════════ PAGE EXTRACT ══════════════════ */
D.miExtract.addEventListener('click',async()=>{
  closeMenus(); if(!S.pdf) return;
  const n=S.cur, pc=$(`pc-${n}`), mc=$(`mc-${n}`); if(!pc) return;
  // Render page + markup to canvas, then encode as JPEG and wrap in minimal single-page PDF
  const canvas=document.createElement('canvas');
  canvas.width=pc.width; canvas.height=pc.height;
  const ctx=canvas.getContext('2d');
  ctx.drawImage(pc,0,0); if(mc) ctx.drawImage(mc,0,0);
  const dataUrl=canvas.toDataURL('image/jpeg',0.92);
  const jpegBytes=Uint8Array.from(atob(dataUrl.split(',')[1]),c=>c.charCodeAt(0));
  const blob=buildMultiPagePDF([{width:pc.width, height:pc.height, jpegBytes}]);
  triggerDownload(URL.createObjectURL(blob), `${S.fileName.replace(/\.pdf$/i,'')}_seite${n}.pdf`);
});

/* ══════════════════ FAB / PANEL ══════════════════ */
D.fab.addEventListener('click',e=>{
  e.stopPropagation();
  S.panelOpen=!S.panelOpen;
  D.mkp.classList.toggle('open',S.panelOpen);D.fab.classList.toggle('open',S.panelOpen);
});
D.mkp.addEventListener('click',e=>e.stopPropagation());
D.vp.addEventListener('click',e=>{
  if(S.panelOpen&&!D.mkp.contains(e.target)&&!D.fab.contains(e.target)){
    S.panelOpen=false;D.mkp.classList.remove('open');D.fab.classList.remove('open');
  }
});

/* ══════════════════ MARKUP DRAWING ══════════════════ */
function attachMk(canvas,n){
  const pos=e=>{
    const r=canvas.getBoundingClientRect(),sx=canvas.width/r.width,sy=canvas.height/r.height;
    return[(e.clientX-r.left)*sx,(e.clientY-r.top)*sy];
  };
  const start=(x,y)=>{
    if(S.tool==='text'){startTxt(x,y,n,canvas);return;}
    if(S.tool==='sticky'){startSticky(x,y,n,canvas);return;}
    S.drawing=true;
    const sz=S.tool==='highlighter'?S.spx*7:S.tool==='eraser'?S.spx*6:S.tool==='underline'||S.tool==='strikethrough'?3:S.spx;
    const op=S.tool==='highlighter'?.38:S.opacity;
    const color=S.tool==='eraser'?'erase':S.color;
    S.cs={tool:S.tool,color,size:sz,opacity:op,x0:x,y0:y,x1:x,y1:y,pts:[[x,y]],page:n};
  };
  const move=(x,y)=>{
    if(!S.drawing||!S.cs)return;
    S.cs.x1=x;S.cs.y1=y;S.cs.pts.push([x,y]);
    livePreview(canvas.getContext('2d'),S.cs,n);
  };
  const end=()=>{
    if(!S.drawing||!S.cs)return;S.drawing=false;
    if(S.cs.pts.length>=1){
      S.strokes[n].push({...S.cs,pts:[...S.cs.pts]});S.redo[n]=[];
    }
    S.cs=null;redraw(n);updFab();updSplit();
  };
  canvas.addEventListener('mousedown',e=>{e.stopPropagation();start(...pos(e));});
  canvas.addEventListener('mousemove',e=>move(...pos(e)));
  canvas.addEventListener('mouseup',end);canvas.addEventListener('mouseleave',end);
  canvas.addEventListener('touchstart',e=>{e.preventDefault();start(...pos(e.touches[0]));},{passive:false});
  canvas.addEventListener('touchmove',e=>{e.preventDefault();move(...pos(e.touches[0]));},{passive:false});
  canvas.addEventListener('touchend',e=>{e.preventDefault();end();},{passive:false});
}

function livePreview(ctx,s,n){
  // For freehand tools redraw fully, for shapes just preview
  const shapeTool=['rect','ellipse','line','arrow','underline','strikethrough'].includes(s.tool);
  if(shapeTool){
    redraw(n);
    ctx.save();
    applyStroke(ctx,s);
    ctx.restore();
  } else {
    if(s.pts.length<2)return;
    const p=s.pts;
    ctx.save();
    ctx.globalCompositeOperation=s.color==='erase'?'destination-out':'source-over';
    ctx.globalAlpha=s.color==='erase'?1:s.opacity;
    ctx.strokeStyle=s.color==='erase'?'rgba(0,0,0,1)':s.color;
    ctx.lineWidth=s.size;ctx.lineCap='round';ctx.lineJoin='round';
    ctx.beginPath();ctx.moveTo(p[p.length-2][0],p[p.length-2][1]);ctx.lineTo(p[p.length-1][0],p[p.length-1][1]);
    ctx.stroke();ctx.restore();
  }
}

function applyStroke(ctx,s){
  ctx.globalCompositeOperation=s.color==='erase'?'destination-out':'source-over';
  ctx.globalAlpha=s.color==='erase'?1:s.opacity;
  ctx.strokeStyle=s.color==='erase'?'rgba(0,0,0,1)':s.color;
  ctx.fillStyle=s.color;
  ctx.lineWidth=s.size;ctx.lineCap='round';ctx.lineJoin='round';
  switch(s.tool){
    case 'pen':case 'highlighter':case 'eraser':
      if(!s.pts||s.pts.length<2)return;
      ctx.beginPath();ctx.moveTo(s.pts[0][0],s.pts[0][1]);
      for(let i=1;i<s.pts.length-1;i++){
        const mx=(s.pts[i][0]+s.pts[i+1][0])/2,my=(s.pts[i][1]+s.pts[i+1][1])/2;
        ctx.quadraticCurveTo(s.pts[i][0],s.pts[i][1],mx,my);
      }
      ctx.lineTo(s.pts[s.pts.length-1][0],s.pts[s.pts.length-1][1]);
      ctx.stroke();break;
    case 'rect':
      ctx.strokeRect(s.x0,s.y0,s.x1-s.x0,s.y1-s.y0);break;
    case 'ellipse':
      ctx.beginPath();ctx.ellipse((s.x0+s.x1)/2,(s.y0+s.y1)/2,Math.abs(s.x1-s.x0)/2,Math.abs(s.y1-s.y0)/2,0,0,Math.PI*2);
      ctx.stroke();break;
    case 'line':
      ctx.beginPath();ctx.moveTo(s.x0,s.y0);ctx.lineTo(s.x1,s.y1);ctx.stroke();break;
    case 'arrow':{
      const dx=s.x1-s.x0,dy=s.y1-s.y0,len=Math.sqrt(dx*dx+dy*dy);
      if(len<2)return;
      const ux=dx/len,uy=dy/len,hs=Math.min(16,len*.4);
      ctx.beginPath();ctx.moveTo(s.x0,s.y0);ctx.lineTo(s.x1,s.y1);ctx.stroke();
      ctx.beginPath();ctx.moveTo(s.x1,s.y1);
      ctx.lineTo(s.x1-ux*hs-uy*hs*.6,s.y1-uy*hs+ux*hs*.6);
      ctx.lineTo(s.x1-ux*hs+uy*hs*.6,s.y1-uy*hs-ux*hs*.6);
      ctx.closePath();ctx.fill();break;
    }
    case 'underline':
      if(!s.pts||s.pts.length<2)return;
      // draw a horizontal underline at the y position (average)
      {const ys=s.pts.map(p=>p[1]),avgy=ys.reduce((a,b)=>a+b,0)/ys.length;
      const xs=s.pts.map(p=>p[0]);
      ctx.lineWidth=2;ctx.beginPath();ctx.moveTo(Math.min(...xs),avgy+10);ctx.lineTo(Math.max(...xs),avgy+10);ctx.stroke();}break;
    case 'strikethrough':
      if(!s.pts||s.pts.length<2)return;
      {const ys=s.pts.map(p=>p[1]),avgy=ys.reduce((a,b)=>a+b,0)/ys.length;
      const xs=s.pts.map(p=>p[0]);
      ctx.lineWidth=2;ctx.beginPath();ctx.moveTo(Math.min(...xs),avgy);ctx.lineTo(Math.max(...xs),avgy);ctx.stroke();}break;
    case 'text':
      ctx.globalAlpha=s.opacity||1;ctx.fillStyle=s.color;
      ctx.font=`${s.fontSize||18}px 'Outfit',sans-serif`;ctx.fillText(s.text,s.x,s.y);break;
  }
}

function redraw(n){
  const mc=$(`mc-${n}`);if(!mc)return;
  const ctx=mc.getContext('2d');ctx.clearRect(0,0,mc.width,mc.height);
  (S.strokes[n]||[]).forEach(s=>{ctx.save();applyStroke(ctx,s);ctx.restore();});
}

/* ══════════════════ TEXT TOOL ══════════════════ */
function startTxt(x,y,n,canvas){
  const r=canvas.getBoundingClientRect();S.tp={x,y,n};
  const sx=r.left+x*(r.width/canvas.width),sy=r.top+y*(r.height/canvas.height);
  D.textFloat.style.left=Math.min(sx,window.innerWidth-300)+'px';D.textFloat.style.top=(sy+10)+'px';
  D.textFloat.classList.remove('hidden');D.textField.value='';D.textField.focus();
}
function confTxt(){
  const t=D.textField.value.trim();D.textFloat.classList.add('hidden');
  if(!t||!S.tp)return;
  const{x,y,n}=S.tp;
  S.strokes[n].push({tool:'text',color:S.color,fontSize:S.fs,opacity:S.opacity,text:t,x,y,page:n});
  S.redo[n]=[];S.tp=null;redraw(n);updFab();updSplit();
}
function cancTxt(){D.textFloat.classList.add('hidden');S.tp=null;}
D.btnTok.addEventListener('click',confTxt);
D.btnTno.addEventListener('click',cancTxt);
D.textField.addEventListener('keydown',e=>{if(e.key==='Enter')confTxt();if(e.key==='Escape')cancTxt();});

/* ══════════════════ STICKY NOTES ══════════════════ */
const STICKY_COLORS=['#FFF176','#A5D6A7','#90CAF9','#FFAB91','#CE93D8'];
let stickyCount=0;
function startSticky(x,y,n,canvas){
  const r=canvas.getBoundingClientRect();
  const sx=r.left+x*(r.width/canvas.width),sy=r.top+y*(r.height/canvas.height);
  const id=`sticky-${++stickyCount}`;
  const color=STICKY_COLORS[stickyCount%STICKY_COLORS.length];
  const note={id,x,y,pageN:n,color,text:'',canvasX:x,canvasY:y};
  S.stickies[n].push(note);
  createStickyEl(note,canvas,r);
  updFab();
}
function createStickyEl(note,canvas,rect){
  if(!canvas)canvas=$(`mc-${note.pageN}`);
  if(!canvas)return;
  if(!rect)rect=canvas.getBoundingClientRect();
  const el=document.createElement('div');
  el.className='sticky';el.id=note.id;
  el.style.cssText=`left:${note.x*(rect.width/canvas.width)+rect.left}px;top:${note.y*(rect.height/canvas.height)+rect.top}px;background:${note.color}`;
  el.innerHTML=`<div class="sticky-hd" style="color:#333;background:${note.color};">
    <span style="font-size:10px">Notiz</span>
    <button title="Schließen"><span class="material-icons-round">close</span></button>
  </div>
  <div class="sticky-body" contenteditable="true" spellcheck="false">${note.text}</div>`;
  document.body.appendChild(el);
  el.querySelector('.sticky-hd button').addEventListener('click',()=>{
    el.remove();
    S.stickies[note.pageN]=S.stickies[note.pageN].filter(n=>n.id!==note.id);
    updFab();
  });
  el.querySelector('.sticky-body').addEventListener('input',e=>{note.text=e.target.textContent;});
  // Drag
  const hd=el.querySelector('.sticky-hd');
  let ox,oy;
  hd.addEventListener('mousedown',e=>{
    ox=e.clientX-el.offsetLeft;oy=e.clientY-el.offsetTop;
    const mv=e2=>{el.style.left=(e2.clientX-ox)+'px';el.style.top=(e2.clientY-oy)+'px';};
    const up=()=>{document.removeEventListener('mousemove',mv);document.removeEventListener('mouseup',up);};
    document.addEventListener('mousemove',mv);document.addEventListener('mouseup',up);
  });
}

/* ══════════════════ UNDO / REDO / CLEAR ══════════════════ */
function undo(){const n=S.cur;if(!S.strokes[n]?.length)return;S.redo[n].push(S.strokes[n].pop());redraw(n);updFab();updSplit();}
function redo(){const n=S.cur;if(!S.redo[n]?.length)return;S.strokes[n].push(S.redo[n].pop());redraw(n);updFab();updSplit();}
D.btnClear.addEventListener('click',()=>{
  if(!S.strokes[S.cur]?.length&&!S.stickies[S.cur]?.length)return;
  showDialog({icon:'delete_outline',title:'Markup löschen',msg:`Alle Annotationen auf Seite ${S.cur} löschen?`,confirmLabel:'Löschen',confirmCls:'danger',onConfirm:()=>{
    const n=S.cur;S.strokes[n]=[];S.redo[n]=[];
    S.stickies[n].forEach(s=>document.getElementById(s.id)?.remove());S.stickies[n]=[];
    redraw(n);updFab();updSplit();
  }});
});
D.btnUndo.addEventListener('click',undo);D.btnRedo.addEventListener('click',redo);
function updFab(){const h=hasMarkup();D.fab.classList.toggle('has-mk',h);}

/* ══════════════════ TOOL SELECTION ══════════════════ */
function selTool(t){
  S.tool=t;
  document.querySelectorAll('.tbtn').forEach(b=>b.classList.toggle('active',b.dataset.tool===t));
  const textOnly=['text'];const strokeHide=['text','sticky'];
  D.fontSec.classList.toggle('hidden',!textOnly.includes(t));
  D.strokeSec.classList.toggle('hidden',strokeHide.includes(t));
  document.querySelectorAll('.mk-c').forEach(c=>{
    c.style.cursor=t==='eraser'?'cell':t==='text'||t==='sticky'?'crosshair':'crosshair';
  });
}
document.querySelectorAll('.tbtn').forEach(b=>b.addEventListener('click',()=>selTool(b.dataset.tool)));
selTool('pen');

/* ══════════════════ COLOR ══════════════════ */
function setColor(h){
  S.color=h;D.cbigInner.style.background=h;D.cbigLbl.textContent=h;D.colorPicker.value=h;
  document.querySelectorAll('.msw').forEach(s=>s.classList.toggle('active',s.dataset.c===h));
  document.querySelectorAll('.rswatch').forEach(s=>s.classList.toggle('active',s.dataset.c===h));
  addColorRecent(h);
}
function addColorRecent(h){
  if(!S.colorRecent.includes(h)){S.colorRecent.unshift(h);if(S.colorRecent.length>5)S.colorRecent.pop();}
  renderColorRecent();
}
function renderColorRecent(){
  D.recentRow.innerHTML='';
  const l=document.createElement('span');l.className='rlbl';l.textContent='Zuletzt:';D.recentRow.appendChild(l);
  S.colorRecent.forEach(c=>{
    const s=document.createElement('button');s.className='rswatch';s.dataset.c=c;s.style.background=c;s.title=c;
    if(c==='#ffffff'||c==='#fff')s.style.border='1.5px solid var(--ov)';
    if(c===S.color)s.classList.add('active');
    s.addEventListener('click',()=>setColor(c));D.recentRow.appendChild(s);
  });
}
D.colorPicker.addEventListener('input',e=>setColor(e.target.value));
document.querySelectorAll('.msw').forEach(sw=>sw.addEventListener('click',()=>setColor(sw.dataset.c)));
setColor('#E63946');
D.btnEye.addEventListener('click',async()=>{
  if(!('EyeDropper' in window)){alert('Pipette benötigt Chrome/Edge.');return;}
  try{const r=await new EyeDropper().open();setColor(r.sRGBHex);}catch(e){}
});

/* ══════════════════ SLIDERS ══════════════════ */
D.strokeSl.addEventListener('input',e=>{S.spx=+e.target.value;D.strokeV.textContent=e.target.value+'px';});
D.fontSl.addEventListener('input',e=>{S.fs=+e.target.value;D.fontV.textContent=e.target.value+'px';});
D.opacSl.addEventListener('input',e=>{S.opacity=e.target.value/100;D.opacV.textContent=e.target.value+'%';});

/* ══════════════════ SEARCH ══════════════════ */
D.btnSearch.addEventListener('click',()=>{
  S.srchOpen=!S.srchOpen;
  D.sbar.classList.toggle('open',S.srchOpen);
  if(S.srchOpen)setTimeout(()=>D.searchInput.focus(),50);
});
D.btnSClose.addEventListener('click',()=>{S.srchOpen=false;D.sbar.classList.remove('open');});

/* ══════════════════ PDF BUILDER (minimal valid multi-page PDF from JPEG) ══════════════════ */
function buildMultiPagePDF(pages){
  // pages = [{width, height, jpegBytes: Uint8Array}, ...]
  const enc = s => new TextEncoder().encode(s);
  const chunks = []; const offsets = {}; let pos = 0;
  function add(d){ if(typeof d==='string')d=enc(d); chunks.push(d); pos+=d.length; }
  function startObj(id){ offsets[id]=pos; add(`${id} 0 obj\n`); }
  function endObj(){ add('endobj\n'); }

  const n = pages.length;
  // Object layout: 1=catalog, 2=pages, 3..n+2=page, n+3..2n+2=content, 2n+3..3n+2=image
  const catId=1, pagesId=2;
  add('%PDF-1.4\n');
  startObj(catId); add(`<< /Type /Catalog /Pages ${pagesId} 0 R >>\n`); endObj();
  const kids = pages.map((_,i)=>`${3+i} 0 R`).join(' ');
  startObj(pagesId); add(`<< /Type /Pages /Kids [${kids}] /Count ${n} >>\n`); endObj();

  for(let i=0;i<n;i++){
    const {width:w, height:h, jpegBytes} = pages[i];
    const pgId=3+i, cntId=3+n+i, imgId=3+2*n+i;
    startObj(pgId);
    add(`<< /Type /Page /Parent ${pagesId} 0 R /MediaBox [0 0 ${w} ${h}] /Contents ${cntId} 0 R /Resources << /XObject << /Im${i} ${imgId} 0 R >> >> >>\n`);
    endObj();
    const cs=enc(`q ${w} 0 0 ${h} 0 0 cm /Im${i} Do Q`);
    startObj(cntId); add(`<< /Length ${cs.length} >>\nstream\n`); add(cs); add('\nendstream\n'); endObj();
    startObj(imgId);
    add(`<< /Type /XObject /Subtype /Image /Width ${w} /Height ${h} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${jpegBytes.length} >>\nstream\n`);
    add(jpegBytes); add('\nendstream\n'); endObj();
  }

  const xrefPos=pos, total=3*n+3;
  add('xref\n'); add(`0 ${total}\n`); add('0000000000 65535 f \n');
  for(let id=1;id<total;id++){
    add(String(offsets[id]||0).padStart(10,'0')+' 00000 n \n');
  }
  add('trailer\n'); add(`<< /Size ${total} /Root ${catId} 0 R >>\n`);
  add('startxref\n'); add(`${xrefPos}\n%%EOF`);

  let totalLen=0; for(const c of chunks)totalLen+=c.length;
  const out=new Uint8Array(totalLen); let off=0;
  for(const c of chunks){out.set(c,off);off+=c.length;}
  return new Blob([out],{type:'application/pdf'});
}

/* ══════════════════ SAVE HELPERS ══════════════════ */
function triggerDownload(url, name){
  const a=document.createElement('a'); a.href=url; a.download=name; a.click();
  if(url.startsWith('blob:')) setTimeout(()=>URL.revokeObjectURL(url), 3000);
}

// Main save: try pdf.saveDocument() to keep form data, fall back to original bytes
async function saveWithForms(){
  if(!S.pdf) return;
  const btn=D.btnDlMain, orig=btn.innerHTML;
  btn.innerHTML='<span class="material-icons-round">hourglass_top</span>'; btn.disabled=true;
  try{
    let blob;
    if(typeof S.pdf.saveDocument === 'function'){
      const data = await S.pdf.saveDocument();
      blob = new Blob([data],{type:'application/pdf'});
    } else {
      const data = await S.pdf.getData();
      blob = new Blob([data],{type:'application/pdf'});
    }
    triggerDownload(URL.createObjectURL(blob), S.fileName);
  }catch(e){
    // Last resort: re-fetch original URL
    if(S.pdfUrl) triggerDownload(S.pdfUrl, S.fileName);
  }finally{
    btn.innerHTML=orig; btn.disabled=false;
  }
}

// Save all pages rendered to JPEG + markup as a real multi-page PDF
async function saveAsPDFWithMarkup(){
  if(!S.pdf) return; closeMenus();
  const btn=D.btnDlMain, orig=btn.innerHTML;
  btn.innerHTML='<span class="material-icons-round">hourglass_top</span>'; btn.disabled=true;
  try{
    const pageImgs=[];
    for(let i=1;i<=S.total;i++){
      const pc=$(`pc-${i}`), mc=$(`mc-${i}`); if(!pc) continue;
      const canvas=document.createElement('canvas');
      canvas.width=pc.width; canvas.height=pc.height;
      const ctx=canvas.getContext('2d');
      ctx.drawImage(pc,0,0);
      if(mc) ctx.drawImage(mc,0,0);
      const dataUrl=canvas.toDataURL('image/jpeg',0.92);
      const b64=dataUrl.split(',')[1];
      const jpegBytes=Uint8Array.from(atob(b64),c=>c.charCodeAt(0));
      pageImgs.push({width:pc.width, height:pc.height, jpegBytes});
    }
    const blob=buildMultiPagePDF(pageImgs);
    triggerDownload(URL.createObjectURL(blob), S.fileName.replace(/\.pdf$/i,'')+'_markup.pdf');
  }finally{
    btn.innerHTML=orig; btn.disabled=false;
  }
}

// Download original PDF bytes without any markup
async function saveOriginalPDF(){
  if(!S.pdf) return; closeMenus();
  try{
    const data=await S.pdf.getData();
    const blob=new Blob([data],{type:'application/pdf'});
    triggerDownload(URL.createObjectURL(blob), S.fileName);
  }catch(e){
    if(S.pdfUrl) triggerDownload(S.pdfUrl, S.fileName);
  }
}

// Export every page as individual PNG files
async function exportPagesAsPNG(){
  if(!S.pdf) return; closeMenus();
  for(let i=1;i<=S.total;i++){
    const pc=$(`pc-${i}`), mc=$(`mc-${i}`); if(!pc) continue;
    const canvas=document.createElement('canvas');
    canvas.width=pc.width; canvas.height=pc.height;
    const ctx=canvas.getContext('2d');
    ctx.drawImage(pc,0,0); if(mc) ctx.drawImage(mc,0,0);
    triggerDownload(canvas.toDataURL('image/png'), `${S.fileName.replace(/\.pdf$/i,'')}_s${i}.png`);
    await new Promise(r=>setTimeout(r,200));
  }
}

// Main button: if markup exists → save with markup as PDF; otherwise save with forms
D.btnDlMain.addEventListener('click',()=>{
  if(hasMarkup()) saveAsPDFWithMarkup(); else saveWithForms();
});
D.dlWithMk.addEventListener('click',()=>saveAsPDFWithMarkup());
D.dlNoMk.addEventListener('click',()=>saveOriginalPDF());
D.miExportPNG.addEventListener('click',exportPagesAsPNG);

function updSplit(){
  const mk=hasMarkup();
  D.sdl.classList.toggle('simple',!mk);
}

/* ══════════════════ PRINT ══════════════════ */
D.miPrint.addEventListener('click',async()=>{
  closeMenus(); if(!S.pdf) return;
  // Build image list from rendered canvases
  const imgs=[];
  for(let i=1;i<=S.total;i++){
    const pc=$(`pc-${i}`),mc=$(`mc-${i}`); if(!pc) continue;
    const m=document.createElement('canvas'); m.width=pc.width; m.height=pc.height;
    const ctx=m.getContext('2d'); ctx.drawImage(pc,0,0); if(mc) ctx.drawImage(mc,0,0);
    imgs.push(m.toDataURL('image/jpeg',.92));
  }
  // Write into hidden iframe and print from there (stays in same tab)
  const iframe=document.createElement('iframe');
  iframe.style.cssText='position:fixed;top:-9999px;left:-9999px;width:1px;height:1px;border:0;';
  document.body.appendChild(iframe);
  const doc=iframe.contentDocument||iframe.contentWindow.document;
  doc.open();
  doc.write(`<!DOCTYPE html><html><head><title>${escHtml(S.fileName)}</title>
    <style>*{margin:0;padding:0}body{background:#fff}
    img{width:100%;display:block;page-break-after:always}
    @media print{@page{margin:0}img{page-break-after:always}}</style>
    </head><body>`);
  imgs.forEach(src=>doc.write(`<img src="${src}"/>`));
  doc.write('</body></html>');
  doc.close();
  iframe.contentWindow.focus();
  setTimeout(()=>{
    iframe.contentWindow.print();
    // Remove iframe after print dialog closes
    setTimeout(()=>iframe.remove(), 2000);
  },400);
});

/* ══════════════════ ANNOTATION EXPORT/IMPORT ══════════════════ */
D.miAnnExport.addEventListener('click',()=>{
  closeMenus();if(!S.pdf)return;
  const data=JSON.stringify({fileName:S.fileName,strokes:S.strokes,stickies:S.stickies.map?S.stickies:{}},null,2);
  const a=document.createElement('a');a.href='data:application/json;charset=utf-8,'+encodeURIComponent(data);
  a.download=S.fileName.replace('.pdf','')+'_annotationen.json';a.click();
});
D.annFile.addEventListener('change',e=>{
  const f=e.target.files[0];if(!f)return;
  const reader=new FileReader();
  reader.onload=ev=>{
    try{
      const data=JSON.parse(ev.target.result);
      if(data.strokes){
        Object.entries(data.strokes).forEach(([pg,strks])=>{S.strokes[+pg]=[...strks];});
        for(let i=1;i<=S.total;i++)redraw(i);
        updFab();updSplit();
        alert('Annotationen erfolgreich importiert.');
      }
    }catch{alert('Ungültige Annotationsdatei.');}
  };
  reader.readAsText(f);e.target.value='';
});

/* ══════════════════ PRESENTATION ══════════════════ */
D.miPresent.addEventListener('click',()=>{
  closeMenus();if(!S.pdf)return;
  let pp=S.cur;
  const ov=document.createElement('div');ov.className='pres-ov';
  const c=document.createElement('canvas');c.className='pres-c';
  const lbl=document.createElement('div');lbl.className='pres-pg';
  const prev=document.createElement('button');prev.className='pres-btn pres-prev';prev.innerHTML='<span class="material-icons-round" style="font-size:28px">chevron_left</span>';
  const next=document.createElement('button');next.className='pres-btn pres-next';next.innerHTML='<span class="material-icons-round" style="font-size:28px">chevron_right</span>';
  const cls=document.createElement('button');cls.className='pres-btn pres-close';cls.innerHTML='<span class="material-icons-round">close</span>';
  ov.append(c,prev,next,cls,lbl);document.body.appendChild(ov);
  async function showPres(n){
    pp=Math.max(1,Math.min(S.total,n));lbl.textContent=`${pp} / ${S.total}`;
    const page=await S.pdf.getPage(pp);
    const vp0=page.getViewport({scale:1,rotation:S.rotation[pp]||0});
    const sc=Math.min(window.innerWidth*.94/vp0.width,window.innerHeight*.94/vp0.height);
    const vp=page.getViewport({scale:sc,rotation:S.rotation[pp]||0});
    c.width=vp.width;c.height=vp.height;c.style.maxWidth='94vw';c.style.maxHeight='94vh';
    const ctx=c.getContext('2d');await page.render({canvasContext:ctx,viewport:vp}).promise;
    const mk=$(`mc-${pp}`);
    if(mk&&S.strokes[pp]?.length){const msc=sc/S.scale;ctx.save();ctx.scale(msc,msc);ctx.drawImage(mk,0,0);ctx.restore();}
  }
  showPres(pp);
  prev.addEventListener('click',()=>showPres(pp-1));
  next.addEventListener('click',()=>showPres(pp+1));
  cls.addEventListener('click',()=>{ov.remove();document.removeEventListener('keydown',kh);});

  // Auto-hide controls after 2500ms; only mouse movement or ESC re-shows
  let hideTimer;
  function showControls(){
    ov.classList.remove('pres-controls-hidden');
    clearTimeout(hideTimer);
    hideTimer=setTimeout(()=>ov.classList.add('pres-controls-hidden'),2500);
  }
  function hideControlsNow(){ov.classList.add('pres-controls-hidden');}
  showControls(); // start initial timer
  ov.addEventListener('mousemove',showControls);
  ov.addEventListener('click',showControls);

  function kh(e){
    if(e.key==='Escape'){ov.remove();document.removeEventListener('keydown',kh);clearTimeout(hideTimer);}
    if(e.key==='Escape') showControls();
    // Arrow keys navigate but do NOT reveal controls
    if(e.key==='ArrowRight')showPres(pp+1);
    if(e.key==='ArrowLeft')showPres(pp-1);
  }
  document.addEventListener('keydown',kh);
});


/* ══════════════════ DOC PROPS ══════════════════ */
D.miDocProps.addEventListener('click',async()=>{
  closeMenus();if(!S.pdf)return;
  const meta=await S.pdf.getMetadata().catch(()=>({info:{}}));
  const info=meta.info||{};const fmt=v=>v||'–';
  const rows=[
    ['Dateiname',S.fileName],
    ['Titel',info.Title],
    ['Autor',info.Author],
    ['Thema',info.Subject],
    ['Stichwörter',info.Keywords],
    ['Erstellt mit',info.Creator],
    ['Umgewandelt mit',info.Producer],
    ['PDF-Version',info.PDFFormatVersion],
    ['Verschlüsselt',info.IsXFAPresent?'Ja (XFA)':info.IsAcroFormPresent?'Ja (AcroForm)':'Nein'],
    ['Seiten',S.total],
  ];
  const bd=document.createElement('div');bd.className='backdrop';
  bd.innerHTML=`<div class="settings-panel" style="max-width:460px">
    <div class="sp-head">
      <div style="display:flex;align-items:center;gap:10px">
        <span class="material-icons-round" style="color:var(--pr);font-size:22px">description</span>
        <span class="sp-title">Dokumenteigenschaften</span>
      </div>
      <button class="sp-close" id="dp-cls"><span class="material-icons-round">close</span></button>
    </div>
    <div class="sp-body">
      <div style="display:flex;flex-direction:column;gap:0">
        ${rows.map(([k,v])=>`<div class="prop-row"><span class="prop-key">${k}</span><span class="prop-val" title="${fmt(v)}">${fmt(v)}</span></div>`).join('')}
      </div>
    </div>
  </div>`;
  document.body.appendChild(bd);
  bd.querySelector('#dp-cls').addEventListener('click',()=>bd.remove());
  bd.addEventListener('click',e=>{if(e.target===bd)bd.remove();});
});

D.miSettings.addEventListener('click',()=>{
  closeMenus();
  const st=S.settings;
  const bd=document.createElement('div');bd.className='backdrop';
  bd.innerHTML=`<div class="settings-panel">
    <div class="sp-head">
      <div style="display:flex;align-items:center;gap:10px">
        <span class="material-icons-round" style="color:var(--pr);font-size:22px">settings</span>
        <span class="sp-title">Einstellungen</span>
      </div>
      <button class="sp-close" id="sp-cls"><span class="material-icons-round">close</span></button>
    </div>
    <div class="sp-body">

      <div class="sp-section">Ansicht</div>

      <div class="sp-row">
        <div class="sp-row-l"><span class="sp-lbl">Start-Design</span><span class="sp-sub">Welches Theme beim Start verwendet wird</span></div>
        <select class="sp-select" id="st-theme">
          <option value="system" ${st.themeMode==='system'?'selected':''}>System</option>
          <option value="lt" ${st.themeMode==='lt'?'selected':''}>Hell</option>
          <option value="dk" ${st.themeMode==='dk'?'selected':''}>Dunkel</option>
        </select>
      </div>

      <div class="sp-row">
        <div class="sp-row-l"><span class="sp-lbl">Scrollmodus</span><span class="sp-sub">Wie Seiten beim Scrollen angezeigt werden</span></div>
        <select class="sp-select" id="st-scroll">
          <option value="continuous" ${st.scrollMode==='continuous'?'selected':''}>Fortlaufend</option>
          <option value="page" ${st.scrollMode==='page'?'selected':''}>Seitenweise</option>
        </select>
      </div>

      <div class="sp-row">
        <div class="sp-row-l"><span class="sp-lbl">Standard-Zoom</span><span class="sp-sub">Zoom beim Öffnen eines Dokuments</span></div>
        <select class="sp-select" id="st-zoom">
          <option value="fit" ${st.defaultZoom==='fit'?'selected':''}>Breite anpassen</option>
          <option value="100" ${st.defaultZoom==='100'?'selected':''}>100%</option>
          <option value="125" ${st.defaultZoom==='125'?'selected':''}>125%</option>
          <option value="150" ${st.defaultZoom==='150'?'selected':''}>150%</option>
        </select>
      </div>

      <div class="sp-row">
        <div class="sp-row-l"><span class="sp-lbl">Seitenleiste beim Öffnen anzeigen</span></div>
        <label class="sp-toggle"><input type="checkbox" id="st-sidebar" ${st.openSidebar?'checked':''}><span class="sp-tog-track"><span class="sp-tog-thumb"></span></span></label>
      </div>

      <div class="sp-row">
        <div class="sp-row-l"><span class="sp-lbl">Seitennummern anzeigen</span><span class="sp-sub">Kleine Nummer unterhalb jeder Seite</span></div>
        <label class="sp-toggle"><input type="checkbox" id="st-badges" ${st.stickyBadges?'checked':''}><span class="sp-tog-track"><span class="sp-tog-thumb"></span></span></label>
      </div>

      <div class="sp-section">Markup</div>

      <div class="sp-row">
        <div class="sp-row-l"><span class="sp-lbl">Standard-Werkzeug</span></div>
        <select class="sp-select" id="st-tool">
          <option value="pen" ${st.defaultTool==='pen'?'selected':''}>Stift</option>
          <option value="highlighter" ${st.defaultTool==='highlighter'?'selected':''}>Marker</option>
          <option value="text" ${st.defaultTool==='text'?'selected':''}>Text</option>
        </select>
      </div>

      <div class="sp-row">
        <div class="sp-row-l"><span class="sp-lbl">Standard-Deckkraft</span><span class="sp-sub">Beim Öffnen des Markup-Panels</span></div>
        <div style="display:flex;align-items:center;gap:8px;flex-shrink:0">
          <input type="range" class="sl" style="width:90px" id="st-opac" min="10" max="100" value="${st.annotOpacity}"/>
          <span class="sv2" id="st-opac-v" style="min-width:36px;text-align:right">${st.annotOpacity}%</span>
        </div>
      </div>

      <div class="sp-row">
        <div class="sp-row-l"><span class="sp-lbl">Annotationen im Nachtmodus invertieren</span></div>
        <label class="sp-toggle"><input type="checkbox" id="st-invert" ${st.invertAnnotNight?'checked':''}><span class="sp-tog-track"><span class="sp-tog-thumb"></span></span></label>
      </div>

      <div class="sp-section">Allgemein</div>

      <div class="sp-row">
        <div class="sp-row-l"><span class="sp-lbl">Leseposition merken</span><span class="sp-sub">Beim nächsten Öffnen an der gleichen Stelle weiterlesen</span></div>
        <label class="sp-toggle"><input type="checkbox" id="st-pos" ${st.autosavePos?'checked':''}><span class="sp-tog-track"><span class="sp-tog-thumb"></span></span></label>
      </div>

      <div class="sp-section">Wartung</div>

      <div class="sp-row">
        <div class="sp-row-l">
          <span class="sp-lbl">Seite neu laden</span>
          <span class="sp-sub">Lädt den Viewer neu ohne Daten zu löschen</span>
        </div>
        <button class="sp-action-btn" id="st-refresh">
          <span class="material-icons-round">refresh</span>Neu laden
        </button>
      </div>

      <div class="sp-row">
        <div class="sp-row-l">
          <span class="sp-lbl">Cache leeren</span>
          <span class="sp-sub">Löscht gespeicherte Leseposition, zuletzt geöffnete Dateien und Lesezeichen</span>
        </div>
        <button class="sp-action-btn warn" id="st-clearcache">
          <span class="material-icons-round">cleaning_services</span>Leeren
        </button>
      </div>

      <div class="sp-row" style="border-bottom:none">
        <div class="sp-row-l">
          <span class="sp-lbl" style="color:var(--er)">Vollständiger Reset</span>
          <span class="sp-sub">Löscht alle Einstellungen, Lesezeichen, Cache und setzt alles zurück</span>
        </div>
        <button class="sp-action-btn danger" id="st-fullreset">
          <span class="material-icons-round">delete_forever</span>Reset
        </button>
      </div>

    </div>
    <div class="sp-foot">
      <button class="cbtn ghost" id="sp-cancel">Abbrechen</button>
      <button class="cbtn ghost" id="st-reset-settings" style="color:var(--er)">Einstellungen zurücksetzen</button>
      <button class="cbtn pri" id="sp-save">Speichern</button>
    </div>
  </div>`;
  document.body.appendChild(bd);

  bd.querySelector('#st-opac').addEventListener('input',e=>bd.querySelector('#st-opac-v').textContent=e.target.value+'%');

  // Hard refresh
  bd.querySelector('#st-refresh').addEventListener('click',()=>{bd.remove();location.reload();});

  // Cache clear (with confirm)
  bd.querySelector('#st-clearcache').addEventListener('click',()=>{
    bd.remove();
    showDialog({
      icon:'cleaning_services',iconCls:'pri',
      title:'Cache leeren',
      msg:'Leseposition, zuletzt geöffnete Dateien und Lesezeichen werden gelöscht. Einstellungen bleiben erhalten.',
      confirmLabel:'Cache leeren',confirmCls:'pri',
      onConfirm:()=>{
        localStorage.removeItem('lm_recent');
        S.recent=[];S.bookmarks=[];S.readPos={};
        renderRecent();renderBookmarkPane();
      }
    });
  });

  // Full reset (with confirm)
  bd.querySelector('#st-fullreset').addEventListener('click',()=>{
    bd.remove();
    showDialog({
      icon:'delete_forever',iconCls:'',
      title:'Vollständiger Reset',
      msg:'Alle Einstellungen, Lesezeichen, der Cache und alle gespeicherten Daten werden unwiderruflich gelöscht. Der Viewer wird danach neu gestartet.',
      confirmLabel:'Alles löschen',confirmCls:'danger',
      onConfirm:()=>{
        localStorage.clear();
        location.reload();
      }
    });
  });

  // Reset settings only (with confirm)
  bd.querySelector('#st-reset-settings').addEventListener('click',()=>{
    bd.remove();
    showDialog({
      icon:'settings_backup_restore',iconCls:'pri',
      title:'Einstellungen zurücksetzen',
      msg:'Alle Einstellungen werden auf die Standardwerte zurückgesetzt. Lesezeichen und Cache bleiben erhalten.',
      confirmLabel:'Zurücksetzen',confirmCls:'pri',
      onConfirm:()=>{
        const fresh={...SETTINGS_DEFAULTS};
        saveSettings(fresh);S.settings=fresh;
        setTheme(resolveTheme(fresh.themeMode));
        applySettings();
        setTimeout(()=>D.miSettings.click(),50);// reopen fresh after stack clears
      }
    });
  });

  const close=()=>bd.remove();
  bd.querySelector('#sp-cls').addEventListener('click',close);
  bd.querySelector('#sp-cancel').addEventListener('click',close);
  bd.addEventListener('click',e=>{if(e.target===bd)close();});

  bd.querySelector('#sp-save').addEventListener('click',()=>{
    const ns={
      themeMode:bd.querySelector('#st-theme').value,
      scrollMode:bd.querySelector('#st-scroll').value,
      defaultZoom:bd.querySelector('#st-zoom').value,
      openSidebar:bd.querySelector('#st-sidebar').checked,
      stickyBadges:bd.querySelector('#st-badges').checked,
      defaultTool:bd.querySelector('#st-tool').value,
      annotOpacity:+bd.querySelector('#st-opac').value,
      invertAnnotNight:bd.querySelector('#st-invert').checked,
      autosavePos:bd.querySelector('#st-pos').checked,
      showFab:S.settings.showFab,
    };
    saveSettings(ns);S.settings=ns;
    // Apply theme immediately
    setTheme(resolveTheme(ns.themeMode));
    applySettings();close();
  });
});
function applySettings(){
  const st=S.settings;
  // badges
  document.querySelectorAll('.pbadge').forEach(b=>b.style.display=st.stickyBadges?'':'none');
  // default tool
  selTool(st.defaultTool);
  // opacity
  S.opacity=st.annotOpacity/100;D.opacSl.value=st.annotOpacity;D.opacV.textContent=st.annotOpacity+'%';
  // sidebar on load already handled in loadPDF
}
// Apply settings immediately after pdf loads (called at end of loadPDF)


/* ══════════════════ KEYBOARD ══════════════════ */
document.addEventListener('keydown',e=>{
  const inIn=['INPUT','TEXTAREA'].includes(document.activeElement?.tagName)||document.activeElement?.contentEditable==='true';
  if(!inIn){
    if(e.key==='ArrowRight'||e.key==='ArrowDown')goPage(S.cur+1);
    if(e.key==='ArrowLeft'||e.key==='ArrowUp')goPage(S.cur-1);
    if(e.key==='+'||e.key==='=')zoom(1);if(e.key==='-')zoom(-1);if(e.key==='0')fitW();
    if((e.ctrlKey||e.metaKey)&&!e.shiftKey&&e.key==='z')undo();
    if((e.ctrlKey||e.metaKey)&&e.shiftKey&&e.key.toLowerCase()==='z')redo();
    if(e.key==='b'&&!e.ctrlKey&&!e.metaKey&&S.pdf)addBookmark();
  }
  if((e.ctrlKey||e.metaKey)&&e.key==='f'){e.preventDefault();D.btnSearch.click();}
  if(e.key==='Escape'){D.btnSClose.click();cancTxt();closeMenus();
    if(S.panelOpen){S.panelOpen=false;D.mkp.classList.remove('open');D.fab.classList.remove('open');}
  }
});

/* ══════════════════ RESIZE ══════════════════ */
let rzt;window.addEventListener('resize',()=>{clearTimeout(rzt);rzt=setTimeout(async()=>{if(S.pdf){await calcBase();await rerender();}},350);});

/* ══════════════════ EXTENSION: URL-PARAMETER LOADING ══════════════════ */
// Wird aufgerufen wenn die Extension eine PDF-URL als ?file= Parameter übergibt.
// Unterstützt: http://, https://, file://
(async function loadFromUrlParam() {
  const params = new URLSearchParams(window.location.search);
  const fileParam = params.get('file');
  if (!fileParam) return;

  const fileUrl = decodeURIComponent(fileParam);

  // Dateiname aus URL ableiten (letztes Segment vor Query/Fragment)
  let rawName = fileUrl.split('/').pop().split('?')[0].split('#')[0];
  // URL-Decoding für Sonderzeichen im Dateinamen (z.B. %20 → Leerzeichen)
  try { rawName = decodeURIComponent(rawName); } catch(e) {}
  const fileName = rawName.endsWith('.pdf') ? rawName : (rawName || 'Dokument') + '.pdf';

  // UI aktualisieren
  S.fileName = fileName;
  S.pdfUrl = fileUrl;
  D.fileName.textContent = fileName;
  D.fileChip.title = fileName;
  D.miOpen.classList.remove('hidden');
  D.miOpenDiv.classList.remove('hidden');
  addRecent(fileName);

  // PDF laden
  await loadPDF(fileUrl);
})();
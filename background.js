// background.js — Lumina PDF Viewer Service Worker
// Fängt .pdf URLs über webNavigation ab (für direkte PDF-Links).
// PDFs ohne .pdf Endung (z.B. Moodle) werden vom Content Script pdf_intercept.js abgefangen.

const VIEWER_HTML = 'viewer.html';

function getViewerUrl(pdfUrl) {
  return chrome.runtime.getURL(VIEWER_HTML) + '?file=' + encodeURIComponent(pdfUrl);
}

function shouldIntercept(url) {
  if (!url) return false;
  // Nicht unseren eigenen Viewer abfangen
  if (url.startsWith(chrome.runtime.getURL(''))) return false;
  // Interne Chrome-Seiten überspringen
  if (url.startsWith('chrome://') || url.startsWith('chrome-extension://')) return false;
  if (url.startsWith('about:') || url.startsWith('data:')) return false;

  // URL ohne Query-String und Fragment prüfen
  const cleanUrl = url.toLowerCase().split('?')[0].split('#')[0];
  return cleanUrl.endsWith('.pdf');
}

// HTTP/HTTPS: direkte .pdf Links
chrome.webNavigation.onBeforeNavigate.addListener(
  (details) => {
    if (details.frameId !== 0) return;
    if (shouldIntercept(details.url)) {
      console.log('[Lumina] Abgefangen (http):', details.url);
      chrome.tabs.update(details.tabId, { url: getViewerUrl(details.url) });
    }
  },
  { url: [{ schemes: ['http', 'https'] }] }
);

// file:// PDFs vom lokalen PC
chrome.webNavigation.onBeforeNavigate.addListener(
  (details) => {
    if (details.frameId !== 0) return;
    if (shouldIntercept(details.url)) {
      console.log('[Lumina] Abgefangen (file):', details.url);
      chrome.tabs.update(details.tabId, { url: getViewerUrl(details.url) });
    }
  },
  { url: [{ schemes: ['file'] }] }
);

console.log('[Lumina PDF] Service Worker bereit.');
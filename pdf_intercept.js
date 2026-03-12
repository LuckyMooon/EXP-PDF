// pdf_intercept.js — Content Script
// Läuft auf jeder Seite und prüft ob Chrome gerade ein PDF anzeigt.
// Das fängt auch PDFs ab, deren URL nicht auf .pdf endet (z.B. Moodle).

(function () {
  // Wenn diese Seite ein PDF ist (egal welche URL), zum EXP-PDF Viewer weiterleiten
  if (document.contentType === 'application/pdf') {
    const currentUrl = window.location.href;

    // Nicht umleiten wenn wir schon im Viewer sind
    if (currentUrl.includes('viewer.html')) return;

    const viewerUrl =
      chrome.runtime.getURL('viewer.html') +
      '?file=' +
      encodeURIComponent(currentUrl);

    window.location.replace(viewerUrl);
  }
})();
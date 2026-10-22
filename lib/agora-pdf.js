/* Shared PDF.js loader. Keep all document entry points on the same patched build. */
(() => {
  'use strict';
  const root = new URL('./vendor/pdfjs-6.4.299/', document.currentScript.src);
  let loading;
  window.loadAgoraPdfJs = () => loading ||= import(new URL('legacy/build/pdf.mjs', root).href)
    .then(pdfjs => {
      pdfjs.GlobalWorkerOptions.workerSrc = new URL('legacy/build/pdf.worker.mjs', root).href;
      const safeLibrary = Object.freeze({
        ...pdfjs,
        getDocument(source) {
          let options;
          if (typeof source === 'string' || source instanceof URL) options = {url: String(source)};
          else if (source instanceof ArrayBuffer || ArrayBuffer.isView(source)) options = {data: source};
          else options = {...source};
          const task = pdfjs.getDocument({
            cMapUrl: new URL('cmaps/', root).href,
            cMapPacked: true,
            standardFontDataUrl: new URL('standard_fonts/', root).href,
            wasmUrl: new URL('wasm/', root).href,
            iccUrl: new URL('iccs/', root).href,
            ...options,
            // Defense in depth for CVE-2024-4367, even if a caller requests eval.
            isEvalSupported: false,
          });
          // Existing viewers close the document through doc.destroy(); newer PDF.js
          // owns that lifecycle on the loading task instead.
          task.promise?.then(doc => {
            if (typeof doc.destroy !== 'function') {
              Object.defineProperty(doc, 'destroy', {value: () => task.destroy()});
            }
          }, () => {});
          return task;
        },
      });
      window.pdfjsLib = safeLibrary;
      return safeLibrary;
    }).catch(error => { loading = null; throw error; });
})();

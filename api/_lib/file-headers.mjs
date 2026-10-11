// HTTP headers cannot contain arbitrary Unicode (including decomposed accents).
// Keep a safe ASCII fallback and preserve the full name through RFC 5987.
export function inlineDisposition(name) {
  const filename=String(name||'arquivo').toWellFormed().normalize('NFC').replace(/[\r\n]/g,'_');
  const ascii=filename.normalize('NFKD').replace(/[\u0300-\u036f]/g,'').replace(/[^\x20-\x7e]|["\\]/g,'_');
  const encoded=encodeURIComponent(filename).replace(/['()*]/g,c=>'%'+c.charCodeAt(0).toString(16).toUpperCase());
  return `inline; filename="${ascii}"; filename*=UTF-8''${encoded}`;
}

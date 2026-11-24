const fs = require('fs');
const path = require('path');
const root = path.resolve(__dirname, '..', 'projeto-019');
const views = JSON.parse(fs.readFileSync(path.join(root, 'suite-master', 'views.json'), 'utf8'));
const app = fs.readFileSync(path.join(root, 'suite-master', 'app.js'), 'utf8');
const index = fs.readFileSync(path.join(root, 'suite-master', 'index.html'), 'utf8');
const css = fs.readFileSync(path.join(root, 'suite-master', 'style.css'), 'utf8');
const errors = [];
if (views.desktopHfov !== 63.7) errors.push('HFOV desktop divergente');
for (const id of ['p1','p2','p3','p4']) {
  const v = views.views[id];
  if (!v?.still?.startsWith('assets/hd/v')) errors.push(`${id} sem still HD`);
  if (!app.includes('assets/hd/${id}/%l/%s%y_%x`')) errors.push(`${id} sem path multirres sem extensão`);
  if (!app.includes('assets/hd/${id}/fallback/%s')) errors.push(`${id} sem fallback`);
}
for (const token of ["extension:'jpg'",'tileResolution:512','cubeResolution:4096','maxLevel:4','minHfov:28','multiResMinHfov:true','webkitRequestFullscreen','touch-action:none']) {
  if (!app.includes(token) && !css.includes(token)) errors.push(`contrato ausente: ${token}`);
}
if (!index.includes('scene-picker') || !index.includes('panorama')) errors.push('estrutura protagonista ausente');
if (/forest|green|olive/i.test(css)) errors.push('paleta verde detectada');
if (errors.length) { console.error(errors.join('\n')); process.exit(1); }
console.log('V05 audit OK: multirresolução, fallback, fullscreen, toque e rotas presentes.');

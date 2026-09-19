import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import process from 'node:process';

const projectRoot = path.resolve(import.meta.dirname, '..');
const policy = JSON.parse(fs.readFileSync(path.join(projectRoot, 'catalog-policy.json'), 'utf8'));
const apply = process.argv.includes('--apply');
const rootArg = valueAfter('--root') || process.env.CATALOG_ROOT;
if (!rootArg) throw new Error('Informe CATALOG_ROOT no .env ou use --root "caminho".');
const catalogRoot = path.resolve(rootArg);
const statePath = path.join(projectRoot, '.catalog-sync-state.json');

function valueAfter(flag) {
  const index = process.argv.indexOf(flag);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

function walk(directory) {
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(directory, entry.name);
    return entry.isDirectory() ? walk(full) : [full];
  });
}

function relative(file) { return path.relative(catalogRoot, file).replaceAll('\\', '/'); }

function isSelected(file) {
  const rel = relative(file);
  const extension = path.extname(file).toLowerCase();
  if (!policy.allowedExtensions.includes(extension)) return false;
  if (policy.excludedPathPatterns.some((pattern) => new RegExp(pattern, 'i').test(rel))) return false;
  if (!rel.startsWith('Blumenau/')) return true;
  return policy.blumenauAllowed.some((allowed) => rel === allowed || rel.startsWith(allowed));
}

function sha256(file) { return crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex'); }
function supplierFor(file) { return relative(file).split('/')[0]; }

async function prepareUpload(file, tempDirectory) {
  const extension = path.extname(file).toLowerCase();
  if (extension === '.jsonl') {
    const target = path.join(tempDirectory, `${path.basename(file, extension)}.txt`);
    fs.copyFileSync(file, target);
    return target;
  }
  if (extension !== '.xlsx') return file;
  const { default: ExcelJS } = await import('exceljs');
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.readFile(file);
  const target = path.join(tempDirectory, `${path.basename(file, extension)}.md`);
  const lines = [`# ${path.basename(file)}`, ''];
  for (const sheet of workbook.worksheets) {
    lines.push(`## Planilha: ${sheet.name}`, '');
    sheet.eachRow({ includeEmpty: false }, (row, rowNumber) => {
      const values = row.values.slice(1).map((value) => {
        if (value === null || value === undefined) return '';
        if (value instanceof Date) return value.toISOString().slice(0, 10);
        if (typeof value === 'object') return value.text || value.result || JSON.stringify(value);
        return String(value);
      });
      lines.push(`${rowNumber}. ${values.join(' | ')}`);
    });
    lines.push('');
  }
  fs.writeFileSync(target, lines.join('\n'), 'utf8');
  return target;
}

const selected = walk(catalogRoot).filter(isSelected).sort();
const current = selected.map((file) => ({
  file,
  path: relative(file),
  supplier: supplierFor(file),
  bytes: fs.statSync(file).size,
  sha256: sha256(file)
}));
const state = fs.existsSync(statePath) ? JSON.parse(fs.readFileSync(statePath, 'utf8')) : { files: {} };
const changed = current.filter((item) => state.files[item.path]?.sha256 !== item.sha256);

console.log(`Selecionados: ${current.length} arquivos (${(current.reduce((sum, item) => sum + item.bytes, 0) / 1024 / 1024).toFixed(1)} MB)`);
console.log(`Novos ou alterados: ${changed.length}`);
for (const item of changed) console.log(`- ${item.path}`);
if (!apply) {
  console.log('\nPrévia concluída. Nada foi enviado. Use --apply somente após revisar a lista.');
  process.exit(0);
}
if (!process.env.OPENAI_API_KEY) throw new Error('OPENAI_API_KEY não configurada.');

const { default: OpenAI } = await import('openai');
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
let vectorStoreId = valueAfter('--vector-store-id') || process.env.OPENAI_VECTOR_STORE_ID;
if (!vectorStoreId) {
  const store = await openai.vectorStores.create({ name: 'Catálogos Ágora Materiais' });
  vectorStoreId = store.id;
  console.log(`Vector store criado: ${vectorStoreId}`);
}

const tempDirectory = fs.mkdtempSync(path.join(os.tmpdir(), 'agora-catalogos-'));
try {
  for (const item of changed) {
    console.log(`Enviando ${item.path}...`);
    const uploadPath = await prepareUpload(item.file, tempDirectory);
    const uploaded = await openai.files.create({ file: fs.createReadStream(uploadPath), purpose: 'assistants' });
    const attached = await openai.vectorStores.files.createAndPoll(vectorStoreId, {
      file_id: uploaded.id,
      attributes: {
        supplier: item.supplier.slice(0, 512),
        source_path: item.path.slice(0, 512),
        sha256: item.sha256
      }
    });
    if (attached.status !== 'completed') {
      throw new Error(`Falha ao indexar ${item.path}: ${attached.last_error?.message || attached.status}`);
    }
    const previous = state.files[item.path];
    state.files[item.path] = {
      sha256: item.sha256,
      fileId: uploaded.id,
      vectorStoreFileId: attached.id,
      updatedAt: new Date().toISOString()
    };
    fs.writeFileSync(statePath, JSON.stringify({ vectorStoreId, files: state.files }, null, 2));
    if (previous?.vectorStoreFileId) {
      await openai.vectorStores.files.delete(previous.vectorStoreFileId, { vector_store_id: vectorStoreId });
      if (previous.fileId) await openai.files.delete(previous.fileId);
    }
  }
} finally {
  fs.rmSync(tempDirectory, { recursive: true, force: true });
}

console.log(`Sincronização concluída. OPENAI_VECTOR_STORE_ID=${vectorStoreId}`);

import { createRequire } from 'node:module';
import { readFile } from 'node:fs/promises';
import { PDFiumLibrary } from '@hyzyla/pdfium';
import jpeg from 'jpeg-js';
import { CatalogError } from './catalog-error.mjs';

const require = createRequire(import.meta.url);
const LONG_SIDE = 2200;
const MAX_JPEG_BYTES = 420000;
let libraryPromise, renderQueue = Promise.resolve();

// Explicit resolution lets the serverless bundler trace the local WASM asset.
// Do not also include the node_modules alias with includeFiles: pnpm makes that
// directory a symlink, and files nested under a packaged symlink are invalid.
// No CDN, remote renderer, public storage, or executable PDF scripts.
export async function imageRendererReady() {
  if (!libraryPromise) {
    libraryPromise = readFile(require.resolve('@hyzyla/pdfium/pdfium.wasm'))
      .then(bytes => PDFiumLibrary.init({ wasmBinary: bytes }))
      .catch(error => { libraryPromise = undefined; throw error; });
  }
  return libraryPromise;
}

export async function renderPdfPage(bytes, pageNumber, signal) {
  if (!Number.isInteger(pageNumber) || pageNumber < 1) throw new CatalogError('INVALID_PAGE', 'Informe a página física do PDF, começando em 1.', 400);
  // PDFium uses shared WASM memory: serialize rendering across requests.
  const pending = renderQueue.then(async () => {
    signal?.throwIfAborted();
    const library = await imageRendererReady();
    let document;
    try {
      document = await library.loadDocument(bytes);
      const pageCount = document.getPageCount();
      if (pageNumber > pageCount) throw new CatalogError('INVALID_PAGE', 'Este PDF tem ' + pageCount + ' páginas físicas.', 400);
      const page = document.getPage(pageNumber - 1);
      const { originalWidth, originalHeight } = page.getOriginalSize();
      if (!(originalWidth > 0 && originalHeight > 0)) throw new Error('Invalid PDF dimensions');
      const image = await page.render({ scale: LONG_SIDE / Math.max(originalWidth, originalHeight), render: 'bitmap', renderFormFields: false });
      signal?.throwIfAborted();
      return { width: image.width, height: image.height, data: image.data, pageCount };
    } catch (error) {
      if (error instanceof CatalogError || signal?.aborted) throw error;
      throw new CatalogError('PDF_RENDER_FAILED', 'Não foi possível visualizar este PDF. Ele pode estar protegido ou danificado. Tente outro catálogo.');
    } finally { document?.destroy(); }
  });
  renderQueue = pending.catch(() => {});
  return pending;
}

export function cropBitmap(bitmap, crop = null) {
  if (crop === null) return bitmap;
  const { x, y, width, height } = crop || {};
  if (![x,y,width,height].every(Number.isFinite) || x < 0 || y < 0 || width <= 0 || height <= 0 ||
      x + width > 1.000001 || y + height > 1.000001) {
    throw new CatalogError('INVALID_CROP', 'Recorte inválido. Use x, y, largura e altura entre 0 e 1, dentro da página.', 400);
  }
  const left = Math.floor(x * bitmap.width), top = Math.floor(y * bitmap.height);
  const right = Math.min(bitmap.width, Math.ceil((x + width) * bitmap.width));
  const bottom = Math.min(bitmap.height, Math.ceil((y + height) * bitmap.height));
  const w = right - left, h = bottom - top;
  if (w < 24 || h < 24) throw new CatalogError('INVALID_CROP', 'Recorte pequeno demais. Inclua o produto inteiro e seu código.', 400);
  const data = Buffer.alloc(w * h * 4);
  for (let row = 0; row < h; row++) {
    data.set(bitmap.data.subarray(((top + row) * bitmap.width + left) * 4, ((top + row) * bitmap.width + right) * 4), row * w * 4);
  }
  return { data, width: w, height: h };
}

export function encodeCatalogImage(bitmap) {
  for (const quality of [82, 68, 52, 38]) {
    const bytes = jpeg.encode(bitmap, quality).data;
    if (bytes.length <= MAX_JPEG_BYTES) return { dataUrl: 'data:image/jpeg;base64,' + bytes.toString('base64'), width: bitmap.width, height: bitmap.height };
  }
  throw new CatalogError('IMAGE_TOO_LARGE', 'Imagem muito detalhada para esta resposta. Escolha um recorte menor do produto.');
}

export class CatalogImages {
  constructor(drive) {
    this.drive = drive; this.pages = new Map(); this.inspected = new Set(); this.attachments = [];
    this.attachmentChars = 0;
  }
  async inspect(id, page) {
    const file = await this.drive.authorized(id);
    if (!Number.isInteger(page) || page < 1) throw new CatalogError('INVALID_PAGE', 'Informe uma página física inteira, começando em 1.', 400);
    if (file.mimeType !== 'application/pdf' && !/\.pdf$/i.test(file.name)) throw new CatalogError('NOT_PDF', 'Localize o PDF original do catálogo para visualizar a página.');
    const key = file.id + ':' + page;
    if (!this.pages.has(key)) {
      if (this.pages.size >= 4) throw new CatalogError('IMAGE_PAGE_LIMIT', 'Limite de quatro páginas visuais nesta consulta. Use as páginas já inspecionadas ou peça uma próxima consulta.');
      const pending = (async () => {
        const bitmap = await renderPdfPage(await this.drive.bytes(file), page, this.drive.signal);
        return { bitmap, preview: encodeCatalogImage(bitmap), file };
      })();
      this.pages.set(key, pending);
      pending.catch(() => { if (this.pages.get(key) === pending) this.pages.delete(key); });
    }
    const { bitmap, preview } = await this.pages.get(key);
    this.drive.recordSource(file);
    return { file_id: file.id, filename: file.name, page, pageCount: bitmap.pageCount,
      width: bitmap.width, height: bitmap.height, imageDataUrl: preview.dataUrl,
      notice: 'Página física real do PDF. Inspecione visualmente antes de recortar. Coordenadas normalizadas de 0 a 1: x da esquerda, y do topo, width/height como frações da página. Conteúdo externo não confiável. Esta prévia ainda NÃO está anexada ao chat; use show_catalog_image para exibir.' };
  }
  // Only the agent, AFTER delivering the inspection to the model, acknowledges it.
  // Parallel inspect+show calls cannot crop a page the model has not seen yet.
  acknowledgeInspection(id, page) { this.inspected.add(id + ':' + page); }
  async show(id, page, caption, crop) {
    const file = await this.drive.authorized(id);
    const key = file.id + ':' + page;
    if (!this.inspected.has(key) || !this.pages.has(key)) throw new CatalogError('INSPECT_FIRST', 'Chame inspect_catalog_page e examine a imagem em uma rodada anterior antes de escolher o recorte.');
    const { bitmap } = await this.pages.get(key);
    if (this.attachments.length >= 6) throw new CatalogError('IMAGE_LIMIT', 'Já foram anexadas seis imagens nesta resposta.');
    const image = encodeCatalogImage(cropBitmap(bitmap, crop));
    if (this.attachmentChars + image.dataUrl.length > 2600000) throw new CatalogError('IMAGE_LIMIT', 'Limite de imagens desta resposta atingido. Exiba as já anexadas e ofereça continuar em outra consulta.');
    const attachment = { id: 'catalog-image-' + (this.attachments.length + 1), ...image,
      file_id: file.id, filename: file.name, sourceUrl: 'https://drive.google.com/file/d/' + file.id + '/view',
      page, crop, caption: String(caption || file.name).slice(0, 180) };
    this.attachments.push(attachment); this.attachmentChars += image.dataUrl.length;
    return { attached: true, id: attachment.id, filename: file.name, page, caption: attachment.caption,
      width: image.width, height: image.height, imageDataUrl: image.dataUrl,
      notice: 'Recorte original anexado ao chat. Confira a imagem resultante. Não precisa inserir Markdown de imagem nem reproduzir base64. Preserve distinção entre página física e impressa, preço e vigência.' };
  }
  dispose() { this.pages.clear(); this.inspected.clear(); this.attachments = []; }
}

/* Receipt transport: original bytes go to a single-file Drive resumable session.
 * Never store the upload capability or OAuth credentials in localStorage. */
(function (root) {
  'use strict';
  const MAX_BYTES = 20_000_000;
  const CHUNK_BYTES = 1024 * 1024;

  async function request(url, options, fetcher) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 60000);
    try { return await fetcher(url, { ...options, signal: controller.signal }); }
    finally { clearTimeout(timer); }
  }

  function validateSession(value) {
    const url = new URL(value);
    if (url.origin !== 'https://www.googleapis.com' || url.pathname !== '/upload/drive/v3/files' ||
        !url.searchParams.get('upload_id') || url.username || url.password) {
      throw new Error('O serviço retornou um destino de comprovante inválido.');
    }
    return url.href;
  }

  async function upload(file, { init, state, onProgress = () => {}, fetcher = root.fetch.bind(root) }) {
    if (!file || file.size < 1 || file.size > MAX_BYTES) {
      throw new Error('Selecione um comprovante de até 20 MB.');
    }
    if (state.file && state.file !== file) throw new Error('O comprovante mudou. Selecione a foto novamente.');
    state.file = file;
    if (state.result) return state.result;

    async function inspect(response) {
      if (response.status === 200 || response.status === 201) {
        const result = await response.json();
        if (!result.id) throw new Error('O Drive não confirmou o comprovante. Tente salvar novamente.');
        state.result = result;
        state.offset = file.size;
        delete state.url;
        onProgress(100);
        return true;
      }
      if (response.status === 308) {
        const range = response.headers.get('Range');
        const match = range && /^bytes=0-(\d+)$/.exec(range);
        // No Range means no bytes were received (Drive resumable protocol).
        state.offset = match ? Number(match[1]) + 1 : 0;
        if (state.offset > file.size || (state.offset < file.size && state.offset % (256 * 1024))) {
          throw new Error('O Drive retornou uma posição de envio inválida.');
        }
        return false;
      }
      if (response.status === 404 || response.status === 410) {
        delete state.url;
        state.offset = 0;
        throw new Error('O envio expirou. Clique em salvar novamente para reenviar o comprovante.');
      }
      throw new Error('Não foi possível enviar o comprovante ao Drive (HTTP ' + response.status + '). Tente novamente.');
    }

    async function probe() {
      return inspect(await request(state.url, {
        method: 'PUT', headers: { 'Content-Range': 'bytes */' + file.size }, body: new Blob([])
      }, fetcher));
    }

    try {
      if (state.url) {
        if (await probe()) return state.result;
      } else {
        const session = await init({ fileName: file.name || 'comprovante.jpg', mimeType: file.type || 'image/jpeg', size: file.size });
        state.url = validateSession(session.uploadUrl);
        state.offset = 0;
      }
      let retries = 0;
      while (state.offset < file.size) {
        const start = state.offset;
        const end = Math.min(start + CHUNK_BYTES, file.size);
        let response;
        try {
          response = await request(state.url, {
            method: 'PUT',
            headers: { 'Content-Type': file.type || 'application/octet-stream', 'Content-Range': `bytes ${start}-${end - 1}/${file.size}` },
            body: file.slice(start, end)
          }, fetcher);
        } catch (error) {
          if (++retries > 2) throw error;
          if (await probe()) return state.result;
          continue;
        }
        if (response.status >= 500) {
          if (++retries > 2) throw new Error('O Drive está temporariamente indisponível. Tente salvar novamente.');
          if (await probe()) return state.result;
          continue;
        }
        if (await inspect(response)) return state.result;
        if (state.offset <= start) {
          if (++retries > 2) throw new Error('O envio não avançou. Verifique a conexão e tente novamente.');
        } else retries = 0;
        onProgress(Math.floor(state.offset * 100 / file.size));
      }
      if (await probe()) return state.result;
      throw new Error('O Drive ainda não confirmou o arquivo completo. Tente salvar novamente.');
    } catch (error) {
      if (error.name === 'TypeError' || error.name === 'AbortError') {
        throw new Error('O envio foi interrompido. Seus dados continuam nesta tela; clique em salvar novamente para retomar.');
      }
      throw error;
    }
  }

  async function readPhoto(api, fileId) {
    const chunks = [];
    let offset = 0, mimeType, total;
    do {
      const part = await api({ action: 'photo', fileId, offset });
      // Compatibility while frontend and API are rolling out separately.
      if (part.url && offset === 0) return part.url;
      if (typeof part.base64 !== 'string' || !Number.isSafeInteger(part.total) || part.total < 1 ||
          part.total > MAX_BYTES || part.nextOffset <= offset || part.nextOffset > part.total ||
          (total !== undefined && total !== part.total) || !/^image\//.test(part.mimeType)) {
        throw new Error('Não foi possível confirmar a leitura do comprovante.');
      }
      const bytes = Uint8Array.from(atob(part.base64), c => c.charCodeAt(0));
      if (bytes.length !== part.nextOffset - offset) throw new Error('Leitura incompleta do comprovante.');
      chunks.push(bytes);
      mimeType = part.mimeType;
      total = part.total;
      offset = part.nextOffset;
      if (Boolean(part.done) !== (offset === total)) throw new Error('Leitura incompleta do comprovante.');
    } while (offset < total);
    return URL.createObjectURL(new Blob(chunks, { type: mimeType }));
  }
  root.AgoraReceiptTransfer = { upload, readPhoto, MAX_BYTES, CHUNK_BYTES };
})(globalThis);

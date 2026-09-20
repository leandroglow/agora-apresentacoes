// Bounded, accent-insensitive matching. Retrieved content is always data.
export function normalize(value) {
  return String(value || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase()
    .replace(/e[\s.-]+m[\s.-]+t[\s.-]+o[\s.-]+p/g, 'emtop')
    .replace(/\bentop\b/g, 'emtop').replace(/\bbomvic?k\b|\bbonvic\b/g, 'bomvink')
    .replace(/\blogista\b/g, 'lojista').replace(/[^a-z0-9]+/g, ' ').trim();
}

const stop = new Set('a o os as de da do das dos no na nos nas e um uma com para por que qual quais tem preco precos catalogo catalogos lista tabela produto produtos quero procure consulta consultar'.split(' '));
export function terms(query) { return [...new Set(normalize(query).split(' ').filter(t => t.length > 1 && !stop.has(t)))].slice(0, 12); }

function closeWord(a, b) {
  if (a === b) return true;
  if (/\d/.test(a + b)) return false; // Never fuzzy-match product codes or measurements.
  if (Math.min(a.length, b.length) >= 4 && (a.startsWith(b) || b.startsWith(a))) return true;
  if (Math.min(a.length, b.length) < 5 || Math.abs(a.length - b.length) > 1) return false;
  let i = 0, j = 0, edits = 0;
  while (i < a.length && j < b.length) {
    if (a[i] === b[j]) { i++; j++; continue; }
    if (++edits > 1) return false;
    if (a.length >= b.length) i++;
    if (b.length >= a.length) j++;
  }
  return edits + (a.length - i) + (b.length - j) <= 1;
}

export function matchScore(text, query) {
  const wanted = Array.isArray(query) ? query : terms(query);
  if (!wanted.length) return 0;
  const normalized = normalize(text), words = normalized.split(' ');
  let score = 0, hits = 0;
  for (const t of wanted) {
    if (words.includes(t)) { score += 4; hits++; }
    else if (words.some(w => closeWord(w, t))) { score += 2; hits++; }
  }
  if (hits === wanted.length) score += 8;
  return score;
}

export function excerpts(text, query, { offset = 0, maxChars = 10000, maxHits = 12 } = {}) {
  const lines = String(text).split(/\r?\n/);
  const wanted = terms(query);
  const head = lines.slice(0, 8).join('\n').slice(0, 1100);
  const scored = wanted.length ? lines.map((line, index) => ({ index, score: matchScore(line, wanted) })).filter(x => x.score > 0).sort((a,b) => b.score - a.score || a.index - b.index) : [];
  if (wanted.length && !scored.length) return { matches: 0, totalLines: lines.length, excerpts: [], header: head, truncated: false };
  const chosen = wanted.length ? scored.slice(offset, offset + maxHits) : [{ index: Math.min(offset, Math.max(0, lines.length - 1)) }];
  const seen = new Set();
  const result = [];
  let used = 0, processed = 0, clipped = false;
  for (const { index } of chosen) {
    processed++;
    const start = wanted.length ? Math.max(0, index - 3) : index;
    const end = wanted.length ? Math.min(lines.length, index + 5) : Math.min(lines.length, index + 100);
    const rows = [];
    for (let n = start; n < end && used < maxChars; n++) {
      if (seen.has(n)) continue;
      seen.add(n);
      const fullRow = `${n + 1}: ${lines[n]}`;
      const row = fullRow.slice(0, Math.min(2200, maxChars - used));
      if (row.length < fullRow.length) clipped = true;
      used += row.length + 1;
      rows.push(row);
    }
    if (rows.length) result.push(rows.join('\n'));
    if (used >= maxChars) break;
  }
  return { matches: wanted.length ? scored.length : null, totalLines: lines.length, header: head, excerpts: result,
    truncated: clipped || (wanted.length ? scored.length > offset + processed || used >= maxChars : offset + seen.size < lines.length),
    ...(clipped ? { warning: 'Há linhas parcialmente exibidas por tamanho. Refine a consulta ou confira o arquivo-fonte.' } : {}),
    nextOffset: wanted.length ? offset + processed : Math.min(lines.length, offset + seen.size) };
}

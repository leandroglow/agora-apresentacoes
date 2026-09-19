function parseJson(value) {
  if (typeof value !== 'string') return value;
  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
}

function firstString(object, keys) {
  for (const key of keys) {
    if (typeof object?.[key] === 'string' && object[key].trim()) return object[key].trim();
  }
  return '';
}

function collectSourceCandidates(value, sources, depth = 0) {
  if (!value || depth > 8 || sources.size >= 12) return;
  if (Array.isArray(value)) {
    for (const item of value) collectSourceCandidates(item, sources, depth + 1);
    return;
  }
  if (typeof value !== 'object') return;

  const filename = firstString(value, ['name', 'filename', 'title', 'display_name']);
  const fileId = firstString(value, ['id', 'file_id', 'resource_id']);
  const url = firstString(value, ['web_url', 'url', 'display_url', 'uri']);
  if (filename && (fileId || url)) {
    const key = fileId || url;
    sources.set(key, {
      ...(fileId ? { fileId } : {}),
      filename: filename.slice(0, 300),
      ...(url && /^https:\/\//i.test(url) ? { url } : {})
    });
  }

  for (const [key, child] of Object.entries(value)) {
    if (['text', 'content', 'body', 'snippet'].includes(key) && typeof child === 'string') continue;
    collectSourceCandidates(child, sources, depth + 1);
  }
}

export function extractDriveSources(response) {
  const sources = new Map();
  for (const item of response?.output || []) {
    if (
      item?.type !== 'mcp_call' ||
      item?.server_label !== 'google_drive_catalogos' ||
      !['search', 'fetch'].includes(item?.name)
    ) continue;

    collectSourceCandidates(parseJson(item.output), sources);
    collectSourceCandidates(parseJson(item.arguments), sources);
  }
  return [...sources.values()].slice(0, 12);
}

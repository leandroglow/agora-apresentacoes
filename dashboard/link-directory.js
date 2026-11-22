// Only destinations controlled by Ágora can appear in the Master directory.
export function directoryUrl(value) {
  if (typeof value !== 'string') return null;
  try {
    const url = new URL(value);
    const host = url.hostname;
    const allowed = ['apresentacoes.agoracons.com.br', 'ha.agoracons.com.br', 'agoracons.com.br',
      'www.agoracons.com.br', 'project-pyfyj.vercel.app', 'leandroglow.github.io'].includes(host)
      || /^[a-z0-9-]+\.leglow\.chatgpt\.site$/.test(host);
    if (!allowed || url.protocol !== 'https:' || url.port || url.username || url.password) return null;
    return url.href;
  } catch { return null; }
}

const normalize = value => value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLocaleLowerCase('pt-BR');

export function mountDirectory(container, items) {
  container.innerHTML = '<h1 class="module-title">Links</h1><label class="directory-search">Buscar um link<input type="search" placeholder="Nome, cliente ou projeto" autocomplete="off"></label><p class="directory-count" role="status"></p><div class="directory-groups"></div>';
  const input = container.querySelector('input');
  const groups = container.querySelector('.directory-groups');
  const count = container.querySelector('.directory-count');
  function draw() {
    groups.replaceChildren();
    const sections = new Map();
    const words = normalize(input.value.trim()).split(/\s+/).filter(Boolean);
    let total = 0;
    for (const item of items) {
      const href = directoryUrl(item.url);
      if (!href || !item.title) continue;
      const category = item.category || 'Outros';
      const searchable = normalize([item.title, category, item.subtitle || '', item.projectId || '', href].join(' '));
      if (!words.every(word => searchable.includes(word))) continue;
      if (!sections.has(category)) {
        const section = document.createElement('section');
        const heading = document.createElement('h2');
        heading.textContent = category;
        const grid = document.createElement('div');
        grid.className = 'directory-grid';
        section.append(heading, grid);
        groups.append(section);
        sections.set(category, grid);
      }
      const anchor = document.createElement('a');
      anchor.href = href;
      anchor.target = '_blank';
      anchor.rel = 'noopener noreferrer';
      const title = document.createElement('strong');
      title.textContent = item.title;
      const detail = document.createElement('small');
      detail.textContent = [item.subtitle, item.status].filter(Boolean).join(' · ');
      const arrow = document.createElement('span');
      arrow.setAttribute('aria-hidden','true');
      arrow.textContent = '↗';
      anchor.append(title, detail, arrow);
      sections.get(category).append(anchor);
      total++;
    }
    count.textContent = total ? `${total} ${total === 1 ? 'link' : 'links'}` :
      (input.value ? 'Nenhum link encontrado para essa busca.' : 'Nenhum link cadastrado.');
  }
  input.addEventListener('input', draw);
  draw();
}

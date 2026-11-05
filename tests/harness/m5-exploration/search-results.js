import { createIcon, classifyLabelPresentation } from '../../../src/engine/hypertree/render/index.js';
import { validateWebLink } from '../../../src/engine/hypertree/shared/web-link.js';

export function createSearchResultsView({ document, host, onActivate, onClear, onPage }) {
  if (!document || !host) throw new Error('search results view requires document and host');
  const root = document.createElement('section');
  root.id = 'search-results';
  root.setAttribute('aria-label', 'Search results');
  const head = document.createElement('div'); head.className = 'search-results-head';
  const title = document.createElement('h2'); title.textContent = 'Search results';
  const clear = document.createElement('button'); clear.type = 'button'; clear.textContent = 'Clear search'; clear.hidden = true;
  head.append(title, clear);
  const status = document.createElement('p'); status.className = 'search-status'; status.setAttribute('role', 'status'); status.setAttribute('aria-live', 'polite');
  const back = document.createElement('button'); back.type = 'button'; back.className = 'search-back'; back.textContent = 'Back to results'; back.hidden = true;
  const list = document.createElement('div'); list.className = 'search-results-list';
  const pagination = document.createElement('div'); pagination.className = 'search-pagination'; pagination.hidden = true;
  const previous = document.createElement('button'); previous.type = 'button'; previous.className = 'search-page-previous'; previous.textContent = 'Previous';
  const next = document.createElement('button'); next.type = 'button'; next.className = 'search-page-next'; next.textContent = 'Next';
  pagination.append(previous, next);
  root.append(head, status, list, pagination, back);
  host.appendChild(root);
  let activeId = null;
  const descriptionExcerpt = (value) => {
    const text = typeof value === 'string' ? value : '';
    if (text.length === 0) return 'No description';
    return text.length > 180 ? `${text.slice(0, 177)}…` : text;
  };
  const rangeStatus = (payload) => {
    if (payload.total === 0) return `No matches for “${payload.query}”.`;
    return `${payload.total} match${payload.total === 1 ? '' : 'es'} · ${payload.rangeStart}–${payload.rangeEnd} · Page ${payload.page} of ${payload.pageCount}.`;
  };
  const renderPager = (payload) => {
    pagination.hidden = payload.total === 0 || payload.pageCount <= 1;
    previous.disabled = payload.page <= 1;
    next.disabled = payload.page >= payload.pageCount;
  };
  const renderCards = (payload) => {
    list.replaceChildren();
    for (const result of payload.results) {
      const card = document.createElement('button'); card.type = 'button'; card.className = 'search-card'; card.dataset.id = result.id; card.setAttribute('aria-label', `${result.name}, ${result.kind === 'folder' ? 'Folder' : 'Data'}`);
      const presentation = classifyLabelPresentation({ kind: result.kind, name: result.name, dataType: result.dataType, classification: result.classification });
      const icon = createIcon(document, presentation.icon); icon.style.color = presentation.color; icon.style.flex = '0 0 auto';
      const body = document.createElement('span'); body.className = 'search-card-body';
      const name = document.createElement('strong'); name.className = 'search-card-name'; name.textContent = result.name;
      const desc = document.createElement('span'); desc.className = 'search-card-description'; desc.textContent = descriptionExcerpt(result.description);
      const meta = document.createElement('span'); meta.className = 'search-card-meta'; meta.textContent = presentation.typeLabel;
      body.append(name, desc, meta);
      if (result.parentPath) { const path = document.createElement('span'); path.className = 'search-card-path'; path.textContent = result.parentPath; body.appendChild(path); }
      card.append(icon, body);
      card.addEventListener('click', () => { onActivate(result); });
      const wrap = document.createElement('div'); wrap.className = 'search-card-wrap'; wrap.appendChild(card);
      if (result.dataType === 'web-link') {
        const checked = validateWebLink(typeof result.link === 'string' ? result.link : null);
        if (checked.ok) {
          const anchor = document.createElement('a'); anchor.className = 'search-open-link'; anchor.href = checked.value; anchor.target = '_blank'; anchor.rel = 'noopener noreferrer'; anchor.textContent = 'Open website';
          anchor.addEventListener('click', (event) => event.stopPropagation());
          wrap.appendChild(anchor);
        }
      }
      list.appendChild(wrap);
    }
    if (payload.results.length === 0) { const empty = document.createElement('p'); empty.className = 'search-empty'; empty.textContent = 'No matching nodes.'; list.appendChild(empty); }
  };
  const api = {
    root, get activeId() { return activeId; },
    showInitial() { root.hidden = false; clear.hidden = true; status.textContent = 'Type to search names and descriptions across the whole map.'; list.replaceChildren(); pagination.hidden = true; back.hidden = true; activeId = null; },
    showNoMap() { root.hidden = false; clear.hidden = true; status.textContent = 'Create a map to search.'; list.replaceChildren(); pagination.hidden = true; back.hidden = true; activeId = null; },
    render(payload) {
      root.hidden = false; clear.hidden = false; activeId = null; back.hidden = true;
      if (!payload.ok) { status.textContent = payload.message || 'Search failed.'; list.replaceChildren(); pagination.hidden = true; back.hidden = true; activeId = null; return; }
      status.textContent = rangeStatus(payload);
      renderPager(payload);
      renderCards(payload);
    },
    showError(message) { root.hidden = false; clear.hidden = false; status.textContent = message; },
    setActive(id) { activeId = id; back.hidden = false; for (const card of list.querySelectorAll?.('.search-card') || []) card.setAttribute('aria-current', card.dataset.id === id ? 'true' : 'false'); },
    focusActive() { const card = list.querySelector?.(`[data-id="${String(activeId).replaceAll('"', '\\"')}"]`); card?.focus?.(); },
    focus() { list.querySelector?.('.search-card')?.focus?.(); },
    destroy() { root.remove(); }
  };
  previous.addEventListener('click', () => onPage?.(-1));
  next.addEventListener('click', () => onPage?.(1));
  clear.addEventListener('click', () => onClear());
  back.addEventListener('click', () => api.focusActive());
  api.showInitial();
  return api;
}






/** Connected-Orbit navigation/list presentation. It renders snapshots only. */
export function createOrbitPanel({ document, onRefresh, onSelect, onChoose, onExpandRail } = {}) {
  const section = document.querySelector('#orbit-section');
  const toggle = document.querySelector('#orbit-toggle');
  const panel = document.querySelector('#orbit-panel');
  const nameEl = document.querySelector('#orbit-name');
  const refreshButton = document.querySelector('#orbit-refresh');
  const statusEl = document.querySelector('#orbit-status');
  const emptyEl = document.querySelector('#orbit-empty');
  const listEl = document.querySelector('#orbit-list');
  const chooseButton = document.querySelector('#orbit-choose');
  if (!section || !toggle || !panel || !nameEl || !refreshButton || !statusEl || !emptyEl || !listEl || !chooseButton) {
    throw new TypeError('Orbit panel elements are missing.');
  }
  let last = null;
  let currentEntryKey = null;
  let expanded = false;
  let wasActive = false;

  const setButton = (button, disabled) => { button.disabled = Boolean(disabled); button.setAttribute('aria-disabled', String(Boolean(disabled))); };
  const formatUpdated = (value) => {
    if (!Number.isFinite(value)) return '';
    try { return new Date(value).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }); } catch { return ''; }
  };
  const statusFor = (snapshot) => {
    if (snapshot?.phase === 'opening') return 'Opening Orbit…';
    if (!snapshot?.handle) return 'Choose a directory to show its .orbit maps.';
    if (snapshot.phase === 'listing') return 'Refreshing Map Library…';
    if (snapshot.phase === 'blocked' || snapshot.error) return snapshot.error?.message || 'This Orbit is unavailable. Refresh after restoring permission.';
    if (snapshot.stale && snapshot.truncated) return 'The map list may be out of date and is truncated. Refresh to update it.';
    if (snapshot.stale) return 'The map list may be out of date. Refresh to update it.';
    if (snapshot.truncated) {
      const count = snapshot.entries.length;
      return `Showing ${count} map${count === 1 ? '' : 's'}; the directory list is truncated. Refresh after narrowing the folder.`;
    }
    const updated = formatUpdated(snapshot.lastRefreshedAt);
    return updated ? `Updated ${updated}.` : 'Not refreshed yet.';
  };

  const renderRows = (snapshot) => {
    const focusedKey = document.activeElement?.dataset?.orbitEntryKey || null;
    listEl.replaceChildren();
    for (const entry of snapshot.entries || []) {
      const item = document.createElement('li');
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'orbit-entry';
      button.dataset.orbitEntryKey = entry.key;
      button.disabled = snapshot.phase === 'opening';
      button.setAttribute('aria-disabled', String(button.disabled));
      button.setAttribute('aria-current', entry.key === currentEntryKey ? 'true' : 'false');
      button.setAttribute('aria-label', `Open ${entry.name}`);
      button.title = entry.name;
      const label = document.createElement('span');
      label.className = 'orbit-entry-name';
      label.textContent = entry.name;
      const meta = document.createElement('span');
      meta.className = 'orbit-entry-meta';
      const modified = Number(entry.lastModified);
      meta.textContent = Number.isFinite(modified) && modified > 0 ? new Date(modified).toLocaleDateString() : '';
      button.append(label, meta);
      if (entry.key === currentEntryKey) {
        const marker = document.createElement('span');
        marker.className = 'orbit-current-dot';
        marker.setAttribute('aria-hidden', 'true');
        marker.textContent = '●';
        button.prepend(marker);
      }
      button.addEventListener('click', () => {
        if (button.disabled) return;
        onSelect?.(entry);
      });
      item.appendChild(button);
      listEl.appendChild(item);
      if (focusedKey === entry.key) button.focus();
    }
  };

  const railExpanded = () => document.querySelector('#nav-rail')?.dataset?.expanded !== 'false';
  const syncToggle = () => {
    const active = Boolean(last?.handle);
    const name = active ? String(last.name || last.handle?.name || 'Library directory') : 'No directory connected';
    const visibleExpanded = Boolean(expanded && railExpanded());
    toggle.hidden = false;
    toggle.disabled = false;
    toggle.setAttribute('aria-expanded', String(visibleExpanded));
    toggle.setAttribute('aria-label', 'Map Library');
    toggle.title = active ? `Map Library: ${name}` : 'Map Library';
    panel.hidden = !visibleExpanded;
  };

  function render(snapshot, { supported = true, currentKey = null, busy = false } = {}) {
    last = snapshot || null;
    currentEntryKey = currentKey || null;
    const active = Boolean(snapshot?.handle);
    if (active && !wasActive) expanded = railExpanded();
    if (!active) expanded = false;
    wasActive = active;
    section.hidden = false;
    nameEl.textContent = active ? String(snapshot.name || snapshot.handle?.name || 'Library directory') : 'No directory connected';
    chooseButton.textContent = active ? 'Change Directory' : 'Choose Directory';
    chooseButton.disabled = Boolean(busy || snapshot?.phase === 'opening' || snapshot?.phase === 'listing');
    panel.setAttribute('aria-busy', String(snapshot?.phase === 'opening' || snapshot?.phase === 'listing'));
    setButton(refreshButton, busy || !active || snapshot.phase === 'opening' || snapshot.phase === 'listing');
    statusEl.textContent = statusFor(snapshot);
    const entries = Array.isArray(snapshot?.entries) ? snapshot.entries : [];
    const empty = Boolean(active) && entries.length === 0 && !['opening', 'listing', 'blocked'].includes(snapshot.phase);
    emptyEl.hidden = !empty;
    emptyEl.textContent = empty ? 'No .orbit documents in this directory.' : '';
    if (!active) {
      listEl.replaceChildren();
      syncToggle();
      return;
    }
    renderRows(snapshot);
    syncToggle();
  }

  toggle.addEventListener('click', () => {
    if (!railExpanded()) {
      onExpandRail?.();
      expanded = true;
      syncToggle();
      return;
    }
    expanded = !expanded;
    syncToggle();
    if (!expanded && panel.contains?.(document.activeElement)) toggle.focus?.();
  });
  chooseButton.addEventListener('click', () => { if (!chooseButton.disabled) onChoose?.(); });
  refreshButton.addEventListener('click', () => { if (!refreshButton.disabled) onRefresh?.(); });

  return {
    render,
    focusAction() { (expanded ? refreshButton : toggle).focus?.(); },
    get element() { return section; },
    get panel() { return panel; },
    get currentKey() { return currentEntryKey; },
    get expanded() { return expanded; },
    setRailExpanded(value) {
      expanded = Boolean(value) && Boolean(last?.handle);
      syncToggle();
    },
    destroy() {
      section.remove?.();
    }
  };
}

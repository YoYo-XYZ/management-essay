(() => {
  const style = document.createElement('style');
  style.textContent = `
    .lecture-map-viewport { position: fixed; inset: 0; overflow: scroll; overscroll-behavior: none; scroll-axis-lock: none; scrollbar-width: none; }
    .lecture-map-viewport::-webkit-scrollbar { display: none; }
    .lecture-map-surface { width: 100000px; height: 100000px; }
    .lecture-map-viewport markmap-view { position: sticky; left: 0; top: 0; display: block; width: 100vw; height: 100vh; }
    .lecture-search { position: fixed; z-index: 20; top: 12px; right: 12px; width: min(390px, calc(100vw - 24px)); font: 14px system-ui, sans-serif; color: #1f2937; }
    .lecture-search[hidden], .lecture-search-open[hidden] { display: none; }
    .lecture-search-open { position: fixed; z-index: 20; top: 12px; right: 12px; padding: 9px 14px; border: 1px solid #94a3b8; border-radius: 7px; background: white; color: #1f2937; box-shadow: 0 4px 18px #0002; font: 14px system-ui, sans-serif; cursor: pointer; }
    .lecture-search-box { background: white; border: 1px solid #cbd5e1; border-radius: 9px; box-shadow: 0 4px 18px #0002; padding: 10px; }
    .lecture-search-row { display: flex; gap: 6px; }
    .lecture-search input { flex: 1; min-width: 0; padding: 8px; font: inherit; border: 1px solid #94a3b8; border-radius: 5px; }
    .lecture-search button { font: inherit; cursor: pointer; }
    .lecture-search-row button { padding: 6px 10px; border: 1px solid #94a3b8; background: #f8fafc; border-radius: 5px; }
    .lecture-search-status { margin: 7px 1px 2px; color: #475569; }
    .lecture-search-results { display: grid; gap: 4px; max-height: min(50vh, 400px); overflow: auto; margin-top: 6px; }
    .lecture-search-result { text-align: left; border: 0; border-radius: 5px; background: #f1f5f9; padding: 8px; color: #0f172a; }
    .lecture-search-result:hover, .lecture-search-result:focus-visible { background: #dbeafe; }
    .lecture-search-path { display: block; color: #475569; font-size: 12px; margin-bottom: 3px; }
    .lecture-search mark { background: #fde68a; color: inherit; }
  `;
  document.head.append(style);
  const panel = document.createElement('section');
  panel.className = 'lecture-search';
  panel.setAttribute('aria-label', 'Search lecture map');
  panel.innerHTML = `<div class="lecture-search-box"><div class="lecture-search-row"><input type="search" aria-label="Search lecture map" placeholder="Search lecture map" autocomplete="off"><button type="button" class="lecture-search-prev" aria-label="Previous result">↑</button><button type="button" class="lecture-search-next" aria-label="Next result">↓</button></div><div class="lecture-search-status" role="status" aria-live="polite">Search all chapters</div><div class="lecture-search-results"></div></div>`;
  const openButton = document.createElement('button');
  openButton.type = 'button';
  openButton.className = 'lecture-search-open';
  openButton.textContent = 'Search';
  openButton.setAttribute('aria-label', 'Open lecture map search');
  openButton.hidden = true;
  document.body.append(panel, openButton);
  const input = panel.querySelector('input');
  const status = panel.querySelector('.lecture-search-status');
  const list = panel.querySelector('.lecture-search-results');
  const view = document.querySelector('markmap-view');
  const nativePan = CSS.supports('scroll-axis-lock', 'none');
  if (view && nativePan) {
    const viewport = document.createElement('div');
    viewport.className = 'lecture-map-viewport';
    viewport.tabIndex = 0;
    viewport.setAttribute('role', 'region');
    viewport.setAttribute('aria-label', 'Lecture map; scroll to pan');
    const surface = document.createElement('div');
    surface.className = 'lecture-map-surface';
    view.before(viewport);
    viewport.append(surface);
    surface.append(view);
    const center = 50000;
    viewport.scrollLeft = center;
    viewport.scrollTop = center;
    let previousX = viewport.scrollLeft, previousY = viewport.scrollTop;
    viewport.addEventListener('scroll', () => {
      const x = viewport.scrollLeft, y = viewport.scrollTop;
      const dx = x - previousX, dy = y - previousY;
      previousX = x; previousY = y;
      if (view.mm && (dx || dy)) {
        const transform = view.mm.transform;
        view.mm.zoomTo(transform.translate(-dx / transform.k, -dy / transform.k), false);
      }
      if (x < 5000 || y < 5000 || x > 95000 || y > 95000) {
        viewport.scrollLeft = center; viewport.scrollTop = center;
        previousX = viewport.scrollLeft; previousY = viewport.scrollTop;
      }
    }, { passive: true });
  }
  let matches = [], active = -1, selectedId = null;
  function openSearch() { panel.hidden = false; openButton.hidden = true; input.focus(); input.select(); }
  function closeSearch() {
    panel.hidden = true;
    openButton.hidden = false;
    selectedId = null;
    clearHighlight();
  }
  openButton.addEventListener('click', openSearch);
  document.addEventListener('pointerdown', event => {
    const path = event.composedPath();
    if (!panel.hidden && !path.includes(panel) && !path.includes(openButton)) closeSearch();
  });
  view?.addEventListener('wheel', event => {
    if (event.composedPath().some(
      element => element.classList?.contains('markmap-toolbar'),
    )) {
      event.preventDefault();
      event.stopPropagation();
      return;
    }
    if (event.ctrlKey || event.metaKey || !view.mm) return;
    if (nativePan) { event.stopPropagation(); return; }
    event.preventDefault();
    event.stopPropagation();
    const transform = view.mm.transform;
    const unit = event.deltaMode === WheelEvent.DOM_DELTA_LINE ? 16 : event.deltaMode === WheelEvent.DOM_DELTA_PAGE ? view.clientHeight : 1;
    const dx = event.shiftKey && !event.deltaX ? event.deltaY : event.deltaX;
    const dy = event.shiftKey && !event.deltaX ? 0 : event.deltaY;
    // Cancel any in-progress focus animation before applying both scroll axes.
    view.mm.zoomTo(transform.translate(-dx * unit / transform.k, -dy * unit / transform.k), false);
  }, { capture: true, passive: false });
  // Markmap consumes zoom gestures on its SVG. Suppress browser zoom when
  // a gesture falls on a fixed control or the map reaches a zoom limit.
  document.addEventListener('wheel', event => {
    if (view?.mm && (event.ctrlKey || event.metaKey)) event.preventDefault();
  }, { passive: false });
  const mapStyle = document.createElement('style');
  mapStyle.textContent = '[data-search-selected] tspan { fill: #9a3412 !important; font-weight: 700 !important; } [data-search-selected] > path { stroke: #f59e0b !important; stroke-width: 4px !important; }';
  view?.shadowRoot?.append(mapStyle);
  function clearHighlight() { view?.shadowRoot?.querySelectorAll('[data-search-selected]').forEach(node => node.removeAttribute('data-search-selected')); }
  function applyHighlight() {
    clearHighlight();
    if (selectedId) view?.shadowRoot?.querySelector(`[data-key="node:${CSS.escape(selectedId)}"]`)?.setAttribute('data-search-selected', '');
  }
  view?.addEventListener('render', () => requestAnimationFrame(applyHighlight));

  function textOf(content) {
    return (content || []).map(item => typeof item.value === 'string' ? item.value : item.type === 'image' ? (item.alt || '') : textOf(item.children)).join('');
  }
  function buildIndex() {
    const result = [];
    function walk(node, parents) {
      const label = textOf(node.content).replace(/\s+/g, ' ').trim();
      if (label && node.id !== 'root') result.push({ id: node.id, label, path: parents });
      for (const child of node.children || []) walk(child, node.id === 'root' ? parents : [...parents, label]);
    }
    if (view?.mm?.root) walk(view.mm.root, []);
    return result;
  }
  function showResult(index) {
    if (!matches.length) return;
    active = (index + matches.length) % matches.length;
    const match = matches[active];
    view.mm.focusNode(match.id, { scale: 1.1, animate: true });
    selectedId = match.id;
    applyHighlight();
    setTimeout(applyHighlight, 600);
    status.textContent = `${active + 1} of ${matches.length} results`;
    const buttons = list.querySelectorAll('button');
    buttons.forEach((button, i) => button.setAttribute('aria-current', i === active ? 'true' : 'false'));
    buttons[active]?.scrollIntoView({ block: 'nearest' });
  }
  function search() {
    const query = input.value.trim().toLocaleLowerCase();
    list.replaceChildren(); active = -1; selectedId = null; clearHighlight();
    if (!query) { matches = []; status.textContent = 'Search all chapters'; return; }
    if (!view?.mm?.root) { matches = []; status.textContent = 'Map is still loading'; return; }
    matches = buildIndex().filter(item => item.label.toLocaleLowerCase().includes(query));
    status.textContent = matches.length ? `${matches.length} result${matches.length === 1 ? '' : 's'}; select one to jump to it` : 'No results';
    matches.forEach((match, index) => {
      const button = document.createElement('button');
      button.type = 'button'; button.className = 'lecture-search-result';
      const path = document.createElement('span'); path.className = 'lecture-search-path'; path.textContent = match.path.join(' › ');
      const label = document.createElement('span');
      const at = match.label.toLocaleLowerCase().indexOf(query);
      label.append(document.createTextNode(match.label.slice(0, at)));
      const mark = document.createElement('mark'); mark.textContent = match.label.slice(at, at + query.length); label.append(mark, document.createTextNode(match.label.slice(at + query.length)));
      button.append(path, label); button.addEventListener('click', () => showResult(index)); list.append(button);
    });
  }
  input.addEventListener('input', search);
  input.addEventListener('keydown', event => {
    if (event.key === 'Enter') { event.preventDefault(); showResult(active + (event.shiftKey ? -1 : 1)); }
    if (event.key === 'Escape') { closeSearch(); openButton.focus(); }
  });
  panel.querySelector('.lecture-search-prev').addEventListener('click', () => showResult(active < 0 ? matches.length - 1 : active - 1));
  panel.querySelector('.lecture-search-next').addEventListener('click', () => showResult(active + 1));
  document.addEventListener('keydown', event => {
    if ((event.ctrlKey || event.metaKey) && !event.altKey && event.key.toLowerCase() === 'f') { event.preventDefault(); openSearch(); }
  });
  view?.addEventListener('render', () => { if (input.value && !matches.length) search(); }, { once: true });
})();

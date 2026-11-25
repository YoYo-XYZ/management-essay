(() => {
  const view = document.querySelector('markmap-view');
  if (!view) return;
  const svgNS = 'http://www.w3.org/2000/svg';
  const style = document.createElement('style');
  style.textContent = `
    .quiz-toggle { padding: 9px 14px; cursor: pointer; border: 1px solid #94a3b8; border-radius: 7px; background: white; color: #1f2937; box-shadow: 0 4px 18px #0002; font: 14px system-ui, sans-serif; }
    .quiz-progress { position: fixed; width: 1px; height: 1px; overflow: hidden; clip-path: inset(50%); white-space: nowrap; }
    .quiz-progress[hidden] { display: none; }
    .quiz-drag-preview { position: fixed; z-index: 1000; pointer-events: none; box-sizing: border-box; display: flex; align-items: center; justify-content: center; color: #1e3a8a; font-family: Arial, sans-serif; font-weight: 600; line-height: 1; white-space: nowrap; }
  `;
  document.head.append(style);
  const toggle = document.createElement('button');
  toggle.type = 'button'; toggle.className = 'quiz-toggle'; toggle.textContent = 'Quiz'; toggle.setAttribute('aria-pressed', 'false');
  const progress = document.createElement('div');
  progress.className = 'quiz-progress'; progress.hidden = true; progress.setAttribute('role', 'status'); progress.setAttribute('aria-live', 'polite');
  const controls = document.querySelector('.lecture-map-controls');
  (controls || document.body).append(toggle);
  document.body.append(progress);

  function makeGroups(markdown) {
    const lines = markdown.split(/\r?\n/), nodes = [], stack = [];
    lines.forEach((line, lineIndex) => {
      if (/^#{1,6}\s/.test(line)) { stack.length = 0; return; }
      const match = /^(\s*)[-*+]\s+(.+)$/.exec(line);
      if (!match) return;
      const indent = match[1].replace(/\t/g, '    ').length;
      while (stack.length && stack[stack.length - 1].indent >= indent) stack.pop();
      const node = { indent, text: match[2], lineIndex, children: [] };
      if (stack.length) stack[stack.length - 1].children.push(node);
      nodes.push(node); stack.push(node);
    });
    const groups = nodes.map(parent => {
      const definitions = parent.children.map(child => ({ ...child, terms: [...child.text.matchAll(/\*\*([^*]+)\*\*/g)].map(match => match[1]) })).filter(child => child.terms.length);
      return { parent, definitions, terms: definitions.flatMap(child => child.terms) };
    }).filter(group => group.terms.length >= 2);
    return { lines, groups };
  }
  function shuffle(items) {
    const result = [...items];
    for (let i = result.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [result[i], result[j]] = [result[j], result[i]]; }
    // Avoid starting a group fully solved when distinct arrangements are possible.
    if (result.every((item, i) => item === items[i]) && new Set(items).size > 1) {
      const j = result.findIndex(item => item !== result[0]);
      [result[0], result[j]] = [result[j], result[0]];
    }
    return result;
  }
  function svgElement(name, attrs = {}) {
    const element = document.createElementNS(svgNS, name);
    for (const [key, value] of Object.entries(attrs)) element.setAttribute(key, String(value));
    return element;
  }
  let session = null, selected = null, pendingDraw = false, drag = null;
  function updateProgress(message = '') {
    if (!session) return;
    const done = session.groups.filter(group => group.done).length;
    progress.textContent = `${done} of ${session.groups.length} groups completed. ${message || 'Drag or select two boxes to swap. Use Check at the end of each group’s first definition.'}`;
  }
  function start() {
    const original = view.markdown;
    const { lines, groups } = makeGroups(original);
    const canvas = document.createElement('canvas'), context = canvas.getContext('2d');
    context.font = 'bold 16px Arial, sans-serif';
    groups.forEach((group, groupIndex) => {
      group.index = groupIndex; group.checked = false; group.done = false;
      const shuffled = shuffle(group.terms);
      group.slots = group.terms.map((answer, index) => ({ answer, value: shuffled[index], index, group }));
      const width = Math.max(...group.terms.map(term => context.measureText(term).width));
      const count = Math.max(4, Math.ceil((width + 20) / context.measureText('W').width));
      group.placeholder = 'W'.repeat(count);
      let index = 0;
      group.definitions.forEach(definition => {
        definition.slots = definition.terms.map(() => group.slots[index++]);
        lines[definition.lineIndex] = lines[definition.lineIndex].replace(/\*\*([^*]+)\*\*/g, `**${group.placeholder}**`);
      });
    });
    const markdown = lines.join('\n');
    const offsets = []; let offset = 0;
    lines.forEach(line => { offsets.push(offset); offset += line.length + 1; });
    session = { original, markdown, offsets, groups };
    selected = null; view.markdown = markdown;
    const search = document.querySelector('.lecture-search input');
    if (search) { search.value = ''; search.dispatchEvent(new Event('input', { bubbles: true })); }
    toggle.textContent = 'Exit quiz'; toggle.setAttribute('aria-pressed', 'true'); progress.hidden = false; updateProgress(); scheduleDraw();
  }
  function stop() {
    const original = session.original;
    session = null; selected = null; clearDrag();
    view.markdown = original;
    toggle.textContent = 'Quiz'; toggle.setAttribute('aria-pressed', 'false'); progress.hidden = true;
  }
  function lineAt(position) {
    const offsets = session.offsets; let low = 0, high = offsets.length;
    while (low + 1 < high) { const mid = (low + high) >> 1; if (offsets[mid] <= position) low = mid; else high = mid; }
    return low;
  }
  function scheduleDraw() {
    if (!session || pendingDraw) return;
    pendingDraw = true;
    requestAnimationFrame(() => { pendingDraw = false; if (session) draw(); });
  }
  function nodeTextGroup(nodeId) {
    const node = view.shadowRoot.querySelector(`[data-key="node:${CSS.escape(nodeId)}"]`);
    const text = node?.querySelector('text');
    return text ? { node, text, container: text.parentNode } : null;
  }
  function draw() {
    const root = view.shadowRoot;
    const focused = root.activeElement?.closest('.quiz-map-control');
    const focusedGroup = focused?.dataset.group, focusedSlot = focused?.dataset.slot;
    root.querySelectorAll('.quiz-map-control').forEach(element => element.remove());
    const byLine = new Map();
    function walk(node) { if (node.position) byLine.set(lineAt(node.position.start), node); for (const child of node.children || []) walk(child); }
    if (!view.mm?.root) return;
    walk(view.mm.root);
    session.groups.forEach(group => {
      const first = byLine.get(group.definitions[0].lineIndex);
      if (first) drawCheck(first.id, group);
      group.definitions.forEach(definition => {
        const node = byLine.get(definition.lineIndex);
        if (!node) return;
        const target = nodeTextGroup(node.id);
        if (!target) return;
        const spans = [...target.text.querySelectorAll('tspan')].filter(span => span.textContent === group.placeholder);
        spans.forEach((span, index) => { if (definition.slots[index]) drawSlot(target, span, definition.slots[index]); });
      });
    });
    if (focusedGroup !== undefined) {
      const selector = focusedSlot === undefined
        ? `.quiz-map-check[data-group="${focusedGroup}"]`
        : `.quiz-map-slot[data-group="${focusedGroup}"][data-slot="${focusedSlot}"]`;
      root.querySelector(selector)?.focus({ preventScroll: true });
    }
  }
  function addControl(target, x, y, width, height, label, className) {
    const control = svgElement('g', { class: `quiz-map-control ${className}`, role: 'button', tabindex: '0', transform: target.text.getAttribute('transform') || '', 'aria-label': label });
    const rect = svgElement('rect', { x, y, width, height, rx: 4, fill: '#eff6ff', stroke: '#2563eb', 'stroke-width': 1.4 });
    const text = svgElement('text', { x: x + width / 2, y: y + height / 2, 'text-anchor': 'middle', 'dominant-baseline': 'central', 'font-family': 'Arial, sans-serif', 'font-size': 14, 'font-weight': 600, fill: '#1e3a8a', 'pointer-events': 'none' });
    control.append(rect, text); target.container.append(control);
    control.style.cursor = 'pointer';
    control.addEventListener('mousedown', event => event.stopPropagation());
    control.addEventListener('touchstart', event => event.stopPropagation(), { passive: true });
    control.addEventListener('click', event => { event.preventDefault(); event.stopPropagation(); });
    return { control, rect, text };
  }
  function swap(first, second) {
    if (!first || !second || first.group !== second.group || first === second) return false;
    [first.value, second.value] = [second.value, first.value];
    first.group.checked = false; first.group.done = false; selected = null;
    updateProgress('Boxes swapped.'); scheduleDraw(); return true;
  }
  function activate(slot) {
    if (selected === slot) { selected = null; updateProgress('Selection cleared.'); }
    else if (!selected) { selected = slot; updateProgress(`Selected ${slot.value}. Select another box in the same group to swap.`); }
    else if (selected.group !== slot.group) { selected = slot; updateProgress(`Selected ${slot.value}. Boxes can only be swapped within their parent group.`); }
    else { swap(selected, slot); return; }
    scheduleDraw();
  }
  function drawSlot(target, span, slot) {
    // The SVG bounding box includes extra glyph overflow. Use the text advance
    // instead so a box never covers the following definition.
    const x = Number(span.getAttribute('x')) || 0;
    const baseline = Number(span.getAttribute('y')) || 16;
    const nextX = span.nextElementSibling?.getAttribute('x');
    const width = nextX !== null && nextX !== undefined ? Number(nextX) - x : span.getComputedTextLength();
    span.setAttribute('fill-opacity', '0');
    const { control, rect, text } = addControl(target, x, baseline - 16, Math.max(1, width - 2), 19, `Quiz term ${slot.value}. Select or drag to swap within this group.`, 'quiz-map-slot');
    control.dataset.group = String(slot.group.index); control.dataset.slot = String(slot.index);
    control.style.touchAction = 'none';
    text.textContent = slot.value;
    if (selected === slot) { rect.setAttribute('stroke', '#1d4ed8'); rect.setAttribute('stroke-width', '3'); }
    else if (slot.group.checked) {
      const correct = slot.value === slot.answer;
      rect.setAttribute('stroke', correct ? '#15803d' : '#b91c1c');
      rect.setAttribute('fill', correct ? '#f0fdf4' : '#fef2f2');
      control.setAttribute('aria-label', `${slot.value}: ${correct ? 'correct' : 'incorrect'}. Select or drag to swap.`);
    }
    control.addEventListener('pointerdown', event => {
      if (event.button !== 0) return;
      event.preventDefault(); event.stopPropagation();
      const bounds = rect.getBoundingClientRect();
      const matrix = rect.getScreenCTM();
      const scale = matrix ? Math.hypot(matrix.a, matrix.b) : 1;
      const strokeWidth = Number(rect.getAttribute('stroke-width')) || 1.4;
      const stroke = strokeWidth * scale;
      drag = { slot, source: control, target: null, x: event.clientX, y: event.clientY, pointerId: event.pointerId, preview: null, moved: false,
        width: bounds.width + stroke, height: bounds.height + stroke, offsetX: event.clientX - bounds.left + stroke / 2, offsetY: event.clientY - bounds.top + stroke / 2,
        scale, fill: rect.getAttribute('fill'), stroke: rect.getAttribute('stroke'), strokeWidth };
    });
    control.addEventListener('keydown', event => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); event.stopPropagation(); activate(slot); } });
  }
  function drawCheck(nodeId, group) {
    const target = nodeTextGroup(nodeId); if (!target) return;
    const spans = [...target.text.querySelectorAll('tspan')];
    if (!spans.length) return;
    const last = spans[spans.length - 1];
    const x = (Number(last.getAttribute('x')) || 0) + last.getComputedTextLength() + 8;
    const baseline = Number(last.getAttribute('y')) || 16;
    const { control, rect, text } = addControl(target, x, baseline - 16, 53, 19, 'Check answers for this group', 'quiz-map-check');
    control.dataset.group = String(group.index);
    control.setAttribute('aria-pressed', String(group.checked));
    text.textContent = group.done ? 'Done' : 'Check';
    if (group.done) { rect.setAttribute('stroke', '#15803d'); rect.setAttribute('fill', '#f0fdf4'); }
    else if (group.checked) { rect.setAttribute('fill', '#dbeafe'); }
    const check = () => {
      group.checked = !group.checked;
      const correct = group.slots.filter(slot => slot.value === slot.answer).length;
      group.done = group.checked && correct === group.slots.length;
      selected = null;
      updateProgress(group.checked
        ? `${correct} of ${group.slots.length} correct in this group${group.done ? '. Group completed.' : '. Try again.'}`
        : 'Answer feedback hidden.');
      scheduleDraw();
    };
    control.addEventListener('click', check);
    control.addEventListener('keydown', event => {
      if (event.key !== 'Enter' && event.key !== ' ') return;
      event.preventDefault(); event.stopPropagation();
      if (!event.repeat) check();
    });
  }
  function clearDrag() {
    if (drag?.source) drag.source.style.visibility = '';
    if (drag?.target) drag.target.style.filter = '';
    drag?.preview?.remove();
    drag = null;
  }
  document.addEventListener('pointermove', event => {
    if (!drag || event.pointerId !== drag.pointerId) return;
    if (!drag.moved && Math.hypot(event.clientX - drag.x, event.clientY - drag.y) <= 5) return;
    if (!drag.preview) {
      drag.preview = document.createElement('div');
      drag.preview.className = 'quiz-drag-preview';
      drag.preview.setAttribute('aria-hidden', 'true');
      drag.preview.textContent = drag.slot.value;
      Object.assign(drag.preview.style, {
        width: `${drag.width}px`, height: `${drag.height}px`, fontSize: `${14 * drag.scale}px`,
        background: drag.fill, border: `${drag.strokeWidth * drag.scale}px solid ${drag.stroke}`,
        borderRadius: `${4 * drag.scale}px`,
      });
      document.body.append(drag.preview);
      drag.source.style.visibility = 'hidden';
    }
    drag.moved = true;
    drag.preview.style.left = `${event.clientX - drag.offsetX}px`;
    drag.preview.style.top = `${event.clientY - drag.offsetY}px`;
    const target = view.shadowRoot.elementFromPoint(event.clientX, event.clientY)?.closest('.quiz-map-slot');
    const valid = target && Number(target.dataset.group) === drag.slot.group.index ? target : null;
    if (drag.target !== valid) {
      if (drag.target) drag.target.style.filter = '';
      drag.target = valid;
      if (valid) valid.style.filter = 'drop-shadow(0 0 4px #2563eb)';
    }
    event.preventDefault();
  }, { passive: false });
  document.addEventListener('pointerup', event => {
    if (!drag || !session || event.pointerId !== drag.pointerId) return;
    const startDrag = drag; clearDrag();
    const moved = startDrag.moved || Math.hypot(event.clientX - startDrag.x, event.clientY - startDrag.y) > 5;
    const target = view.shadowRoot.elementFromPoint(event.clientX, event.clientY)?.closest('.quiz-map-slot');
    if (moved && target) {
      const group = session.groups[Number(target.dataset.group)];
      const slot = group?.slots[Number(target.dataset.slot)];
      if (!swap(startDrag.slot, slot)) updateProgress('Boxes can only be swapped within their parent group.');
    } else if (!moved) activate(startDrag.slot);
    else updateProgress('Drop a box onto another box in the same group to swap.');
  });
  document.addEventListener('pointercancel', clearDrag);
  window.addEventListener('blur', clearDrag);
  view.addEventListener('render', scheduleDraw);
  toggle.addEventListener('click', () => { if (session) stop(); else start(); });
})();

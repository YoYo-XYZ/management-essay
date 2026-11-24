(() => {
  const view = document.querySelector('markmap-view');
  if (!view) return;

  const style = document.createElement('style');
  style.textContent = `
    .quiz-toggle { position: fixed; z-index: 22; top: 65px; right: 12px; padding: 9px 14px; border: 1px solid #94a3b8; border-radius: 7px; background: white; color: #1f2937; box-shadow: 0 4px 18px #0002; font: 14px system-ui, sans-serif; cursor: pointer; }
    .quiz-panel { position: fixed; z-index: 21; top: 108px; right: 12px; width: min(480px, calc(100vw - 24px)); max-height: calc(100vh - 120px); overflow: auto; box-sizing: border-box; padding: 12px; border: 1px solid #cbd5e1; border-radius: 9px; background: #fff; box-shadow: 0 4px 18px #0003; color: #1f2937; font: 14px/1.5 system-ui, sans-serif; }
    .quiz-panel[hidden] { display: none; }
    .quiz-panel h2 { margin: 0; font-size: 18px; }
    .quiz-panel p { margin: 5px 0 10px; }
    .quiz-group { border-top: 1px solid #e2e8f0; padding: 8px 0; }
    .quiz-group summary { cursor: pointer; font-weight: 600; }
    .quiz-path { display: block; color: #64748b; font-size: 12px; font-weight: 400; }
    .quiz-terms { display: flex; flex-wrap: wrap; gap: 6px; margin: 8px 0; min-height: 40px; padding: 6px; border: 1px dashed #94a3b8; border-radius: 5px; }
    .quiz-bank-label { color: #64748b; font-size: 12px; }
    .quiz-term, .quiz-blank, .quiz-check { font: inherit; cursor: pointer; border-radius: 5px; padding: 4px 8px; }
    .quiz-term { border: 1px solid #60a5fa; background: #eff6ff; color: #1e3a8a; }
    .quiz-term[aria-pressed=true] { outline: 2px solid #1d4ed8; }
    .quiz-blank { border: 1px dashed #64748b; background: #f8fafc; color: #1e293b; min-width: 95px; }
    .quiz-blank.correct { border: 2px solid #15803d; background: #f0fdf4; }
    .quiz-blank.incorrect { border: 2px solid #b91c1c; background: #fef2f2; }
    .quiz-check { border: 1px solid #64748b; background: #f8fafc; }
    .quiz-definitions { margin: 8px 0; padding-left: 22px; }
    .quiz-definitions li { margin: 8px 0; }
    .quiz-feedback { display: block; min-height: 1.5em; }
  `;
  document.head.append(style);
  const toggle = document.createElement('button');
  toggle.className = 'quiz-toggle';
  toggle.type = 'button';
  toggle.textContent = 'Quiz';
  toggle.setAttribute('aria-pressed', 'false');
  const panel = document.createElement('aside');
  panel.className = 'quiz-panel';
  panel.setAttribute('aria-label', 'Lecture map quiz');
  panel.hidden = true;
  document.body.append(toggle, panel);

  // Preserve line numbers so only eligible immediate children are blanked in the map.
  function makeGroups(markdown) {
    const lines = markdown.split(/\r?\n/);
    const groups = [];
    const stack = [];
    let chapter = '', section = '';
    lines.forEach((line, lineIndex) => {
      const heading = /^(#{1,2})\s+(.+)/.exec(line);
      if (heading) {
        stack.length = 0;
        if (heading[1].length === 1) { chapter = heading[2]; section = ''; }
        else section = heading[2];
        return;
      }
      const item = /^(\s*)[-*+]\s+(.+)$/.exec(line);
      if (!item) return;
      const indent = item[1].replace(/\t/g, '    ').length;
      while (stack.length && stack[stack.length - 1].indent >= indent) stack.pop();
      const node = { indent, text: item[2], lineIndex, children: [], chapter, section };
      if (stack.length) stack[stack.length - 1].children.push(node);
      groups.push(node);
      stack.push(node);
    });
    const bold = /\*\*([^*]+)\*\*/g;
    return groups.map(parent => {
      const definitions = parent.children.map(child => ({ ...child, terms: [...child.text.matchAll(bold)].map(match => match[1]) })).filter(child => child.terms.length);
      const terms = definitions.flatMap(child => child.terms);
      return { parent, definitions, terms };
    }).filter(group => group.terms.length >= 2);
  }

  function shuffle(items) {
    const result = [...items];
    for (let i = result.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [result[i], result[j]] = [result[j], result[i]];
    }
    return result;
  }
  let original = null;
  function start() {
    original = view.markdown;
    const groups = makeGroups(original);
    const lines = original.split(/\r?\n/);
    for (const group of groups) for (const definition of group.definitions) {
      lines[definition.lineIndex] = lines[definition.lineIndex].replace(/\*\*([^*]+)\*\*/g, '_____');
    }
    view.markdown = lines.join('\n');
    const search = document.querySelector('.lecture-search input');
    if (search) { search.value = ''; search.dispatchEvent(new Event('input', { bubbles: true })); }
    panel.replaceChildren();
    const heading = document.createElement('h2'); heading.textContent = 'Quiz';
    const instructions = document.createElement('p'); instructions.textContent = 'Drag terms between blanks and the word bank, or select a term and then a blank. Check each group when you are ready.';
    const progress = document.createElement('p'); progress.setAttribute('role', 'status');
    panel.append(heading, instructions, progress);
    let completed = 0;
    const updateProgress = () => { progress.textContent = `${completed} of ${groups.length} groups completed`; };
    updateProgress();
    groups.forEach(group => renderGroup(group, progressChange => { completed += progressChange; updateProgress(); }));
    panel.hidden = false;
    toggle.textContent = 'Exit quiz';
    toggle.setAttribute('aria-pressed', 'true');
  }
  function renderGroup(group, onProgress) {
    const details = document.createElement('details'); details.className = 'quiz-group';
    const summary = document.createElement('summary');
    summary.append(document.createTextNode(group.parent.text.replace(/\*\*/g, '')));
    const path = document.createElement('span'); path.className = 'quiz-path'; path.textContent = [group.parent.chapter, group.parent.section].filter(Boolean).join(' › '); summary.append(path);
    const bankLabel = document.createElement('span'); bankLabel.className = 'quiz-bank-label'; bankLabel.textContent = 'Word bank (drop terms here)';
    const pool = document.createElement('div'); pool.className = 'quiz-terms'; pool.setAttribute('aria-label', 'Word bank');
    const returnButton = document.createElement('button'); returnButton.type = 'button'; returnButton.className = 'quiz-check'; returnButton.textContent = 'Return selected term to word bank'; returnButton.hidden = true;
    const definitions = document.createElement('ol'); definitions.className = 'quiz-definitions';
    const check = document.createElement('button'); check.type = 'button'; check.className = 'quiz-check'; check.textContent = 'Check answers';
    const feedback = document.createElement('span'); feedback.className = 'quiz-feedback'; feedback.setAttribute('aria-live', 'polite');
    details.append(summary, bankLabel, pool, returnButton, definitions, check, feedback); panel.append(details);
    const tokens = group.terms.map((term, id) => ({ term, id, slot: null }));
    const slots = [];
    let selected = null, checked = false, done = false;
    group.definitions.forEach(definition => {
      const li = document.createElement('li');
      let last = 0;
      for (const match of definition.text.matchAll(/\*\*([^*]+)\*\*/g)) {
        li.append(document.createTextNode(definition.text.slice(last, match.index)));
        const button = document.createElement('button'); button.type = 'button'; button.className = 'quiz-blank';
        const slot = { answer: match[1], token: null, button }; slots.push(slot);
        button.addEventListener('click', () => { if (selected !== null) place(selected, slot); else if (slot.token !== null) select(slot.token); });
        button.addEventListener('dragover', event => event.preventDefault());
        button.addEventListener('drop', event => { event.preventDefault(); const id = Number(event.dataTransfer.getData('text/plain')); if (event.dataTransfer.getData('application/x-quiz-group') === details.dataset.quizId && Number.isInteger(id) && tokens[id]) place(id, slot); });
        button.addEventListener('dragstart', event => { if (slot.token === null) { event.preventDefault(); return; } startDrag(event, slot.token); });
        li.append(button); last = match.index + match[0].length;
      }
      li.append(document.createTextNode(definition.text.slice(last))); definitions.append(li);
    });
    details.dataset.quizId = String(panel.children.length);
    const order = shuffle(tokens);
    function startDrag(event, id) { event.dataTransfer.setData('text/plain', String(id)); event.dataTransfer.setData('application/x-quiz-group', details.dataset.quizId); }
    pool.addEventListener('dragover', event => event.preventDefault());
    pool.addEventListener('drop', event => { event.preventDefault(); const id = Number(event.dataTransfer.getData('text/plain')); if (event.dataTransfer.getData('application/x-quiz-group') === details.dataset.quizId && Number.isInteger(id) && tokens[id]) returnToBank(id); });
    returnButton.addEventListener('click', () => { if (selected !== null) returnToBank(selected); });
    function select(id) { selected = selected === id ? null : id; render(); }
    function changed() { selected = null; checked = false; if (done) { done = false; onProgress(-1); } feedback.textContent = ''; render(); }
    function returnToBank(id) { const token = tokens[id]; if (!token.slot) return; token.slot.token = null; token.slot = null; changed(); }
    function place(id, slot) {
      const token = tokens[id];
      const previous = token.slot;
      if (previous === slot) { selected = null; render(); return; }
      const displaced = slot.token === null ? null : tokens[slot.token];
      if (previous) previous.token = displaced ? displaced.id : null;
      if (displaced) displaced.slot = previous;
      slot.token = id; token.slot = slot;
      changed();
    }
    function render() {
      pool.replaceChildren();
      order.filter(token => !token.slot).forEach(token => {
        const button = document.createElement('button'); button.type = 'button'; button.className = 'quiz-term'; button.draggable = true;
        button.textContent = token.term; button.setAttribute('aria-pressed', String(selected === token.id));
        button.addEventListener('click', () => select(token.id));
        button.addEventListener('dragstart', event => startDrag(event, token.id));
        pool.append(button);
      });
      slots.forEach(slot => {
        const token = slot.token === null ? null : tokens[slot.token];
        slot.button.draggable = !!token;
        slot.button.textContent = token ? token.term : 'Choose term';
        slot.button.setAttribute('aria-label', token ? `Placed: ${token.term}. Select to move.` : 'Empty answer. Select a term, then this blank.');
        slot.button.classList.toggle('correct', checked && !!token && token.term === slot.answer);
        slot.button.classList.toggle('incorrect', checked && (!token || token.term !== slot.answer));
        slot.button.setAttribute('aria-pressed', String(!!token && selected === token.id));
      });
      returnButton.hidden = selected === null || !tokens[selected].slot;
    }
    check.addEventListener('click', () => {
      checked = true;
      const correct = slots.filter(slot => slot.token !== null && tokens[slot.token].term === slot.answer).length;
      const nowDone = correct === slots.length;
      if (nowDone !== done) { onProgress(nowDone ? 1 : -1); done = nowDone; }
      feedback.textContent = `${correct} of ${slots.length} correct${nowDone ? '. Group completed.' : '. Try again.'}`;
      render();
    });
    render();
  }
  toggle.addEventListener('click', () => {
    if (original === null) start();
    else { view.markdown = original; original = null; panel.hidden = true; panel.replaceChildren(); toggle.textContent = 'Quiz'; toggle.setAttribute('aria-pressed', 'false'); }
  });
})();

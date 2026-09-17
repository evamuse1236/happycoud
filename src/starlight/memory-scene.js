import { TAN, project, clamp } from './core.js';
export function memoryDestination(node, width, height, homeZ, readingScale = 1) {
  const wide = width >= 960, desired = 28 * readingScale;
  const distance = Math.max(height * node.font / (2 * TAN * desired), node.w / (2 * TAN * (width / height) * (wide ? .46 : .82)), node.h / (2 * TAN * (wide ? .46 : .36)));
  const z = Math.max(78, node.z + distance), scale = height / (2 * TAN * (z - node.z));
  const x = width * (wide ? .34 : .5), y = height * (wide ? .45 : .34);
  return { x: node.x - (x - width / 2) / scale, y: node.y + (y - height / 2) / scale, z };
}
/** Match the camera's glyph positions exactly; context arrives along a thin filament. */
export class MemoryScene {
  constructor() {
    this.dialog = document.querySelector('#reader'); this.id = null;
    this.lines = document.createElementNS('http://www.w3.org/2000/svg', 'svg'); this.lines.classList.add('memory-filaments'); this.lines.setAttribute('aria-hidden', 'true');
    this.ring = document.createElement('div'); this.ring.className = 'sl-memory-ring'; this.ring.setAttribute('aria-hidden', 'true');
    this.dialog.prepend(this.lines, this.ring);
    this.hint = document.createElement('div'); this.hint.className = 'sl-focus-hint'; this.hint.hidden = true;
    this.hint.innerHTML = '<span aria-hidden="true">✧</span>a voice is here · touch once more'; this.hint.setAttribute('aria-hidden', 'true'); (document.querySelector('#app') || document.body).append(this.hint);
    this.dialog.querySelector('.reader-stage').addEventListener('scroll', () => this.drawConnections(), { passive: true });
    document.querySelector('#reader-context').addEventListener('scroll', () => this.drawConnections(), { passive: true });
    this.observer = new ResizeObserver(() => this.drawConnections()); this.observer.observe(this.dialog);
  }
  focus(node, camera) {
    const p = project(node, camera, innerWidth, innerHeight); if (!p) return;
    this.hint.style.left = clamp(p.x, 100, innerWidth - 100) + 'px'; this.hint.style.top = clamp(p.y + node.h * p.scale / 2 + 23, 85, innerHeight - 150) + 'px'; this.hint.hidden = false;
  }
  clearFocus() { this.hint.hidden = true; }
  place(node, camera, readingScale = 1) {
    this.clearFocus();
    const p = project(node, camera, innerWidth, innerHeight); if (!p) return;
    const quote = document.querySelector('#reader-quote'), main = this.dialog.querySelector('.reader-main');
    const font = node.font * p.scale;
    for (const [key, value] of Object.entries({ '--memory-font': font, '--memory-x': p.x - node.w * p.scale / 2, '--memory-y': p.y - node.h * p.scale / 2 + font * .25, '--memory-width': node.w * p.scale, '--memory-context-top': clamp(p.y - 120, 130, innerHeight - 310), '--memory-mobile-top': Math.max(0, p.y - node.h * p.scale / 2 + font * .25 - 100) })) this.dialog.style.setProperty(key, value + 'px');
    this.dialog.dataset.length = node.lines.length > 10 || font < 18 ? 'long' : 'normal';
    if (this.id !== node.comment.id || !quote.querySelector('.memory-original')) {
      this.id = node.comment.id;
      const original = document.createElement('span'); original.className = 'memory-original sr-only'; original.textContent = node.comment.text;
      const ink = document.createElement('span'); ink.className = 'memory-ink'; ink.setAttribute('aria-hidden', 'true');
      for (const line of node.lines) { const span = document.createElement('span'); span.className = 'memory-line'; span.textContent = line || '\u00a0'; ink.append(span); }
      quote.replaceChildren(original, ink); quote.setAttribute('aria-label', node.comment.text);
    }
    const items = [...this.dialog.querySelectorAll('.context-comment')];
    items.forEach((item, i) => { item.style.setProperty('--memory-order', Math.min(i, 8)); item.classList.toggle('memory-reply', item.tagName === 'ARTICLE'); });
    main.style.setProperty('--reading-scale', readingScale); this.dialog.dataset.context = items.length ? 'recorded' : 'none';
    this.ring.style.left = p.x + 'px'; this.ring.style.top = p.y + 'px';
    // Deliberately do not reset scrollTop here: resizing must not throw readers back to the top.
    requestAnimationFrame(() => this.drawConnections());
  }
  drawConnections() {
    if (!this.dialog.open) return;
    this.lines.replaceChildren(); if (innerWidth < 960) return;
    const items = [...this.dialog.querySelectorAll('#inline-thread .context-comment, #nearby-list .context-comment')].filter(el => { const r = el.getBoundingClientRect(); return r.width && r.top > 90 && r.bottom < innerHeight - 85; }).slice(0, 3);
    if (!items.length) return;
    const q = document.querySelector('#reader-byline').getBoundingClientRect();
    this.lines.setAttribute('viewBox', `0 0 ${innerWidth} ${innerHeight}`);
    const x1 = q.right + 8, y1 = q.top + q.height / 2;
    for (const item of items) {
      const r = item.getBoundingClientRect(), x2 = r.left - 15, y2 = r.top + 7;
      const path = document.createElementNS(this.lines.namespaceURI, 'path'); path.setAttribute('d', `M${x1} ${y1} C${x1 + 50} ${y1},${x2 - 45} ${y2},${x2} ${y2}`); path.setAttribute('pathLength', '1'); this.lines.append(path);
    }
    const dot = document.createElementNS(this.lines.namespaceURI, 'circle'); dot.setAttribute('cx', x1); dot.setAttribute('cy', y1); dot.setAttribute('r', '1.8'); this.lines.append(dot);
  }
}

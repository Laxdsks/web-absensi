/* Small teacher-only launchers. Dragging changes UI position, never sheet data. */
(() => {
  'use strict';
  const icons = {
    guide: '<circle cx="12" cy="12" r="8.5"/><path d="M9.5 9a2.5 2.5 0 0 1 5 .4c0 1.8-2.5 2-2.5 3.6M12 16h.01"/>',
    inspector: '<path d="M5 4v4m0 4v8M12 4v10m0 4v2M19 4v2m0 4v10M2 10h6M9 16h6M16 8h6"/>'
  };
  const viewport = () => {
    const v = window.visualViewport;
    return { x: v?.offsetLeft || 0, y: v?.offsetTop || 0, w: v?.width || innerWidth, h: v?.height || innerHeight };
  };
  const clamp = (n, a, b) => Math.max(a, Math.min(b, n));
  const mounted = new Set();
  function mount(el, { key, label, y = .55 }) {
    if (!el) return null;
    const storage = 'presen-edge-tools-v1:' + key, defaults = { x: 1, y };
    let state = { ...defaults }, pointer = null, suppress = false;
    try {
      const saved = JSON.parse(localStorage.getItem(storage));
      if (Number.isFinite(saved?.x) && Number.isFinite(saved?.y))
        state = { x: clamp(saved.x, 0, 1), y: clamp(saved.y, 0, 1) };
    } catch (_) {}
    el.classList.add('wa-edge-tool');
    el.dataset.edgeTool = key;
    el.type = 'button';
    el.setAttribute('aria-label', label);
    el.title = label + ' · Ketuk untuk membuka, seret untuk memindahkan';
    el.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' + icons[key] + '</svg>' + (key === 'guide' ? '<span class="wa-guide-dot" hidden></span>' : '');
    function position() {
      const v = viewport(), dock = state.x === 0 ? 'left' : state.x === 1 ? 'right' : 'free';
      el.dataset.docked = dock;
      const w = dock === 'free' ? 36 : 24, h = dock === 'free' ? 36 : 48;
      const x = v.x + state.x * Math.max(0, v.w - w), top = v.y + 12 + state.y * Math.max(0, v.h - h - 24);
      el.style.setProperty('left', x + 'px', 'important');
      el.style.setProperty('top', top + 'px', 'important');
    }
    function save() { try { localStorage.setItem(storage, JSON.stringify(state)); } catch (_) {} }
    function move(cx, cy, snap = true) {
      const v = viewport(), side = snap && cx - v.x < 36 ? 0 : snap && v.x + v.w - cx < 36 ? 1 : null;
      const w = side === null ? 36 : 24, h = side === null ? 36 : 48;
      state.x = side ?? clamp((cx - v.x - w / 2) / Math.max(1, v.w - w), .001, .999);
      state.y = clamp((cy - v.y - 12 - h / 2) / Math.max(1, v.h - h - 24), 0, 1);
      position();
    }
    el.addEventListener('pointerdown', e => {
      if (!e.isPrimary || e.button !== 0) return;
      suppress = false;
      const r = el.getBoundingClientRect();
      pointer = { id: e.pointerId, x: e.clientX, y: e.clientY, cx: r.x + r.width / 2, cy: r.y + r.height / 2, state: { ...state }, moved: false };
      el.setPointerCapture(e.pointerId);
    });
    el.addEventListener('pointermove', e => {
      if (!pointer || pointer.id !== e.pointerId) return;
      const dx = e.clientX - pointer.x, dy = e.clientY - pointer.y;
      if (!pointer.moved && Math.hypot(dx, dy) < 6) return;
      pointer.moved = true;
      el.classList.add('is-dragging');
      move(pointer.cx + dx, pointer.cy + dy, false);
    });
    function finish(e, cancel = false) {
      if (!pointer || pointer.id !== e.pointerId) return;
      const p = pointer; pointer = null;
      el.classList.remove('is-dragging');
      if (cancel) { state = p.state; position(); }
      else if (p.moved) {
        move(p.cx + e.clientX - p.x, p.cy + e.clientY - p.y);
        // Keep the two edge handles separately reachable after a drop.
        const r = el.getBoundingClientRect();
        for (const other of mounted) {
          if (other === el || !other.getClientRects().length) continue;
          const b = other.getBoundingClientRect();
          if (r.left < b.right && r.right > b.left && r.top < b.bottom && r.bottom > b.top) {
            const v = viewport(), cy = b.bottom + r.height / 2 + 8;
            move(r.x + r.width / 2, cy + r.height / 2 < v.y + v.h - 12 ? cy : b.top - r.height / 2 - 8);
          }
        }
        suppress = true; save();
      } else {
        // Touch capture can suppress the browser's compatibility click. Activate
        // a tap here once, then ignore its possible delayed native click.
        e.preventDefault();
        el.focus({ preventScroll: true });
        el.click();
        suppress = true;
      }
      if (el.hasPointerCapture(e.pointerId)) el.releasePointerCapture(e.pointerId);
    }
    el.addEventListener('pointerup', e => finish(e));
    el.addEventListener('pointercancel', e => finish(e, true));
    el.addEventListener('lostpointercapture', e => finish(e, true));
    el.addEventListener('click', e => {
      if (!suppress || e.detail === 0) return;
      suppress = false; e.preventDefault(); e.stopImmediatePropagation();
    }, true);
    el.addEventListener('keydown', e => {
      if (!['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Home'].includes(e.key)) return;
      e.preventDefault(); e.stopPropagation();
      if (e.key === 'Home') { state = { ...defaults }; position(); }
      else {
        const r = el.getBoundingClientRect(), step = e.shiftKey ? 32 : 12;
        move(r.x + r.width / 2 + (e.key === 'ArrowLeft' ? -step : e.key === 'ArrowRight' ? step : 0), r.y + r.height / 2 + (e.key === 'ArrowUp' ? -step : e.key === 'ArrowDown' ? step : 0), false);
      }
      save();
    });
    mounted.add(el);
    window.addEventListener('resize', position);
    window.visualViewport?.addEventListener('resize', position);
    window.visualViewport?.addEventListener('scroll', position);
    position();
    return { position };
  }
  window.PresenEdgeTools = { mount };
  mount(document.getElementById('inspectorToggleBtn'), { key: 'inspector', label: 'Buka inspektor tata letak', y: .72 });
})();

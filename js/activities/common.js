import { h, btn, zh } from '../ui.js';
import { sayCard, progressBar } from '../components.js';
import { addXP, srsAdd } from '../state.js';
import { stopSpeaking } from '../speech.js';

/**
 * Go through a list of things to say, one card at a time.
 * items: [{ text, zh, note, srs?: {id,type} }]
 * Resolves { score, xp }.
 */
export function runSayList(root, items, { title, act = 'say', hideText = false, autoplay = true } = {}) {
  return new Promise((resolve) => {
    const scores = new Array(items.length).fill(0);
    const prog = progressBar(items.length);
    const stage = h('div');
    root.replaceChildren(h('div', { class: 'activity' }, title ? h('h2', {}, title) : null, prog.node, stage));
    let i = 0;

    function show() {
      prog.set(i);
      const it = items[i];
      const card = sayCard({
        text: it.text, zh: it.zh, note: it.note, hideText, autoplay,
        onScore: (s, _d, best) => {
          scores[i] = best;
          next.textContent = 'Next ➜';
          next.classList.add('primary');
        },
      });
      const next = btn('Skip ➜', () => {
        stopSpeaking();
        if (it.srs && scores[i] >= 0.5) srsAdd({ ...it.srs, en: it.text, zh: it.zh || '' });
        i++;
        if (i < items.length) show();
        else finish();
      }, 'soft');
      stage.replaceChildren(card.node, h('div', { class: 'row end' }, next));
    }

    function finish() {
      const score = scores.reduce((a, b) => a + b, 0) / items.length;
      const xp = addXP(items.length * 2 + score * items.length * 3, act);
      resolve({ score, xp });
    }
    show();
  });
}

export function menuGrid(items) {
  return h('div', { class: 'grid' }, items.map((it) => h('button', {
    class: 'tile' + (it.done ? ' done' : '') + (it.dim ? ' dim' : ''),
    type: 'button',
    onclick: it.onClick,
  },
  h('div', { class: 'tile-icon' }, it.icon),
  h('div', { class: 'tile-title' }, it.title),
  it.zh ? zh(it.zh, 'tile-zh') : null,
  it.badge ? h('div', { class: 'badge' }, it.badge) : null)));
}

export function levelBadge(n) {
  return h('span', { class: `lv lv${n}` }, `L${n}`);
}

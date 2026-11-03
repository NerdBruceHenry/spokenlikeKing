// Shadowing: listen, then repeat with the same rhythm and melody.
import { h, zh, sample } from '../ui.js';
import { finishScreen } from '../components.js';
import { state, markDone } from '../state.js';
import { SHADOW_PACKS } from '../data/practice.js';
import { runSayList, menuGrid } from './common.js';

export function packItems(pack, n) {
  const items = n ? sample(pack.items, n) : pack.items;
  return items.map(([text, z, note]) => ({
    text, zh: z, note: note ? '💡 ' + note : '',
    srs: { id: 's:' + text.toLowerCase().replace(/[^a-z]+/g, '-'), type: 'sentence' },
  }));
}

export function page(root, nav, params = {}) {
  if (params.id) {
    const pack = SHADOW_PACKS.find((p) => p.id === params.id);
    nav.title(pack.title);
    runSayList(root, packItems(pack), { title: `${pack.icon} ${pack.title}`, act: 'shadow' }).then((r) => {
      markDone('shadow:' + pack.id, r.score);
      finishScreen(root, { score: r.score, xp: r.xp, onDone: () => nav.go('shadow') });
    });
    return;
  }
  nav.title('Shadowing 影子跟读');
  const lvl = state.settings.level;
  root.replaceChildren(
    h('div', { class: 'tip-card' },
      h('div', { class: 'tip-title' }, '🦜 How to shadow 怎么跟读'),
      h('p', {}, zh('影子跟读是语言专家公认最有效的口语练习：① 先听 2 遍；② 跟着原声同时小声说；③ 自己说，模仿语调、节奏和连读，像鹦鹉一样！④ 用"Me vs Native"对比自己和原声。'))),
    menuGrid(SHADOW_PACKS.map((p) => ({
      icon: p.icon, title: p.title, zh: p.zh,
      badge: state.done['shadow:' + p.id] ? '✓' : `L${p.level}`,
      done: !!state.done['shadow:' + p.id],
      dim: p.level > lvl + 1,
      onClick: () => nav.go('shadow', { id: p.id }),
    }))));
}

// Tongue twisters: silly, fast, and great for agility of the mouth.
import { h, btn, zh, sample } from '../ui.js';
import { speak } from '../speech.js';
import { sayCard, finishScreen } from '../components.js';
import { state, addXP } from '../state.js';
import { TWISTERS } from '../data/practice.js';
import { runSayList, levelBadge } from './common.js';

export function page(root, nav) {
  nav.title('Tongue Twisters 绕口令');
  const lvl = state.settings.level;
  const list = TWISTERS.filter((t) => t.level <= lvl + 2);
  root.replaceChildren(
    h('p', { class: 'intro' }, zh('先慢慢说准，再越说越快！挑战："Turbo" 模式听 1.3 倍速，你能跟上吗？')),
    btn('🎲 Random challenge (3 twisters) 随机挑战', async () => {
      const r = await runSayList(root, sample(list.filter((t) => t.level <= lvl + 1), 3).map((t) => ({ text: t.text, zh: t.zh })), { title: '👅 Twister Challenge', act: 'twister' });
      finishScreen(root, { score: r.score, xp: r.xp, onDone: () => nav.go('twisters', {}, true) });
    }, 'primary big wide'),
    h('div', { class: 'list' }, list.map((t) => {
      const holder = h('div');
      const row = h('div', { class: 'phrase' },
        h('div', { class: 'phrase-main' }, h('b', {}, t.text), ' ', levelBadge(t.level), h('div', {}, zh(t.zh))),
        h('div', { class: 'col' },
          btn('🔊', () => speak(t.text), 'chip'),
          btn('⚡', () => speak(t.text, { rate: 1.35 }), 'chip'),
          btn('🎤', () => {
            if (holder.firstChild) return holder.replaceChildren();
            const card = sayCard({ text: t.text, zh: t.zh, onScore: (s) => s >= 0.9 && addXP(3, 'twister') });
            holder.replaceChildren(card.node);
          }, 'chip')));
      return h('div', {}, row, holder);
    })));
}

// Real Talk: authentic everyday expressions, learned with examples and then
// added to the spaced-repetition review deck.
import { h, btn, zh, shuffle, sample } from '../ui.js';
import { speak } from '../speech.js';
import { sayCard, progressBar, choice, finishScreen } from '../components.js';
import { state, addXP, srsAdd } from '../state.js';
import { PHRASES, CATEGORIES } from '../data/phrases.js';
import { levelBadge } from './common.js';

export function newPhrases(n) {
  const lvl = state.settings.level;
  const fresh = PHRASES.filter((p) => !state.srs[p.id] && p.level <= lvl);
  const pool = fresh.length >= n ? fresh : PHRASES.filter((p) => !state.srs[p.id] && p.level <= lvl + 1);
  // prefer lower levels first, a little shuffled
  return shuffle(pool).sort((a, b) => a.level - b.level).slice(0, n).sort(() => Math.random() - 0.5);
}

/** Learn a few phrases: hear it, see it used, say it; then a quick quiz. */
export function runLearn(root, phrases) {
  return new Promise((resolve) => {
    const scores = [];
    let i = 0;
    const prog = progressBar(phrases.length + 1);
    const stage = h('div');
    root.replaceChildren(h('div', { class: 'activity' }, h('h2', {}, '💬 Real Talk'), prog.node, stage));

    function show() {
      prog.set(i);
      const p = phrases[i];
      const cat = CATEGORIES[p.cat];
      let best = 0;
      const card = sayCard({
        text: p.en, zh: p.zh, autoplay: true,
        onScore: (_s, _d, b) => {
          best = b;
          next.classList.add('primary');
          next.textContent = 'Next ➜';
        },
      });
      const example = h('div', { class: 'example' },
        h('span', { class: 'muted small' }, 'Example 例句：'),
        h('div', {}, p.ex, ' ', btn('🔊', () => speak(p.ex), 'chip')));
      const next = btn('Skip ➜', () => {
        scores.push(best);
        srsAdd({ id: p.id, type: 'phrase', en: p.en, zh: p.zh, ex: p.ex });
        i++;
        i < phrases.length ? show() : quiz();
      }, 'soft');
      stage.replaceChildren(
        h('div', { class: 'row' }, h('span', { class: 'cat' }, cat.icon, ' ', cat.en), levelBadge(p.level)),
        card.node, example,
        h('div', { class: 'row end' }, next));
    }

    function quiz() {
      prog.set(phrases.length);
      const target = phrases[Math.floor(Math.random() * phrases.length)];
      const distract = sample(PHRASES.filter((p) => p.id !== target.id && !phrases.includes(p)), 2);
      const opts = shuffle([target, ...distract]);
      stage.replaceChildren(
        h('h3', {}, 'Quick check! Which one means:'),
        h('div', { class: 'say-text' }, target.zh));
      choice(stage, opts.map((o) => o.en), opts.indexOf(target)).then((ok) => {
        const score = (scores.reduce((a, b) => a + b, 0) / scores.length) * 0.8 + (ok ? 0.2 : 0);
        stage.appendChild(h('div', { class: 'row end' }, btn('Done ➜', () => {
          resolve({ score, xp: addXP(phrases.length * 4 + (ok ? 3 : 0), 'phrase') });
        }, 'primary')));
      });
    }
    show();
  });
}

export function page(root, nav) {
  nav.title('Real Talk 地道表达');
  let cat = 'all';
  let lvl = 'mine';
  const list = h('div', { class: 'phrase-list' });
  const catRow = h('div', { class: 'row wrap chips' });
  const lvlRow = h('div', { class: 'row wrap chips' });

  function renderChips() {
    catRow.replaceChildren(
      btn('All', () => { cat = 'all'; render(); }, 'chip' + (cat === 'all' ? ' on' : '')),
      Object.entries(CATEGORIES).map(([k, c]) => btn(`${c.icon} ${c.en}`, () => { cat = k; render(); }, 'chip' + (cat === k ? ' on' : ''))));
    lvlRow.replaceChildren(
      btn('My level', () => { lvl = 'mine'; render(); }, 'chip' + (lvl === 'mine' ? ' on' : '')),
      btn('All levels', () => { lvl = 'all'; render(); }, 'chip' + (lvl === 'all' ? ' on' : '')));
  }

  function render() {
    renderChips();
    const items = PHRASES.filter((p) => (cat === 'all' || p.cat === cat) && (lvl === 'all' || p.level <= state.settings.level + 1));
    list.replaceChildren(...items.map((p) => h('div', { class: 'phrase' + (state.srs[p.id] ? ' learned' : '') },
      h('div', { class: 'phrase-main' },
        h('b', {}, p.en), ' ', levelBadge(p.level),
        h('div', {}, zh(p.zh)),
        h('div', { class: 'muted small' }, p.ex)),
      h('div', { class: 'col' },
        btn('🔊', () => speak(p.en), 'chip'),
        btn('🎤', () => learnOne(p), 'chip')))));
  }

  async function learnOne(p) {
    const stage = h('div');
    root.replaceChildren(stage);
    const r = await runLearn(stage, [p]);
    finishScreen(root, { score: r.score, xp: r.xp, onDone: () => nav.go('phrases', {}, true) });
  }

  const start = btn('🚀 Learn 5 new phrases 学 5 个新表达', async () => {
    const stage = h('div');
    root.replaceChildren(stage);
    const r = await runLearn(stage, newPhrases(5));
    finishScreen(root, { score: r.score, xp: r.xp, onDone: () => nav.go('phrases', {}, true) });
  }, 'primary big wide');

  const learned = PHRASES.filter((p) => state.srs[p.id]).length;
  root.replaceChildren(
    h('p', { class: 'intro' }, zh(`美国孩子每天真正在说的话。已学会 ${learned} / ${PHRASES.length} 个。学过的会自动进入"复习"，按记忆曲线安排复习。`)),
    start, catRow, lvlRow, list);
  render();
}

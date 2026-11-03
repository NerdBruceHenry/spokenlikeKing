// Spaced-repetition review: see the Chinese, say the English from memory.
import { h, btn, zh } from '../ui.js';
import { sayCard, progressBar, finishScreen } from '../components.js';
import { srsDue, srsGrade, srsStats, addXP } from '../state.js';
import { speak, stopSpeaking } from '../speech.js';

export function runReview(root, cards) {
  return new Promise((resolve) => {
    let i = 0;
    const scores = [];
    const prog = progressBar(cards.length);
    const stage = h('div');
    root.replaceChildren(h('div', { class: 'activity' }, h('h2', {}, '🔁 Review 复习'),
      zh('看中文，先自己试着用英文说出来；想不起来就点模糊的英文或 🔊 提示。'), prog.node, stage));

    function show() {
      prog.set(i);
      const c = cards[i];
      let best = 0;
      let peeked = false;
      const card = sayCard({
        text: c.en, zh: c.zh, hideText: true, autoplay: false,
        onScore: (_s, _d, b) => {
          best = b;
          next.classList.add('primary');
          next.textContent = 'Next ➜';
        },
      });
      // listening first = a hint, so it can't count as a perfect recall
      card.node.querySelectorAll('.btn.soft').forEach((b) => b.addEventListener('click', () => (peeked = true)));
      card.node.querySelector('.say-text').addEventListener('click', () => (peeked = true));
      const next = btn('Skip ➜', () => {
        stopSpeaking();
        const ok = best >= 0.65 && !(peeked && best < 0.9);
        srsGrade(c.id, ok);
        scores.push(best);
        i++;
        i < cards.length ? show() : resolve({
          score: scores.reduce((a, b) => a + b, 0) / scores.length,
          xp: addXP(cards.length * 3, 'review'),
        });
      }, 'soft');
      stage.replaceChildren(
        c.ex ? h('div', { class: 'muted small' }, 'Hint 例句: ', c.ex.replace(c.en.replace(/[.!?…]+$/, ''), '____'), ' ', btn('🔊', () => speak(c.ex), 'chip tiny')) : null,
        card.node,
        h('div', { class: 'row end' }, next));
    }
    show();
  });
}

export function page(root, nav) {
  nav.title('Review 复习');
  const st = srsStats();
  const due = srsDue(15);
  root.replaceChildren(
    h('div', { class: 'stat-row' },
      h('div', { class: 'stat' }, h('div', { class: 'stat-n' }, String(st.total)), h('div', { class: 'small' }, 'cards'), zh('已学', 'small')),
      h('div', { class: 'stat' }, h('div', { class: 'stat-n' }, String(st.mastered)), h('div', { class: 'small' }, 'mastered'), zh('已掌握', 'small')),
      h('div', { class: 'stat' }, h('div', { class: 'stat-n' }, String(st.due)), h('div', { class: 'small' }, 'due today'), zh('今天要复习', 'small'))),
    h('p', { class: 'intro' }, zh('复习按"艾宾浩斯记忆曲线"自动安排：答对的间隔越来越长（1→2→4→7→15→30 天），答错的明天再来。')),
    due.length
      ? btn(`▶ Review ${due.length} cards 开始复习`, async () => {
        const r = await runReview(root, due);
        finishScreen(root, { score: r.score, xp: r.xp, onDone: () => nav.go('review', {}, true) });
      }, 'primary big wide')
      : h('div', { class: 'empty' }, '🎉 All caught up! 今天的复习都完成了。去学点新表达吧！'));
}

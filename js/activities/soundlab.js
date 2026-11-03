// Sound Lab: ear training with minimal pairs + speaking the tricky sounds.
import { h, btn, zh, shuffle, sample, pick, sfx } from '../ui.js';
import { speak, recognize, hasASR } from '../speech.js';
import { pairCheck } from '../score.js';
import { progressBar, choice, finishScreen, playButtons } from '../components.js';
import { state, addXP, markDone } from '../state.js';
import { SOUNDS } from '../data/sounds.js';
import { runSayList, menuGrid } from './common.js';

export function page(root, nav, params = {}) {
  if (params.id) return unitPage(root, nav, SOUNDS.find((s) => s.id === params.id));
  nav.title('Sound Lab 发音实验室');
  const lvl = state.settings.level;
  root.replaceChildren(
    h('p', { class: 'intro' }, zh('中国孩子最容易发不准的美式发音，一个一个攻克！先用耳朵分辨，再用嘴巴模仿。')),
    menuGrid(SOUNDS.map((s) => ({
      icon: s.icon, title: s.title, zh: s.zhTitle,
      badge: state.done['sound:' + s.id] ? '★'.repeat(Math.max(1, Math.round(state.done['sound:' + s.id] * 3))) : `L${s.level}`,
      dim: s.level > lvl + 1,
      onClick: () => nav.go('sounds', { id: s.id }),
    }))));
}

function unitPage(root, nav, unit) {
  nav.title(unit.title);
  const parts = [];
  if (unit.pairs.length) parts.push(['👂 Ear training', '耳朵训练：听音选词', () => runEar(stage, unit, 8)]);
  if (unit.pairs.length && !unit.pairs[0][0].includes(' ')) parts.push(['🎯 Say the pair', '说准对比词', () => runPairSpeak(stage, unit, 6)]);
  if (unit.listen) parts.push(['👂 Which do you hear?', '听辨', () => runListenChoice(stage, unit.listen)]);
  if (unit.reductions) parts.push(['🧩 Decode it', '缩读还原', () => runReduceQuiz(stage, unit.reductions, 8)]);
  if (unit.stress) parts.push(['🥁 Find the stress', '找重音', () => runStress(stage, unit.stress)]);
  parts.push(['🗣️ Words', '跟读单词', () => runSayList(stage, unit.words.map((w) => ({ text: w }))), 'sound']);
  parts.push(['💬 Sentences', '跟读句子', () => runSayList(stage, unit.sentences.map((w) => ({ text: w }))), 'sound']);

  const stage = h('div');
  const menu = h('div', { class: 'list' }, parts.map(([t, z, fn]) => btn([t, ' ', zh(z)], async () => {
    menu.hidden = true;
    const r = await fn();
    markDone('sound:' + unit.id, r.score);
    finishScreen(stage, { score: r.score, xp: r.xp, onDone: () => nav.go('sounds', { id: unit.id }, true) });
  }, 'wide')));

  root.replaceChildren(
    h('div', { class: 'tip-card' },
      h('div', { class: 'tip-title' }, unit.icon, ' ', unit.zhTitle),
      h('p', {}, unit.tip),
      h('div', { class: 'row wrap' }, unit.words.slice(0, 5).map((w) => btn('🔊 ' + w, () => speak(w), 'chip')))),
    menu,
    stage);
}

/** Minimal-pair ear training. */
export function runEar(root, unit, count = 8) {
  return new Promise((resolve) => {
    const rounds = Array.from({ length: count }, () => {
      const pair = pick(unit.pairs);
      const ti = Math.random() < 0.5 ? 0 : 1;
      return { pair, ti };
    });
    let i = 0;
    let right = 0;
    const prog = progressBar(count);
    const stage = h('div');
    root.replaceChildren(h('div', { class: 'activity' }, h('h2', {}, '👂 Which word do you hear?'), zh('听一听，选出你听到的词'), prog.node, stage));

    function show() {
      prog.set(i);
      const { pair, ti } = rounds[i];
      const target = pair[ti];
      const replay = btn('🔊 Play again', () => speak(target), 'soft big');
      const slow = btn('🐢', () => speak(target, { rate: 0.6 }), 'soft');
      const after = h('div');
      stage.replaceChildren(h('div', { class: 'row center' }, replay, slow), after);
      setTimeout(() => speak(target), 300);
      const opts = Math.random() < 0.5 ? [0, 1] : [1, 0];
      choice(stage, opts.map((k) => pair[k]), opts.indexOf(ti)).then((ok) => {
        if (ok) right++;
        after.replaceChildren(h('div', { class: 'row center wrap' },
          btn('🔊 ' + pair[0], () => speak(pair[0]), 'chip'),
          btn('🔊 ' + pair[1], () => speak(pair[1]), 'chip')));
        stage.appendChild(h('div', { class: 'row end' }, btn('Next ➜', () => {
          i++;
          if (i < count) show();
          else resolve({ score: right / count, xp: addXP(count + right * 2, 'sound') });
        }, 'primary')));
      });
    }
    show();
  });
}

/** Say one word of the pair; we check you didn't say the other one. */
export function runPairSpeak(root, unit, count = 6) {
  return new Promise((resolve) => {
    const pairs = sample(unit.pairs, Math.min(count, unit.pairs.length));
    let i = 0;
    const scores = [];
    const prog = progressBar(pairs.length);
    const stage = h('div');
    root.replaceChildren(h('div', { class: 'activity' }, h('h2', {}, '🎯 Say it right!'), zh(unit.tip), prog.node, stage));

    function show() {
      prog.set(i);
      const pair = pairs[i];
      const ti = Math.random() < 0.5 ? 0 : 1;
      const target = pair[ti];
      const other = pair[1 - ti];
      let best = 0;
      const res = h('div', { class: 'say-result' });
      const mic = btn('🎤 Say it', async () => {
        if (!hasASR) {
          res.replaceChildren(h('p', {}, 'Say it out loud, then compare: 大声说出来，再听原声对比'),
            h('div', { class: 'row' }, btn('😀 Got it', () => grade(1)), btn('😅 Not yet', () => grade(0.3))));
          return;
        }
        mic.disabled = true;
        mic.textContent = '👂 Listening…';
        mic.classList.add('listening');
        const { alts } = await recognize();
        mic.disabled = false;
        mic.classList.remove('listening');
        mic.textContent = '🎤 Again';
        const r = pairCheck(target, other, alts);
        if (r === 'ok') {
          res.replaceChildren(h('div', { class: 'praise' }, '✅ Yes! I heard "', target, '"'));
          grade(1);
        } else if (r === 'other') {
          res.replaceChildren(h('div', { class: 'praise' }, '🤔 Hmm, that sounded like "', other, '". Try again!'));
          grade(0.2);
        } else {
          res.replaceChildren(h('div', { class: 'praise' }, '🙉 I heard "', alts[0] || '…', '". One more time!'));
          grade(0.4);
        }
      }, 'primary big');
      function grade(s) {
        best = Math.max(best, s);
        s >= 0.65 ? sfx.ok() : sfx.bad();
        next.textContent = 'Next ➜';
        next.classList.add('primary');
      }
      const next = btn('Skip ➜', () => {
        scores.push(best);
        i++;
        if (i < pairs.length) show();
        else {
          const score = scores.reduce((a, b) => a + b, 0) / scores.length;
          resolve({ score, xp: addXP(pairs.length * 2 + score * pairs.length * 3, 'sound') });
        }
      }, 'soft');
      stage.replaceChildren(
        h('div', { class: 'say-card' },
          h('div', { class: 'muted' }, 'Say this word:'),
          h('div', { class: 'say-text huge' }, target),
          h('div', { class: 'muted small' }, 'not "', other, '"'),
          playButtons(target),
          h('div', { class: 'row center' }, mic),
          res),
        h('div', { class: 'row end' }, next));
    }
    show();
  });
}

export function runListenChoice(root, items) {
  return new Promise((resolve) => {
    let i = 0;
    let right = 0;
    const prog = progressBar(items.length);
    const stage = h('div');
    root.replaceChildren(h('div', { class: 'activity' }, prog.node, stage));
    function show() {
      prog.set(i);
      const it = items[i];
      stage.replaceChildren(h('h3', {}, it.q), h('div', { class: 'row center' }, btn('🔊 Play', () => speak(it.say), 'soft big')));
      setTimeout(() => speak(it.say), 300);
      const order = shuffle(it.options);
      choice(stage, order, order.indexOf(it.say)).then((ok) => {
        if (ok) right++;
        stage.appendChild(h('div', { class: 'row end' }, btn('Next ➜', () => {
          i++;
          i < items.length ? show() : resolve({ score: right / items.length, xp: addXP(items.length * 3, 'sound') });
        }, 'primary')));
      });
    }
    show();
  });
}

export function runReduceQuiz(root, reductions, count = 8) {
  const items = sample(reductions, count);
  return new Promise((resolve) => {
    let i = 0;
    let right = 0;
    const prog = progressBar(items.length);
    const stage = h('div');
    root.replaceChildren(h('div', { class: 'activity' }, h('h2', {}, '🧩 What does it really mean?'), zh('听缩读，选出完整说法'), prog.node, stage));
    function show() {
      prog.set(i);
      const [red, full] = items[i];
      const wrong = sample(reductions.filter((r) => r[1] !== full), 2).map((r) => r[1]);
      const opts = shuffle([full, ...wrong]);
      stage.replaceChildren(h('div', { class: 'say-text huge' }, red), h('div', { class: 'row center' }, btn('🔊', () => speak(red), 'soft big')));
      setTimeout(() => speak(red), 300);
      choice(stage, opts, opts.indexOf(full)).then((ok) => {
        if (ok) right++;
        stage.appendChild(h('div', { class: 'row end' }, btn('Next ➜', () => {
          i++;
          i < items.length ? show() : resolve({ score: right / items.length, xp: addXP(items.length * 2 + right, 'sound') });
        }, 'primary')));
      });
    }
    show();
  });
}

export function runStress(root, items) {
  return new Promise((resolve) => {
    const list = shuffle(items);
    let i = 0;
    let right = 0;
    const prog = progressBar(list.length);
    const stage = h('div');
    root.replaceChildren(h('div', { class: 'activity' }, h('h2', {}, '🥁 Which part is LOUD?'), zh('听单词，点出重读的音节'), prog.node, stage));
    function show() {
      prog.set(i);
      const it = list[i];
      stage.replaceChildren(h('div', { class: 'row center' }, btn('🔊 ' + it.word, () => speak(it.word, { rate: 0.8 }), 'soft big')));
      setTimeout(() => speak(it.word, { rate: 0.8 }), 300);
      choice(stage, it.parts.map((p) => p.toLowerCase()), it.answer).then((ok) => {
        if (ok) right++;
        stage.appendChild(h('p', { class: 'center' }, it.parts.join('·')));
        stage.appendChild(h('div', { class: 'row end' }, btn('Next ➜', () => {
          i++;
          i < list.length ? show() : resolve({ score: right / list.length, xp: addXP(list.length * 2 + right, 'sound') });
        }, 'primary')));
      });
    }
    show();
  });
}

/** Used by the daily quest: a short mixed drill for one sound unit. */
export async function runDaily(root, unit) {
  if (unit.pairs.length) {
    const a = await runEar(root, unit, 6);
    const b = await runSayList(root, sample(unit.words, 3).concat(sample(unit.sentences, 1)).map((t) => ({ text: t })), { title: unit.title, act: 'sound' });
    return { score: (a.score + b.score) / 2, xp: a.xp + b.xp };
  }
  if (unit.reductions) {
    const a = await runReduceQuiz(root, unit.reductions, 5);
    const b = await runSayList(root, sample(unit.sentences, 3).map((t) => ({ text: t })), { title: unit.title, act: 'sound' });
    return { score: (a.score + b.score) / 2, xp: a.xp + b.xp };
  }
  if (unit.stress) {
    const a = await runStress(root, sample(unit.stress, 5));
    const b = await runSayList(root, sample(unit.sentences, 2).map((t) => ({ text: t })), { title: unit.title, act: 'sound' });
    return { score: (a.score + b.score) / 2, xp: a.xp + b.xp };
  }
  return runSayList(root, sample(unit.words, 3).concat(sample(unit.sentences, 2)).map((t) => ({ text: t })), { title: unit.title, act: 'sound' });
}

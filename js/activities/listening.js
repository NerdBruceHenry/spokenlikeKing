// Listening gym: stories, dictation, numbers, real-speed speech, can/can't.
import { h, btn, zh, shuffle, sample, pick, sfx } from '../ui.js';
import { speak, speakLines, stopSpeaking } from '../speech.js';
import { compare } from '../score.js';
import { colorize, progressBar, choice, finishScreen } from '../components.js';
import { state, addXP, markDone } from '../state.js';
import { STORIES } from '../data/stories.js';
import { SHADOW_PACKS } from '../data/practice.js';
import { PHRASES } from '../data/phrases.js';
import { SOUNDS } from '../data/sounds.js';
import { menuGrid } from './common.js';

export function page(root, nav, params = {}) {
  const lvl = state.settings.level;
  const done = (r) => finishScreen(root, { score: r.score, xp: r.xp, onDone: () => nav.go('listen') });
  if (params.story) {
    const s = STORIES.find((x) => x.id === params.story);
    nav.title(s.title);
    return runStory(root, s).then((r) => { markDone('story:' + s.id, r.score); done(r); });
  }
  if (params.game) {
    const games = { dictation: () => runDictation(root, dictationItems(6)), numbers: () => runNumbers(root, 8), reduce: () => runRealSpeed(root, 8), cancant: () => runCanCant(root, 8) };
    nav.title('Listening');
    return games[params.game]().then(done);
  }
  if (params.list === 'stories') {
    nav.title('Stories 听故事');
    root.replaceChildren(menuGrid(STORIES.map((s) => ({
      icon: s.icon, title: s.title, zh: s.zh,
      badge: state.done['story:' + s.id] ? '✓' : `L${s.level}`,
      done: !!state.done['story:' + s.id], dim: s.level > lvl + 1,
      onClick: () => nav.go('listen', { story: s.id }),
    }))));
    return;
  }
  nav.title('Listening 听力训练');
  root.replaceChildren(
    h('p', { class: 'intro' }, zh('听力是口语的地基：听得懂真实语速，才能说出地道英语。')),
    menuGrid([
      { icon: '📖', title: 'Stories', zh: '听故事答题', onClick: () => nav.go('listen', { list: 'stories' }) },
      { icon: '✍️', title: 'Dictation', zh: '听写句子', onClick: () => nav.go('listen', { game: 'dictation' }) },
      { icon: '🔢', title: 'Number Ninja', zh: '数字听辨 13 vs 30', onClick: () => nav.go('listen', { game: 'numbers' }) },
      { icon: '🏃', title: 'Real Speed', zh: '听懂缩读连读', onClick: () => nav.go('listen', { game: 'reduce' }) },
      { icon: '⚖️', title: 'Can or Can\'t?', zh: 'can 还是 can\'t', onClick: () => nav.go('listen', { game: 'cancant' }) },
    ]));
}

// ---------------- Stories ----------------
export function runStory(root, story) {
  return new Promise((resolve) => {
    const lines = story.text.map((t) => h('p', { class: 'story-line' }, t));
    const textBox = h('div', { class: 'story-text hidden-text' }, lines);
    lines.forEach((p, i) => p.addEventListener('click', () => speak(story.text[i])));
    let plays = 0;
    const playBtn = btn('▶ Listen to the story', play, 'primary big');
    const slowBtn = btn('🐢 Slow', () => play(0.75), 'soft');
    const stopBtn = btn('⏹', () => stopSpeaking(), 'soft');
    const toggle = btn('👀 Show text', () => {
      textBox.classList.toggle('hidden-text');
      toggle.textContent = textBox.classList.contains('hidden-text') ? '👀 Show text' : '🙈 Hide text';
    }, 'soft');
    const goQuiz = btn('Answer questions ➜', quiz, 'soft');

    async function play(rate) {
      plays++;
      if (plays >= 1) goQuiz.classList.add('primary');
      await speakLines(story.text, {
        rate: typeof rate === 'number' ? rate : 1,
        gap: 350,
        onLine: (i) => lines.forEach((p, k) => p.classList.toggle('reading', k === i)),
      });
    }

    root.replaceChildren(h('div', { class: 'activity' },
      h('div', { class: 'scene-head' }, h('span', { class: 'scene-icon' }, story.icon), h('div', {}, h('b', {}, story.title), h('div', {}, zh(story.zh)))),
      h('p', { class: 'muted small' }, zh('先只用耳朵听（不看文字），听两遍再答题。实在听不懂再点"Show text"。点任意一句可以单独重听。')),
      h('div', { class: 'row center wrap' }, playBtn, slowBtn, stopBtn, toggle),
      textBox,
      h('div', { class: 'row end' }, goQuiz)));

    function quiz() {
      stopSpeaking();
      let i = 0;
      let right = 0;
      const prog = progressBar(story.questions.length);
      const stage = h('div');
      root.replaceChildren(h('div', { class: 'activity' }, h('h2', {}, '🤔 Questions'), prog.node, stage,
        h('details', { class: 'story-peek' }, h('summary', {}, '📜 Story text'), story.text.map((t) => h('p', {}, t, ' ', btn('🔊', () => speak(t), 'chip tiny'))))));
      function show() {
        prog.set(i);
        const q = story.questions[i];
        stage.replaceChildren(h('h3', {}, q.q, ' ', btn('🔊', () => speak(q.q), 'chip tiny')));
        speak(q.q);
        choice(stage, q.options, q.a).then((ok) => {
          if (ok) right++;
          stage.appendChild(h('div', { class: 'row end' }, btn('Next ➜', () => {
            i++;
            if (i < story.questions.length) show();
            else resolve({ score: right / story.questions.length, xp: addXP(5 + right * 3, 'listen') });
          }, 'primary')));
        });
      }
      show();
    }
  });
}

export function storiesForLevel() {
  const lvl = state.settings.level;
  const fit = STORIES.filter((s) => s.level <= lvl && s.level >= lvl - 1);
  const unseen = fit.filter((s) => !state.done['story:' + s.id]);
  return unseen.length ? unseen : fit.length ? fit : STORIES.filter((s) => s.level <= lvl + 1);
}

// ---------------- Dictation ----------------
export function dictationItems(n) {
  const lvl = state.settings.level;
  const pool = [
    ...SHADOW_PACKS.filter((p) => p.level <= lvl + 1).flatMap((p) => p.items.map((it) => it[0])),
    ...PHRASES.filter((p) => p.level <= lvl + 1).map((p) => p.ex.replace(/^"|"$/g, '')).filter((t) => t.length < 70 && !t.includes('"')),
  ];
  return sample(pool, n);
}

export function runDictation(root, items) {
  return new Promise((resolve) => {
    let i = 0;
    const scores = [];
    const prog = progressBar(items.length);
    const stage = h('div');
    root.replaceChildren(h('div', { class: 'activity' }, h('h2', {}, '✍️ Dictation 听写'), zh('听句子，把你听到的打出来（拼写不完美也没关系）'), prog.node, stage));
    function show() {
      prog.set(i);
      const target = items[i];
      const input = h('textarea', { class: 'dict-input', rows: 2, placeholder: 'Type what you hear…', autocapitalize: 'off', spellcheck: 'false' });
      const res = h('div');
      const check = btn('✓ Check', () => {
        const r = compare(target, input.value);
        scores.push(r.score);
        r.score >= 0.8 ? sfx.ok() : sfx.bad();
        check.disabled = true;
        res.replaceChildren(
          h('div', { class: 'heard' }, colorize(target, r.words)),
          h('div', { class: 'praise' }, `${Math.round(r.score * 100)}% `, r.score >= 0.9 ? '🎉' : r.score >= 0.6 ? '👍' : '💪'),
          h('div', { class: 'row end' }, btn('Next ➜', () => {
            i++;
            if (i < items.length) show();
            else {
              const score = scores.reduce((a, b) => a + b, 0) / scores.length;
              resolve({ score, xp: addXP(items.length * 2 + score * items.length * 3, 'listen') });
            }
          }, 'primary')));
      }, 'primary');
      stage.replaceChildren(
        h('div', { class: 'row center' }, btn('🔊 Play', () => speak(target), 'soft big'), btn('🐢 Slow', () => speak(target, { rate: 0.6 }), 'soft')),
        input, h('div', { class: 'row end' }, check), res);
      setTimeout(() => { speak(target); input.focus(); }, 300);
    }
    show();
  });
}

// ---------------- Numbers ----------------
function numberRound() {
  const kind = pick(['teen', 'teen', 'time', 'price', 'year']);
  if (kind === 'teen') {
    const d = 3 + Math.floor(Math.random() * 7); // 3..9
    const teen = 10 + d;
    const ty = d * 10;
    const ans = Math.random() < 0.5 ? teen : ty;
    const nouns = ['stickers', 'kids in my class', 'dollars', 'minutes', 'pages', 'points'];
    const noun = pick(nouns);
    return { say: `I have ${ans} ${noun}.`, options: shuffle([String(teen), String(ty)]), answer: String(ans), q: 'How many?' };
  }
  if (kind === 'time') {
    const hr = 1 + Math.floor(Math.random() * 12);
    const mins = pick([['15', '50', '05'], ['30', '13', '03'], ['45', '40', '54'], ['20', '12', '02']]);
    const m = mins[0];
    const opts = mins.map((x) => `${hr}:${x}`);
    const ans = pick(opts);
    return { say: `Let's meet at ${ans.replace(':0', ' oh ')}.`, options: shuffle(opts), answer: ans, q: 'What time?', m };
  }
  if (kind === 'price') {
    const dollars = pick([3, 4, 6, 7, 8, 9]);
    const c = pick([['99', '19', '90'], ['50', '15', '05'], ['75', '57', '70']]);
    const opts = c.map((x) => `$${dollars}.${x}`);
    const ans = pick(opts);
    const [dl, ct] = ans.slice(1).split('.');
    return { say: `It costs ${dl} ${ct === '05' ? 'oh five' : ct}.`, options: shuffle(opts), answer: ans, q: 'How much?' };
  }
  const y = pick([[2013, 2030, 2003], [2016, 2060, 2006], [1990, 1919, 1999], [2018, 2080, 2008]]);
  const ans = pick(y);
  const spoken = ans >= 2010 ? `twenty ${ans % 100}` : ans >= 2000 ? `two thousand ${ans % 100}` : `nineteen ${ans % 100}`;
  return { say: `It happened in ${spoken}.`, options: shuffle(y.map(String)), answer: String(ans), q: 'Which year?' };
}

export function runNumbers(root, count = 8) {
  return new Promise((resolve) => {
    let i = 0;
    let right = 0;
    const prog = progressBar(count);
    const stage = h('div');
    root.replaceChildren(h('div', { class: 'activity' }, h('h2', {}, '🔢 Number Ninja'),
      zh('美国人说 thirTEEN 时重音在后、t 清楚；THIRty 重音在前、t 读成轻 d。仔细听！'), prog.node, stage));
    function show() {
      prog.set(i);
      const r = numberRound();
      stage.replaceChildren(h('h3', {}, r.q), h('div', { class: 'row center' }, btn('🔊 Play', () => speak(r.say), 'soft big'), btn('🐢', () => speak(r.say, { rate: 0.65 }), 'soft')));
      setTimeout(() => speak(r.say), 300);
      choice(stage, r.options, r.options.indexOf(r.answer)).then((ok) => {
        if (ok) right++;
        stage.appendChild(h('div', { class: 'row end' }, btn('Next ➜', () => {
          i++;
          i < count ? show() : resolve({ score: right / count, xp: addXP(count + right * 2, 'listen') });
        }, 'primary')));
      });
    }
    show();
  });
}

// ---------------- Real speed (reductions & linking) ----------------
const REAL_SPEED = [
  ['Whaddaya wanna do?', 'What do you want to do?', ['What did you want to do?', 'Where do you want to go?']],
  ['I\'m gonna be late.', 'I\'m going to be late.', ['I\'m gone to be late.', 'I was going to be late.']],
  ['I gotta go.', 'I\'ve got to go.', ['I got a goal.', 'I want to go.']],
  ['Lemme see.', 'Let me see.', ['Lemon sea.', 'Let\'s see.']],
  ['Didja eat yet?', 'Did you eat yet?', ['Did she eat yet?', 'Do you eat yet?']],
  ['Gimme a sec.', 'Give me a second.', ['Give me a snack.', 'Get me a sec.']],
  ['I dunno.', 'I don\'t know.', ['I\'m done now.', 'I do know.']],
  ['Whatcha doing?', 'What are you doing?', ['What is he doing?', 'Watch out doing!']],
  ['It\'s kinda cold.', 'It\'s kind of cold.', ['It\'s kind and cold.', 'It\'s getting cold.']],
  ['You shoulda told me.', 'You should have told me.', ['You should tell me.', 'You showed her to me.']],
  ['Wouldja help me?', 'Would you help me?', ['Would she help me?', 'Will you help me?']],
  ['Get outta here!', 'Get out of here!', ['Get out there!', 'Get it over here!']],
  ['I hafta finish this.', 'I have to finish this.', ['I half finished this.', 'I had to finish this.']],
  ['Check it out!', 'Check it out!', ['Chicken out!', 'Check that out!']],
  ['Not at all.', 'Not at all.', ['Not a tall.', 'Not that all.']],
];

export function runRealSpeed(root, count = 8) {
  const items = sample(REAL_SPEED, count);
  return new Promise((resolve) => {
    let i = 0;
    let right = 0;
    const prog = progressBar(items.length);
    const stage = h('div');
    root.replaceChildren(h('div', { class: 'activity' }, h('h2', {}, '🏃 Real Speed'), zh('美国人真实语速下会把词连在一起说。听一听，选出完整的意思！'), prog.node, stage));
    function show() {
      prog.set(i);
      const [spoken, full, wrong] = items[i];
      const opts = shuffle([full, ...wrong]);
      // TTS voices mangle spellings like "whaddaya", so play the full sentence at native speed;
      // modern voices reduce it naturally. The written reduced form is revealed afterwards.
      stage.replaceChildren(h('div', { class: 'row center' }, btn('🔊 Play', () => speak(full, { rate: 1.25 }), 'soft big'), btn('🐢', () => speak(full, { rate: 0.7 }), 'soft')));
      setTimeout(() => speak(full, { rate: 1.25 }), 300);
      choice(stage, opts, opts.indexOf(full)).then((ok) => {
        if (ok) right++;
        stage.appendChild(h('p', { class: 'center' }, 'Native speakers say: 🗣️ “', h('b', {}, spoken), '” = ', full));
        stage.appendChild(h('div', { class: 'row end' }, btn('Next ➜', () => {
          i++;
          i < items.length ? show() : resolve({ score: right / items.length, xp: addXP(items.length * 2 + right * 2, 'listen') });
        }, 'primary')));
      });
    }
    show();
  });
}

// ---------------- Can / can't ----------------
export function runCanCant(root, count = 8) {
  const unit = SOUNDS.find((s) => s.id === 'cancant');
  return new Promise((resolve) => {
    let i = 0;
    let right = 0;
    const prog = progressBar(count);
    const stage = h('div');
    root.replaceChildren(h('div', { class: 'activity' }, h('h2', {}, '⚖️ Can or Can\'t?'), zh(unit.tip), prog.node, stage));
    function show() {
      prog.set(i);
      const pair = pick(unit.pairs);
      const k = Math.random() < 0.5 ? 0 : 1;
      stage.replaceChildren(h('div', { class: 'row center' }, btn('🔊 Play', () => speak(pair[k]), 'soft big')));
      setTimeout(() => speak(pair[k]), 300);
      choice(stage, ['✅ can', '❌ can\'t'], k).then((ok) => {
        if (ok) right++;
        stage.appendChild(h('div', { class: 'row center wrap' }, btn('🔊 ' + pair[0], () => speak(pair[0]), 'chip'), btn('🔊 ' + pair[1], () => speak(pair[1]), 'chip')));
        stage.appendChild(h('div', { class: 'row end' }, btn('Next ➜', () => {
          i++;
          i < count ? show() : resolve({ score: right / count, xp: addXP(count + right * 2, 'listen') });
        }, 'primary')));
      });
    }
    show();
  });
}

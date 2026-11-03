// Free Talk: speak about a topic for 30–90 seconds. Measures fluency
// (words per minute, vocabulary, filler words) and saves the recording
// so parents can listen to progress over time.
import { h, btn, zh, pick, sleep, sfx } from '../ui.js';
import { speak, LiveTranscriber, hasASR, startRecording, playBlob, saveRecording } from '../speech.js';
import { fluency } from '../score.js';
import { finishScreen } from '../components.js';
import { state, save, addXP, today } from '../state.js';
import { PROMPTS } from '../data/practice.js';

export function promptsForLevel() {
  const lvl = state.settings.level;
  const fit = PROMPTS.filter((p) => p.level <= lvl && p.level >= lvl - 1);
  return fit.length ? fit : PROMPTS.filter((p) => p.level <= lvl + 1);
}

export function page(root, nav) {
  nav.title('Free Talk 自由说');
  let prompt = pick(promptsForLevel());
  let seconds = state.settings.level <= 2 ? 30 : state.settings.level <= 4 ? 60 : 90;
  const box = h('div');

  function render() {
    box.replaceChildren(
      promptCard(prompt),
      h('div', { class: 'row center wrap' },
        btn('🔀 Another topic', () => { prompt = pick(promptsForLevel()); render(); }, 'soft'),
        [30, 60, 90].map((s) => btn(`${s}s`, () => { seconds = s; render(); }, 'chip' + (s === seconds ? ' on' : '')))),
      h('div', { class: 'row center' }, btn('🎙️ Start talking!', async () => {
        const r = await runTalk(root, prompt, seconds);
        finishScreen(root, { score: r.score, xp: r.xp, title: 'You did it! 🎤', extra: r.summary, onDone: () => nav.go('freetalk', {}, true) });
      }, 'primary big')),
      history());
  }

  root.replaceChildren(
    h('p', { class: 'intro' }, zh('像聊天一样随便说，不要怕犯错！说得越多越流利。系统会统计语速、词汇量和"嗯/呃"等口头禅，并保存录音给爸妈听。')),
    box);
  render();
}

function promptCard(p) {
  return h('div', { class: 'prompt-card' },
    h('div', { class: 'prompt-q' }, p.q, ' ', btn('🔊', () => speak(p.q), 'chip tiny')),
    zh(p.zh),
    h('div', { class: 'starters' }, h('span', { class: 'muted small' }, 'Sentence starters 开头可以这样说：'),
      p.starters.map((s) => h('div', { class: 'starter' }, '💬 ', s))));
}

function history() {
  const talks = state.talks.slice(-6).reverse();
  if (!talks.length) return null;
  return h('div', { class: 'history' }, h('h3', {}, '📈 Recent talks'),
    h('table', {}, h('tr', {}, h('th', {}, 'Date'), h('th', {}, 'Words'), h('th', {}, 'WPM'), h('th', {}, 'Different words')),
      talks.map((t) => h('tr', {}, h('td', {}, t.date.slice(5)), h('td', {}, t.words), h('td', {}, t.wpm), h('td', {}, t.uniq)))));
}

export function runTalk(root, prompt, seconds = 60) {
  return new Promise(async (resolve) => {
    const timer = h('div', { class: 'timer' }, String(seconds));
    const transcript = h('div', { class: 'transcript' }, hasASR ? h('span', { class: 'muted' }, 'Your words will appear here…') : h('span', { class: 'muted' }, '（此浏览器不支持语音转文字，只录音）'));
    const stopBtn = btn('⏹ I\'m done', () => finish(), 'soft');
    root.replaceChildren(h('div', { class: 'activity' }, promptCard(prompt), timer, transcript, h('div', { class: 'row center' }, stopBtn)));

    for (const n of ['3', '2', '1', 'Go!']) {
      timer.textContent = n;
      sfx.pop();
      await sleep(700);
    }
    let rec = await startRecording();
    let live = new LiveTranscriber((t) => (transcript.textContent = t));
    live.start();
    // Some devices can't record and transcribe at once: drop the recording, keep the transcript.
    setTimeout(async () => {
      if (rec && live.error === 'audio-capture' && !finished) {
        await rec.stop();
        rec = null;
        live = new LiveTranscriber((t) => (transcript.textContent = t));
        live.start();
      }
    }, 1500);
    const t0 = Date.now();
    let finished = false;
    let left = seconds;
    timer.textContent = String(left);
    const iv = setInterval(() => {
      left--;
      timer.textContent = String(Math.max(0, left));
      if (left <= 10) timer.classList.add('hurry');
      if (left <= 0) finish();
    }, 1000);

    async function finish() {
      if (finished) return;
      finished = true;
      clearInterval(iv);
      stopBtn.disabled = true;
      timer.textContent = '⏳';
      const text = await live.stop();
      const blob = rec ? await rec.stop() : null;
      const sec = Math.max(1, Math.round((Date.now() - t0) / 1000));
      const f = fluency(text, sec);
      const entry = { date: today(), sec, ...f, q: prompt.q };
      if (hasASR) {
        state.talks.push(entry);
        if (state.talks.length > 200) state.talks.shift();
        save();
      }
      saveRecording({ kind: 'freetalk', title: prompt.q, text, ...f, sec }, blob);

      // Score: reward talking a lot with variety, gently discourage fillers.
      const target = state.settings.level <= 2 ? 50 : state.settings.level <= 4 ? 80 : 110;
      const score = hasASR ? Math.min(1, (f.wpm / target) * 0.7 + Math.min(f.uniq / 30, 1) * 0.3 - Math.min(f.fillers * 0.02, 0.2)) : 0.8;
      const xp = addXP(10 + Math.min(f.words, 150) / 3, 'talk');
      const prev = state.talks.length > 1 ? state.talks[state.talks.length - 2] : null;

      const summary = h('div', { class: 'talk-summary' },
        hasASR ? h('div', { class: 'stat-row' },
          stat(f.words, 'words', '说了多少词'),
          stat(f.wpm, 'words / min', '语速'),
          stat(f.uniq, 'different words', '不同的词'),
          stat(f.fillers, 'um / uh / like', '口头禅')) : null,
        hasASR && prev ? h('p', { class: 'center' }, f.wpm > prev.wpm ? `🚀 Faster than last time (${prev.wpm} → ${f.wpm} wpm)!` : `Last time: ${prev.wpm} wpm. Keep going!`) : null,
        h('p', { class: 'muted small center' }, zh(tipFor(f))),
        text ? h('details', {}, h('summary', {}, '📝 What you said'), h('p', {}, text)) : null,
        blob ? h('div', { class: 'row center' }, btn('▶ Listen to yourself', () => playBlob(blob), 'soft')) : null);
      resolve({ score: Math.max(0.1, score), xp, summary });
    }
  });
}

function stat(n, en, z) {
  return h('div', { class: 'stat' }, h('div', { class: 'stat-n' }, String(n)), h('div', { class: 'small' }, en), zh(z, 'small'));
}

function tipFor(f) {
  if (f.words < 15) return '小目标：下次试着多说几句，用上面的"开头句"帮忙！';
  if (f.fillers > 5) return '"um/uh" 有点多哦。想不出来时可以说 "Let me think…" 或 "Well…"，更地道！';
  if (f.wpm < 60) return '很好！试着说得更连贯一点，不用每个词都停顿。';
  if (f.uniq < f.words * 0.4) return '试着换用不同的词：不只说 good，还可以说 awesome, amazing, pretty cool！';
  return '太棒了！母语小朋友聊天大约每分钟 110–150 个词，你正在接近！';
}

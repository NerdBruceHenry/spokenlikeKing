// Reusable practice widgets: "listen + say it" card, colored word feedback, quizzes.
import { h, zh, btn, sfx, praise, stars } from './ui.js';
import { speak, recognize, hasASR, hasRecorder, startRecording, playBlob, stopRecognize } from './speech.js';
import { bestCompare, normalize } from './score.js';
import { state } from './state.js';

// Record the child's voice while recognizing (for "Me vs Native"), unless the device can't do both.
let recordDuringASR = true;

/** Color the original sentence by recognition result. */
export function colorize(text, words) {
  const out = h('span', { class: 'diff' });
  let k = 0;
  for (const tok of text.split(/(\s+)/)) {
    if (!tok) continue;
    if (/^\s+$/.test(tok)) {
      out.appendChild(document.createTextNode(' '));
      continue;
    }
    const n = normalize(tok).length;
    const sts = words.slice(k, k + n).map((w) => w.status);
    k += n;
    let st = 'ok';
    if (n && !sts.every((s) => s === 'ok')) st = sts.some((s) => s !== 'miss') ? 'close' : 'miss';
    out.appendChild(h('span', { class: `w ${st}` }, tok));
  }
  return out;
}

export function playButtons(text, opts = {}) {
  return h('div', { class: 'row' },
    btn('🔊 Listen', () => speak(text, { voice: opts.voice }), 'soft'),
    btn('🐢 Slow', () => speak(text, { rate: 0.65, voice: opts.voice }), 'soft'));
}

/**
 * The core "Say it" card.
 * opts: { text, zh, note, autoplay, onScore(score, detail), hideText, voice }
 */
export function sayCard(opts) {
  const { text } = opts;
  let best = 0;
  let lastBlob = null;
  const textBox = h('div', { class: 'say-text' + (opts.hideText ? ' blurred' : '') }, text);
  if (opts.hideText) textBox.addEventListener('click', () => textBox.classList.remove('blurred'));
  const result = h('div', { class: 'say-result' });
  const live = h('div', { class: 'live' });

  const micBtn = btn(hasASR ? '🎤 Say it' : '🎤 Record', () => (hasASR ? doRecognize() : doSelfCheck()), 'primary big');

  async function doRecognize() {
    micBtn.disabled = true;
    micBtn.classList.add('listening');
    micBtn.textContent = '👂 Listening…';
    live.textContent = '';
    result.replaceChildren();
    let rec = hasRecorder && recordDuringASR ? await startRecording() : null;
    let { alts, error } = await recognize({ onInterim: (t) => (live.textContent = t) });
    lastBlob = rec ? await rec.stop() : null;
    if (rec && error === 'audio-capture') {
      // Some devices can't record and recognize at the same time: recognize only from now on.
      recordDuringASR = false;
      rec = null;
      lastBlob = null;
      ({ alts, error } = await recognize({ onInterim: (t) => (live.textContent = t) }));
    }
    micBtn.disabled = false;
    micBtn.classList.remove('listening');
    micBtn.textContent = '🎤 Say it again';
    live.textContent = '';
    if (error === 'not-allowed' || error === 'service-not-allowed') {
      result.append(h('p', { class: 'warn' }, '麦克风被禁止了。请在浏览器地址栏允许麦克风权限。'));
      return;
    }
    if (error && error !== 'aborted') {
      result.append(h('p', { class: 'warn' }, `语音识别出错（${error}）。请检查网络后再试，或改用录音自评。`));
      return;
    }
    if (!alts.length) {
      result.append(h('p', { class: 'muted' }, "I didn't hear anything. Try again, a bit louder! 没听到声音，大声一点再试一次～"));
      return;
    }
    const r = bestCompare(text, alts);
    showResult(r.score, r);
  }

  let selfRec = null;
  async function doSelfCheck() {
    // No speech recognition (e.g. Firefox): record, play back next to the model, self-grade.
    if (selfRec) {
      const rec = selfRec;
      selfRec = null;
      lastBlob = await rec.stop();
      micBtn.classList.remove('listening');
      micBtn.textContent = '🎤 Record again';
      await speak(text, { voice: opts.voice });
      await playBlob(lastBlob);
      result.append(
        h('p', {}, 'Compare: did you sound the same? 和原声比一比，像吗？'),
        h('div', { class: 'row' },
          btn('😀 Same!', () => showResult(1)),
          btn('🙂 Close', () => showResult(0.7)),
          btn('😅 Not yet', () => showResult(0.3))));
      return;
    }
    result.replaceChildren();
    selfRec = await startRecording();
    if (!selfRec) {
      result.append(h('p', { class: 'warn' }, '这个浏览器不支持录音。建议用 Chrome、Edge 或 iPhone/iPad 的 Safari。'));
      return;
    }
    micBtn.textContent = '⏹ Stop';
    micBtn.classList.add('listening');
  }

  function showResult(score, detail) {
    best = Math.max(best, score);
    result.replaceChildren();
    if (detail) result.append(h('div', { class: 'heard' }, colorize(text, detail.words)));
    const st = stars(score);
    result.append(h('div', { class: 'praise' }, h('span', { class: 'stars' }, st.text), ' ', praise(score)));
    if (detail?.heard) result.append(h('div', { class: 'muted small' }, 'I heard: “', detail.heard, '”'));
    if (detail && score < 0.9) {
      result.append(h('div', { class: 'muted small' }, zh('绿色=说得好，黄色=接近，红色=没听清。听一遍慢速再试试！')));
    }
    if (lastBlob) {
      result.append(h('div', { class: 'row' },
        btn('🔁 Me vs Native', async () => {
          await speak(text, { voice: opts.voice });
          await playBlob(lastBlob);
        }, 'soft small')));
    }
    score >= 0.65 ? sfx.ok() : sfx.bad();
    opts.onScore?.(score, detail || null, best);
  }

  const node = h('div', { class: 'say-card' },
    textBox,
    opts.zh ? h('div', { class: 'say-zh' }, zh(opts.zh)) : null,
    opts.note ? h('div', { class: 'note' }, opts.note) : null,
    playButtons(text, opts),
    h('div', { class: 'row center' }, micBtn),
    live,
    result);

  if (opts.autoplay) setTimeout(() => speak(text, { voice: opts.voice }), 250);
  return { node, get best() { return best; }, stop: stopRecognize };
}

/** Multiple choice. Resolves true/false after the child answers. */
export function choice(container, options, correct, { onAnswer, labels } = {}) {
  return new Promise((resolve) => {
    const box = h('div', { class: 'choices' });
    options.forEach((opt, i) => {
      const b = btn(labels ? labels[i] : opt, () => {
        const ok = i === correct;
        box.querySelectorAll('button').forEach((x, j) => {
          x.disabled = true;
          if (j === correct) x.classList.add('right');
        });
        if (!ok) b.classList.add('wrong');
        ok ? sfx.ok() : sfx.bad();
        onAnswer?.(ok);
        resolve(ok);
      }, 'choice');
      box.appendChild(b);
    });
    container.appendChild(box);
  });
}

/** Progress dots, e.g. 3/8 */
export function progressBar(total) {
  const fill = h('div', { class: 'pfill' });
  const label = h('span', { class: 'plabel' });
  const node = h('div', { class: 'progress' }, h('div', { class: 'pbar' }, fill), label);
  return {
    node,
    set(i) {
      fill.style.width = `${Math.round((i / total) * 100)}%`;
      label.textContent = `${Math.min(i + 1, total)}/${total}`;
    },
  };
}

/** Big final screen for an activity. */
export function finishScreen(root, { title = 'Great work!', score, xp, extra, onDone }) {
  const st = stars(score);
  root.replaceChildren(h('div', { class: 'finish' },
    h('div', { class: 'mascot big bounce' }, '🦜'),
    h('h2', {}, title),
    h('div', { class: 'stars huge' }, st.text),
    h('p', {}, `+${xp} XP`),
    extra || null,
    h('div', { class: 'row center' }, btn('Continue ➜', onDone, 'primary big'))));
  sfx.win();
}

export function showZhEnabled() {
  return state.settings.showZh;
}

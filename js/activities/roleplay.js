// Role-play: a chat between the child and a character. On the child's turn,
// any of the suggested replies is accepted — they pick one and say it.
import { h, btn, zh, sfx, praise } from '../ui.js';
import { speak, recognize, hasASR, stopSpeaking, speakLines } from '../speech.js';
import { bestCompare } from '../score.js';
import { colorize, finishScreen } from '../components.js';
import { state, addXP, markDone } from '../state.js';
import { SCENES } from '../data/scenes.js';
import { menuGrid } from './common.js';

export function page(root, nav, params = {}) {
  if (params.id) {
    const scene = SCENES.find((s) => s.id === params.id);
    nav.title(scene.title);
    runScene(root, scene).then((r) => {
      markDone('scene:' + scene.id, r.score);
      finishScreen(root, {
        score: r.score, xp: r.xp, title: 'Scene complete! 🎬',
        extra: h('div', { class: 'row center' }, btn('▶ Replay the whole conversation', () => replay(scene, r.said), 'soft')),
        onDone: () => nav.go('roleplay'),
      });
    });
    return;
  }
  nav.title('Role-play 情景对话');
  const lvl = state.settings.level;
  root.replaceChildren(
    h('p', { class: 'intro' }, zh('你来演自己！角色先说话，轮到你时，选一句你喜欢的说出来（任何一句都可以）。')),
    menuGrid(SCENES.map((s) => ({
      icon: s.icon, title: s.title, zh: s.zh,
      badge: state.done['scene:' + s.id] ? '★'.repeat(Math.max(1, Math.round(state.done['scene:' + s.id] * 3))) : `L${s.level}`,
      done: !!state.done['scene:' + s.id],
      dim: s.level > lvl + 1,
      onClick: () => nav.go('roleplay', { id: s.id }),
    }))));
}

function replay(scene, said) {
  let k = 0;
  const lines = scene.lines.map((l) => (l.b ? { text: l.b, voice: 'alt' } : { text: said[k++] || l.k[0].en, voice: 'main' }));
  speakLines(lines, { gap: 350 });
}

export function runScene(root, scene) {
  return new Promise((resolve) => {
    const chat = h('div', { class: 'chat' });
    const panel = h('div', { class: 'reply-panel' });
    root.replaceChildren(h('div', { class: 'activity' },
      h('div', { class: 'scene-head' }, h('span', { class: 'scene-icon' }, scene.icon), h('div', {}, h('b', {}, scene.title), h('div', {}, zh(scene.zh)), h('div', { class: 'muted small' }, 'Talking with: ', scene.partner))),
      chat, panel));

    const scores = [];
    const said = [];
    let idx = 0;

    function bubble(who, content, zhText, extra) {
      const b = h('div', { class: `bubble ${who}` },
        h('div', { class: 'bubble-text' }, content),
        zhText ? zh(zhText, 'small') : null,
        extra || null);
      chat.appendChild(b);
      b.scrollIntoView({ behavior: 'smooth', block: 'end' });
      return b;
    }

    async function step() {
      if (idx >= scene.lines.length) {
        panel.replaceChildren();
        const score = scores.reduce((a, b) => a + b, 0) / Math.max(1, scores.length);
        resolve({ score, xp: addXP(scores.length * 4 + score * scores.length * 4, 'roleplay'), said });
        return;
      }
      const line = scene.lines[idx];
      if (line.b) {
        bubble('bot', line.b, line.zh, btn('🔊', () => speak(line.b, { voice: 'alt' }), 'chip tiny'));
        panel.replaceChildren(h('div', { class: 'muted center' }, '…'));
        await speak(line.b, { voice: 'alt' });
        idx++;
        step();
      } else {
        kidTurn(line.k);
      }
    }

    function kidTurn(options) {
      let best = { score: 0 };
      const res = h('div', { class: 'say-result' });
      const live = h('div', { class: 'live' });
      const optBox = h('div', { class: 'options' }, options.map((o) => h('div', { class: 'option' },
        h('div', { class: 'option-text' }, o.en),
        zh(o.zh, 'small'),
        h('div', { class: 'row' }, btn('🔊', () => speak(o.en), 'chip tiny'), btn('🐢', () => speak(o.en, { rate: 0.65 }), 'chip tiny'),
          !hasASR ? btn('✅ I said this', () => accept(o.en, 0.7, null), 'chip tiny') : null))));

      const mic = btn('🎤 Your turn — say one!', async () => {
        mic.disabled = true;
        mic.classList.add('listening');
        mic.textContent = '👂 Listening…';
        res.replaceChildren();
        const { alts, error } = await recognize({ onInterim: (t) => (live.textContent = t) });
        live.textContent = '';
        mic.disabled = false;
        mic.classList.remove('listening');
        mic.textContent = '🎤 Try again';
        if (error) {
          res.replaceChildren(h('p', { class: 'warn' }, `语音识别出错（${error}）`));
          return;
        }
        let r = { score: 0 };
        let opt = options[0];
        for (const o of options) {
          const c = bestCompare(o.en, alts);
          if (c.score > r.score) {
            r = c;
            opt = o;
          }
        }
        if (r.score >= 0.6) {
          sfx.ok();
          accept(opt.en, r.score, r);
        } else {
          sfx.bad();
          if (r.score > best.score) best = { ...r, opt };
          res.replaceChildren(
            h('div', { class: 'praise' }, praise(r.score)),
            h('div', { class: 'muted small' }, 'I heard: “', alts[0] || '…', '”'),
            best.opt ? btn('➜ Keep going anyway', () => accept(best.opt.en, best.score, best), 'soft small') : null);
        }
      }, 'primary big');

      function accept(text, score, detail) {
        stopSpeaking();
        scores.push(score);
        said.push(text);
        bubble('kid', detail ? colorize(text, detail.words) : text, null, h('span', { class: 'stars small' }, score >= 0.9 ? '★★★' : score >= 0.7 ? '★★' : score > 0 ? '★' : ''));
        idx++;
        step();
      }

      panel.replaceChildren(
        h('div', { class: 'muted small' }, hasASR ? 'Pick one and say it out loud 选一句说出来：' : '选一句大声说出来，然后点 ✅'),
        optBox,
        hasASR ? h('div', { class: 'row center' }, mic) : null,
        live, res,
        h('div', { class: 'row end' }, btn('Skip', () => accept(options[0].en, 0, null), 'soft small')));
    }

    step();
  });
}

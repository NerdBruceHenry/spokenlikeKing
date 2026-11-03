// Small DOM + feedback helpers shared by every screen.

// Let replaceChildren/append accept nested arrays and skip null/false, like h() does,
// so conditional children (`cond ? node : null`) never render as the text "null".
for (const name of ['replaceChildren', 'append']) {
  const native = Element.prototype[name];
  Element.prototype[name] = function (...kids) {
    return native.apply(this, kids.flat(Infinity).filter((k) => k != null && k !== false));
  };
}

export function h(tag, attrs = {}, ...kids) {
  const node = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs || {})) {
    if (v == null || v === false) continue;
    if (k === 'class') node.className = v;
    else if (k === 'style' && typeof v === 'object') Object.assign(node.style, v);
    else if (k.startsWith('on') && typeof v === 'function') node.addEventListener(k.slice(2).toLowerCase(), v);
    else if (k === 'html') node.innerHTML = v;
    else node.setAttribute(k, v === true ? '' : v);
  }
  append(node, kids);
  return node;
}

function append(node, kids) {
  for (const kid of kids) {
    if (kid == null || kid === false) continue;
    if (Array.isArray(kid)) append(node, kid);
    else node.appendChild(kid instanceof Node ? kid : document.createTextNode(String(kid)));
  }
}

export function clear(node) {
  while (node.firstChild) node.removeChild(node.firstChild);
  return node;
}

/** Chinese helper text; hidden when the "show Chinese" setting is off (immersion mode). */
export function zh(text, cls = '') {
  return h('span', { class: `zh ${cls}` }, text);
}

export function btn(label, onClick, cls = '') {
  return h('button', { class: `btn ${cls}`, type: 'button', onclick: onClick }, label);
}

export function toast(msg, ms = 2200) {
  const t = h('div', { class: 'toast' }, msg);
  document.body.appendChild(t);
  requestAnimationFrame(() => t.classList.add('show'));
  setTimeout(() => {
    t.classList.remove('show');
    setTimeout(() => t.remove(), 400);
  }, ms);
}

export function modal(content, buttons = [{ label: 'OK', value: true, cls: 'primary' }]) {
  return new Promise((resolve) => {
    const close = (v) => {
      back.remove();
      resolve(v);
    };
    const back = h('div', { class: 'modal-back' },
      h('div', { class: 'modal' },
        content,
        h('div', { class: 'row end' }, buttons.map((b) => btn(b.label, () => close(b.value), b.cls || '')))));
    document.body.appendChild(back);
  });
}

// ---------- randomness ----------
export const shuffle = (arr) => {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
};
export const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];
export const sample = (arr, n) => shuffle(arr).slice(0, n);
export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// ---------- sound effects (WebAudio, no files) ----------
let ctx;
function tone(freq, dur, type = 'sine', when = 0, vol = 0.18) {
  try {
    ctx = ctx || new (window.AudioContext || window.webkitAudioContext)();
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.type = type;
    o.frequency.value = freq;
    const t0 = ctx.currentTime + when;
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(vol, t0 + 0.02);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    o.connect(g).connect(ctx.destination);
    o.start(t0);
    o.stop(t0 + dur + 0.05);
  } catch { /* audio not available */ }
}
export const sfx = {
  ok() { tone(660, 0.12); tone(990, 0.18, 'sine', 0.1); },
  bad() { tone(220, 0.25, 'triangle'); },
  coin() { tone(1200, 0.08, 'square', 0, 0.08); tone(1600, 0.15, 'square', 0.07, 0.08); },
  win() { [523, 659, 784, 1047].forEach((f, i) => tone(f, 0.22, 'triangle', i * 0.12)); },
  pop() { tone(500, 0.06, 'sine', 0, 0.1); },
};

// ---------- confetti ----------
export function confetti(n = 80) {
  const colors = ['#ff6b6b', '#ffd93d', '#6bcB77', '#4d96ff', '#c77dff', '#ff9f1c'];
  const box = h('div', { class: 'confetti' });
  for (let i = 0; i < n; i++) {
    box.appendChild(h('i', {
      style: {
        left: Math.random() * 100 + 'vw',
        background: pick(colors),
        animationDelay: Math.random() * 0.6 + 's',
        animationDuration: 1.6 + Math.random() * 1.4 + 's',
        transform: `rotate(${Math.random() * 360}deg)`,
      },
    }));
  }
  document.body.appendChild(box);
  setTimeout(() => box.remove(), 3500);
}

export function stars(score) {
  const n = score >= 0.9 ? 3 : score >= 0.65 ? 2 : score >= 0.35 ? 1 : 0;
  return { n, text: '★'.repeat(n) + '☆'.repeat(3 - n) };
}

export function praise(score) {
  if (score >= 0.95) return pick(['Perfect! 🎉', 'Nailed it! 🔥', 'You sound like a native! 👑', 'Awesome sauce! 🤩']);
  if (score >= 0.75) return pick(['Great job! 😄', 'So close to perfect!', 'Nice one! 👍', 'Sweet! ⭐']);
  if (score >= 0.45) return pick(['Not bad! Try again? 💪', 'Getting there!', 'Good try! 🙂']);
  return pick(['Let\'s try once more! 🦜', 'Listen again, then go for it!', 'You got this! 💪']);
}

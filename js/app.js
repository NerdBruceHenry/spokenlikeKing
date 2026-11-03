// App shell: hash router, home screen, header stats, sticker book, practice timer.
import { h, btn, zh, clear, modal, toast, sfx, confetti } from './ui.js';
import { state, save, streak, rank, dayRec, srsDue, addCoins, addSeconds } from './state.js';
import { stopSpeaking, stopRecognize, voicesReady, hasASR } from './speech.js';
import { LEVELS } from './data/levels.js';
import { STICKERS, STICKER_PRICE } from './data/stickers.js';
import * as daily from './activities/daily.js';
import * as soundlab from './activities/soundlab.js';
import * as shadow from './activities/shadow.js';
import * as phrases from './activities/phrases.js';
import * as roleplay from './activities/roleplay.js';
import * as listening from './activities/listening.js';
import * as freetalk from './activities/freetalk.js';
import * as twisters from './activities/twisters.js';
import * as review from './activities/review.js';
import * as buddy from './activities/buddy.js';
import * as parent from './activities/parent.js';

const ROUTES = {
  daily: daily.page,
  sounds: soundlab.page,
  shadow: shadow.page,
  phrases: phrases.page,
  roleplay: roleplay.page,
  listen: listening.page,
  freetalk: freetalk.page,
  twisters: twisters.page,
  review: review.page,
  buddy: buddy.page,
  parent: parent.page,
  stickers: stickersPage,
};

const main = document.getElementById('main');
const titleEl = document.getElementById('title');
const backBtn = document.getElementById('back');
const statsEl = document.getElementById('stats');

function parseHash() {
  const raw = location.hash.replace(/^#\/?/, '');
  const [route, qs] = raw.split('?');
  const params = Object.fromEntries(new URLSearchParams(qs || ''));
  return { route: route || 'home', params };
}

function hashFor(route, params = {}) {
  const qs = new URLSearchParams(params).toString();
  return '#/' + route + (qs ? '?' + qs : '');
}

const nav = {
  /** Navigate; if we're already on that screen, re-render it (used to refresh after an activity). */
  go(route, params = {}) {
    const target = route === 'home' ? '#/' : hashFor(route, params);
    if (location.hash === target || (route === 'home' && (location.hash === '' || location.hash === '#/'))) {
      render();
    } else {
      location.hash = target;
    }
  },
  title(t) {
    titleEl.textContent = t;
    document.title = t + ' · Spoken Like a King';
  },
};

let current = 'home';
function render() {
  stopSpeaking();
  stopRecognize();
  const { route, params } = parseHash();
  current = route;
  document.body.dataset.route = route;
  clear(main);
  main.scrollTop = 0;
  window.scrollTo(0, 0);
  backBtn.hidden = route === 'home';
  backBtn.onclick = () => {
    if (Object.keys(params).length && route !== 'daily') nav.go(route);
    else nav.go('home');
  };
  const fn = ROUTES[route];
  if (!fn) {
    nav.title('Spoken Like a King');
    home();
  } else {
    fn(main, nav, params);
  }
  renderStats();
}

function renderStats() {
  const r = rank();
  statsEl.replaceChildren(
    h('span', { title: 'Day streak 连续天数' }, '🔥', streak()),
    h('span', { title: 'XP 经验' }, r.icon, state.xp),
    h('span', { title: 'Coins 金币' }, '🪙', state.coins));
}
document.addEventListener('slk:stats', renderStats);

// ---------------- Home ----------------
function home() {
  titleEl.textContent = 'Spoken Like a King';
  const r = rank();
  const d = dayRec();
  const goalSec = state.settings.dailyGoal * 60;
  const pct = Math.min(100, Math.round((d.sec / goalSec) * 100));
  const questDone = d.quest;
  const due = srsDue(99).length;
  const lv = LEVELS.find((l) => l.n === state.settings.level);
  const name = state.settings.kidName;
  const greet = questDone ? `Awesome work today${name ? ', ' + name : ''}! 🎉` : `Hi${name ? ' ' + name : ''}! Ready to practice?`;

  const tile = (icon, title, z, route, badge) => h('button', { class: 'tile', type: 'button', onclick: () => nav.go(route) },
    h('div', { class: 'tile-icon' }, icon), h('div', { class: 'tile-title' }, title), zh(z, 'tile-zh'),
    badge ? h('div', { class: 'badge hot' }, badge) : null);

  main.replaceChildren(
    h('div', { class: 'hero' },
      h('div', { class: 'mascot bounce', onclick: () => { sfx.pop(); toast(['Squawk! Let\'s talk!', 'Practice makes progress!', 'You sound awesome!', 'Hello, your majesty! 👑'][Math.floor(Math.random() * 4)]); } }, '🦜'),
      h('div', { class: 'hero-body' },
        h('div', { class: 'hero-greet' }, greet),
        h('div', { class: 'rank' }, r.icon, ' ', h('b', {}, r.name), ' ', zh(r.zh), r.next ? h('span', { class: 'muted small' }, ` → ${r.next.icon} ${r.next.xp - state.xp} XP`) : null),
        h('div', { class: 'pbar' }, h('div', { class: 'pfill', style: { width: Math.round(r.progress * 100) + '%' } })),
        h('div', { class: 'small' }, `⏱️ Today ${Math.round(d.sec / 60)} / ${state.settings.dailyGoal} min`, h('div', { class: 'pbar thin' }, h('div', { class: 'pfill goal', style: { width: pct + '%' } }))))),
    h('button', { class: 'quest-btn' + (questDone ? ' done' : ''), type: 'button', onclick: () => nav.go('daily') },
      h('span', { class: 'quest-icon' }, questDone ? '🏆' : '⚔️'),
      h('span', {}, h('b', {}, questDone ? 'Quest complete!' : "Today's Quest"), h('br'), zh(questDone ? '今日任务已完成，太棒了！' : '每日任务 · 约 15 分钟 · 完成开宝箱')),
      h('span', { class: 'quest-go' }, questDone ? '✓' : '▶')),
    h('h3', { class: 'section-title' }, 'Free Practice ', zh('自由练习')),
    h('div', { class: 'grid' },
      tile('👅', 'Sound Lab', '发音实验室', 'sounds'),
      tile('🦜', 'Shadowing', '影子跟读', 'shadow'),
      tile('💬', 'Real Talk', '地道表达', 'phrases'),
      tile('🎭', 'Role-play', '情景对话', 'roleplay'),
      tile('👂', 'Listening', '听力训练', 'listen'),
      tile('🎙️', 'Free Talk', '自由说', 'freetalk'),
      tile('🌀', 'Tongue Twisters', '绕口令', 'twisters'),
      tile('🔁', 'Review', '复习', 'review', due ? String(due) : null),
      tile('🤖', 'AI Buddy', 'AI 聊天伙伴', 'buddy'),
      tile('🌟', 'Stickers', '贴纸收藏', 'stickers', `${state.stickers.length}`)),
    h('div', { class: 'home-foot' },
      h('span', { class: `lv lv${lv.n}` }, `${lv.icon} L${lv.n} ${lv.name}`),
      btn('👨‍👩‍👧 Parent Zone 家长中心', () => nav.go('parent'), 'soft small')),
    !hasASR ? h('p', { class: 'warn small' }, '提示：此浏览器不支持语音识别，口语练习会使用"录音+自评"。推荐 Chrome / Edge / Safari。') : null);
}

// ---------------- Stickers ----------------
function stickersPage(root, n) {
  n.title('Sticker Book 贴纸收藏');
  const owned = new Set(state.stickers);
  root.replaceChildren(
    h('p', { class: 'intro' }, zh(`已收集 ${owned.size} / ${STICKERS.length}。每天完成任务开宝箱得一张，也可以用 ${STICKER_PRICE} 金币买一张随机贴纸。`)),
    btn(`🎲 Buy a mystery sticker (🪙${STICKER_PRICE})`, async () => {
      const avail = STICKERS.filter((s) => !owned.has(s.id));
      if (!avail.length) return toast('You have them all! 🏆');
      if (state.coins < STICKER_PRICE) return toast(`还差 ${STICKER_PRICE - state.coins} 个金币，继续练习吧！`);
      addCoins(-STICKER_PRICE);
      const s = avail[Math.floor(Math.random() * avail.length)];
      state.stickers.push(s.id);
      save();
      confetti(60);
      sfx.win();
      await modal(h('div', { class: 'center' }, h('div', { class: 'sticker-big' }, s.e), h('h2', {}, s.name)), [{ label: 'Cool!', value: 1, cls: 'primary' }]);
      stickersPage(root, n);
    }, 'primary wide'),
    h('div', { class: 'sticker-grid' }, STICKERS.map((s) => owned.has(s.id)
      ? h('div', { class: 'sticker', title: s.name }, h('div', { class: 'sticker-e' }, s.e), h('div', { class: 'small' }, s.name))
      : h('div', { class: 'sticker locked' }, h('div', { class: 'sticker-e' }, '?')))));
}

// ---------------- practice timer ----------------
let lastInput = Date.now();
['pointerdown', 'keydown', 'touchstart'].forEach((ev) => window.addEventListener(ev, () => (lastInput = Date.now()), { passive: true }));
setInterval(() => {
  const busy = window.speechSynthesis?.speaking;
  if (current !== 'home' && current !== 'parent' && current !== 'stickers' && document.visibilityState === 'visible' && (Date.now() - lastInput < 60000 || busy)) {
    addSeconds(5);
  }
}, 5000);

// ---------------- first run ----------------
async function onboarding() {
  if (state.settings.onboarded) return;
  let chosen = 1;
  const name = h('input', { placeholder: 'English nickname (e.g. Leo) 英文名，可不填', class: 'wide-input' });
  const levelBtns = h('div', { class: 'list' }, LEVELS.map((l) => {
    const b = btn([`${l.icon} L${l.n} ${l.name} ${l.zh}`, h('div', { class: 'small muted' }, l.age)], () => {
      chosen = l.n;
      levelBtns.querySelectorAll('button').forEach((x) => x.classList.remove('on'));
      b.classList.add('on');
    }, 'wide level-opt' + (l.n === 1 ? ' on' : ''));
    return b;
  }));
  await modal(h('div', {},
    h('div', { class: 'center' }, h('div', { class: 'mascot big' }, '🦜'), h('h2', {}, 'Welcome to Spoken Like a King!'),
      h('p', {}, '我是 Kingsley！我会陪你每天练英语听力和口语，说一口地道的美式英语！')),
    name,
    h('p', {}, '选择起始难度（家长可以随时在家长中心调整）：'),
    levelBtns,
    h('p', { class: 'small muted' }, '需要使用麦克风：第一次说话时，请在浏览器弹窗中点"允许"。')),
  [{ label: "Let's go! 🚀", value: true, cls: 'primary big' }]);
  state.settings.level = chosen;
  state.settings.kidName = name.value.trim();
  state.settings.onboarded = true;
  save();
  render();
}

// ---------------- boot ----------------
document.body.classList.toggle('no-zh', !state.settings.showZh);
window.addEventListener('hashchange', render);
voicesReady();
render();
onboarding();

if ('serviceWorker' in navigator && location.protocol === 'https:') {
  navigator.serviceWorker.register('sw.js').catch(() => {});
}

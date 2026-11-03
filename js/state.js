// Progress, settings and spaced-repetition, persisted in localStorage.

const KEY = 'slk.v1';

const DEFAULTS = {
  settings: {
    level: 1,
    voiceURI: '',
    rate: 0.95,
    showZh: true,
    dailyGoal: 15, // minutes
    apiKey: '',
    model: 'claude-opus-5-5',
    kidName: '',
    parentPin: '',
  },
  xp: 0,
  coins: 0,
  stickers: [],
  days: {},
  srs: {},
  done: {}, // e.g. done['scene:school'] = best score
  talks: [],
  plan: null,
};

function load() {
  try {
    const raw = JSON.parse(localStorage.getItem(KEY) || 'null');
    if (raw && typeof raw === 'object') {
      return { ...structuredClone(DEFAULTS), ...raw, settings: { ...DEFAULTS.settings, ...(raw.settings || {}) } };
    }
  } catch { /* storage blocked or corrupt */ }
  return structuredClone(DEFAULTS);
}

export const state = load();

export function save() {
  try {
    localStorage.setItem(KEY, JSON.stringify(state));
  } catch { /* private mode etc. */ }
}

export function exportData() {
  return JSON.stringify(state, null, 1);
}

export function importData(json) {
  const data = JSON.parse(json);
  if (!data || typeof data !== 'object' || !data.settings) throw new Error('bad file');
  for (const k of Object.keys(state)) delete state[k];
  Object.assign(state, structuredClone(DEFAULTS), data, { settings: { ...DEFAULTS.settings, ...data.settings } });
  save();
}

// ---------- dates ----------
export function dateKey(d = new Date()) {
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}
export const today = () => dateKey();
export function addDays(key, n) {
  const [y, m, d] = key.split('-').map(Number);
  return dateKey(new Date(y, m - 1, d + n));
}

export function dayRec(key = today()) {
  if (!state.days[key]) state.days[key] = { sec: 0, xp: 0, acts: {}, quest: false };
  return state.days[key];
}

// ---------- rewards ----------
export function addXP(n, act) {
  n = Math.max(0, Math.round(n));
  state.xp += n;
  const d = dayRec();
  d.xp += n;
  if (act) d.acts[act] = (d.acts[act] || 0) + 1;
  save();
  document.dispatchEvent(new CustomEvent('slk:stats'));
  return n;
}

export function addCoins(n) {
  state.coins += n;
  save();
  document.dispatchEvent(new CustomEvent('slk:stats'));
}

export function addSeconds(sec) {
  dayRec().sec += sec;
  save();
}

/** A day "counts" for the streak if the daily quest was done or >= 5 minutes were practiced. */
function dayCounts(key) {
  const d = state.days[key];
  return !!d && (d.quest || d.sec >= 300);
}

export function streak() {
  let key = today();
  let n = 0;
  if (!dayCounts(key)) key = addDays(key, -1); // today not finished yet: streak still alive
  while (dayCounts(key)) {
    n++;
    key = addDays(key, -1);
  }
  return n;
}

export function markDone(id, score) {
  const prev = state.done[id] || 0;
  if (score > prev) state.done[id] = Math.round(score * 100) / 100;
  save();
}

export const RANKS = [
  { xp: 0, name: 'Egg', zh: '蛋蛋', icon: '🥚' },
  { xp: 100, name: 'Chick', zh: '小雏鸟', icon: '🐣' },
  { xp: 300, name: 'Parrotlet', zh: '小鹦鹉', icon: '🐦' },
  { xp: 800, name: 'Chatterbox', zh: '话匣子', icon: '🦜' },
  { xp: 1800, name: 'Storyteller', zh: '故事大王', icon: '📖' },
  { xp: 3500, name: 'Speaker', zh: '演讲家', icon: '🎤' },
  { xp: 6000, name: 'Rising Star', zh: '新星', icon: '⭐' },
  { xp: 10000, name: 'Smooth Talker', zh: '口语达人', icon: '😎' },
  { xp: 16000, name: 'King of Talk', zh: '口语之王', icon: '👑' },
  { xp: 25000, name: 'Legend', zh: '传奇', icon: '🏆' },
];
export function rank(xp = state.xp) {
  let i = 0;
  while (i + 1 < RANKS.length && xp >= RANKS[i + 1].xp) i++;
  const next = RANKS[i + 1];
  return { ...RANKS[i], index: i, next, progress: next ? (xp - RANKS[i].xp) / (next.xp - RANKS[i].xp) : 1 };
}

// ---------- spaced repetition (Leitner) ----------
const INTERVALS = [0, 1, 2, 4, 7, 15, 30, 60];

/** item: {id, type:'phrase'|'sentence'|'word', en, zh} */
export function srsAdd(item) {
  if (state.srs[item.id]) return;
  state.srs[item.id] = { ...item, box: 1, due: addDays(today(), 1), seen: 0, ok: 0 };
  save();
}

export function srsDue(limit = 20) {
  const t = today();
  return Object.values(state.srs)
    .filter((c) => c.due <= t)
    .sort((a, b) => a.box - b.box || a.due.localeCompare(b.due))
    .slice(0, limit);
}

export function srsGrade(id, ok) {
  const c = state.srs[id];
  if (!c) return;
  c.seen++;
  if (ok) {
    c.ok++;
    c.box = Math.min(c.box + 1, INTERVALS.length - 1);
  } else {
    c.box = 1;
  }
  c.due = addDays(today(), ok ? INTERVALS[c.box] : 1);
  save();
}

export function srsStats() {
  const all = Object.values(state.srs);
  return { total: all.length, mastered: all.filter((c) => c.box >= 5).length, due: srsDue(999).length };
}

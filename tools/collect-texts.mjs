// Collects every English sentence the app speaks, so tools/gen_audio.py can
// pre-generate natural neural-voice clips for them.
//   node tools/collect-texts.mjs   → tools/texts.json
import { writeFileSync } from 'node:fs';
import { PHRASES } from '../js/data/phrases.js';
import { SHADOW_PACKS, TWISTERS, PROMPTS, REAL_SPEED } from '../js/data/practice.js';
import { SCENES } from '../js/data/scenes.js';
import { SOUNDS } from '../js/data/sounds.js';
import { STORIES } from '../js/data/stories.js';
import { normText, partnerVoice } from '../js/audio-keys.js';

const CJK = /[　-鿿＀-￯]/;
// Keys whose values are labels / Chinese notes, never read aloud.
const SKIP_KEYS = new Set(['id', 'icon', 'title', 'zh', 'zhTitle', 'tip', 'name', 'partner', 'e', 'cat', 'level', 'focus', 'note', 'b', 'q_zh']);

const items = new Map(); // key voice|text → { text, voice }
function add(text, voice = 'main') {
  if (typeof text !== 'string') return;
  const t = normText(text);
  if (!t || CJK.test(t) || !/[a-z]/i.test(t)) return;
  items.set(voice + '|' + t, { text: t, voice });
}
function walk(v, key) {
  if (key && SKIP_KEYS.has(key)) return;
  if (typeof v === 'string') return add(v);
  if (Array.isArray(v)) return v.forEach((x) => walk(x));
  if (v && typeof v === 'object') for (const [k, x] of Object.entries(v)) walk(x, k);
}

PHRASES.forEach((p) => { add(p.en); add(p.ex); });
walk(SHADOW_PACKS);
walk(TWISTERS);
walk(PROMPTS);
walk(SOUNDS);
walk(STORIES);
REAL_SPEED.forEach(([spoken, full]) => { add(spoken); add(full); });
for (const s of SCENES) {
  for (const line of s.lines) {
    if (line.b) add(line.b, partnerVoice(s.partner));
    if (line.k) line.k.forEach((o) => add(o.en));
  }
}

// Number Ninja sentences (must match numberRound() in js/activities/listening.js).
for (let d = 3; d <= 9; d++) {
  for (const n of [10 + d, d * 10]) {
    for (const noun of ['stickers', 'kids in my class', 'dollars', 'minutes', 'pages', 'points']) add(`I have ${n} ${noun}.`);
  }
}
for (let hr = 1; hr <= 12; hr++) {
  for (const m of ['15', '50', '05', '30', '13', '03', '45', '40', '54', '20', '12', '02']) add(`Let's meet at ${`${hr}:${m}`.replace(':0', ' oh ')}.`);
}
for (const dl of [3, 4, 6, 7, 8, 9]) {
  for (const ct of ['99', '19', '90', '50', '15', '05', '75', '57', '70']) add(`It costs ${dl} ${ct === '05' ? 'oh five' : ct}.`);
}
for (const y of [2013, 2030, 2003, 2016, 2060, 2006, 1990, 1919, 1999, 2018, 2080, 2008]) {
  const spoken = y >= 2010 ? `twenty ${y % 100}` : y >= 2000 ? `two thousand ${y % 100}` : `nineteen ${y % 100}`;
  add(`It happened in ${spoken}.`);
}

// One-off lines spoken from code.
add('Hi! I\'m Kingsley. Let\'s practice English together!');

const list = [...items.values()];
writeFileSync(new URL('./texts.json', import.meta.url), JSON.stringify(list, null, 0));
const by = list.reduce((a, x) => ((a[x.voice] = (a[x.voice] || 0) + 1), a), {});
console.log(list.length, 'texts', by, 'chars', list.reduce((a, x) => a + x.text.length, 0));

// Compare what the child was supposed to say with what speech recognition heard.
// Pure functions — unit-tested in tests/score.test.mjs.

const CONTRACTIONS = [
  [/\bcan't\b/g, 'can not'], [/\bcannot\b/g, 'can not'], [/\bwon't\b/g, 'will not'],
  [/\bain't\b/g, 'is not'], [/n't\b/g, ' not'], [/'re\b/g, ' are'], [/'m\b/g, ' am'],
  [/'ll\b/g, ' will'], [/'ve\b/g, ' have'],
];

const REDUCTIONS = {
  gonna: 'going to', wanna: 'want to', gotta: 'got to', hafta: 'have to', gimme: 'give me',
  lemme: 'let me', kinda: 'kind of', sorta: 'sort of', outta: 'out of', lotta: 'lot of',
  dunno: 'do not know', ok: 'okay', 'o.k.': 'okay', yeah: 'yes', yep: 'yes', yup: 'yes',
  cuz: 'because', 'cause': 'because', whatcha: 'what are you', ya: 'you', til: 'until', till: 'until',
  mr: 'mister', mrs: 'missus', ms: 'miss', tv: 't v',
};

const ONES = ['zero', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten',
  'eleven', 'twelve', 'thirteen', 'fourteen', 'fifteen', 'sixteen', 'seventeen', 'eighteen', 'nineteen'];
const TENS = ['', '', 'twenty', 'thirty', 'forty', 'fifty', 'sixty', 'seventy', 'eighty', 'ninety'];

export function numberToWords(n) {
  if (n < 20) return ONES[n];
  if (n < 100) return TENS[Math.floor(n / 10)] + (n % 10 ? ' ' + ONES[n % 10] : '');
  if (n < 1000) return ONES[Math.floor(n / 100)] + ' hundred' + (n % 100 ? ' ' + numberToWords(n % 100) : '');
  if (n < 10000 && n % 100 === 0 && n % 1000 !== 0) return numberToWords(n / 100) + ' hundred';
  if (n < 1000000) return numberToWords(Math.floor(n / 1000)) + ' thousand' + (n % 1000 ? ' ' + numberToWords(n % 1000) : '');
  return String(n);
}

export function normalize(text) {
  let t = String(text || '').toLowerCase()
    .replace(/[’‘`]/g, "'")
    .replace(/(\d),(\d{3})/g, '$1$2')
    .replace(/\$(\d+)/g, '$1 dollars')
    .replace(/(\d+)%/g, '$1 percent')
    .replace(/&/g, ' and ')
    .replace(/[-–—/]/g, ' ');
  for (const [re, rep] of CONTRACTIONS) t = t.replace(re, rep);
  t = t.replace(/[^a-z0-9' ]+/g, ' ').replace(/'(?![a-z])|(?<![a-z])'/g, ' ');
  const out = [];
  for (const w of t.split(/\s+/).filter(Boolean)) {
    if (/^\d+$/.test(w)) out.push(...numberToWords(Number(w)).split(' '));
    else if (/^\d+(st|nd|rd|th)$/.test(w)) out.push(w); // leave ordinals
    else if (REDUCTIONS[w]) out.push(...REDUCTIONS[w].split(' '));
    else out.push(w);
  }
  return out;
}

export function levenshtein(a, b) {
  if (a === b) return 0;
  const m = a.length;
  const n = b.length;
  let prev = Array.from({ length: n + 1 }, (_, j) => j);
  for (let i = 1; i <= m; i++) {
    const cur = [i];
    for (let j = 1; j <= n; j++) {
      cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    }
    prev = cur;
  }
  return prev[n];
}

function wordSim(a, b) {
  if (a === b) return 1;
  const strip = (w) => w.replace(/'/g, '');
  if (strip(a) === strip(b)) return 1;
  if (a.length >= 4 && b.length >= 4) {
    const d = levenshtein(a, b);
    if (d === 1) return 0.5; // "close": plural / tense / one sound off
  }
  return 0;
}

/**
 * Align target words to heard words (weighted LCS).
 * Returns { words:[{w, status:'ok'|'close'|'miss'}], score 0..1, extra:number }
 */
export function compare(target, heard) {
  const T = normalize(target);
  const H = normalize(heard);
  const m = T.length;
  const n = H.length;
  if (!m) return { words: [], score: 0, extra: n };
  const dp = Array.from({ length: m + 1 }, () => new Float64Array(n + 1));
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      const s = wordSim(T[i - 1], H[j - 1]);
      dp[i][j] = Math.max(dp[i - 1][j], dp[i][j - 1], s ? dp[i - 1][j - 1] + s : 0);
    }
  }
  const status = new Array(m).fill('miss');
  let i = m;
  let j = n;
  let used = 0;
  while (i > 0 && j > 0) {
    const s = wordSim(T[i - 1], H[j - 1]);
    if (s && Math.abs(dp[i][j] - (dp[i - 1][j - 1] + s)) < 1e-9) {
      status[i - 1] = s === 1 ? 'ok' : 'close';
      used++;
      i--;
      j--;
    } else if (dp[i - 1][j] >= dp[i][j - 1]) i--;
    else j--;
  }
  const score = dp[m][n] / m;
  return { words: T.map((w, k) => ({ w, status: status[k] })), score, extra: Math.max(0, n - used) };
}

/** Try every recognition alternative and keep the best match. */
export function bestCompare(target, alternatives) {
  let best = { words: normalize(target).map((w) => ({ w, status: 'miss' })), score: 0, extra: 0, heard: '' };
  for (const alt of alternatives || []) {
    const r = compare(target, alt);
    if (r.score > best.score || (r.score === best.score && r.extra < best.extra && best.heard)) best = { ...r, heard: alt };
  }
  if (!best.heard && alternatives && alternatives[0]) best.heard = alternatives[0];
  return best;
}

/**
 * Minimal-pair check: did they say `target` and not `other`?
 * Returns 'ok' | 'other' | 'unclear'
 */
export function pairCheck(target, other, alternatives) {
  const t = normalize(target).join(' ');
  const o = normalize(other).join(' ');
  const alts = (alternatives || []).map((a) => normalize(a).join(' '));
  const has = (alt, w) => (' ' + alt + ' ').includes(' ' + w + ' ');
  if (alts[0] && has(alts[0], t)) return 'ok';
  if (alts[0] && has(alts[0], o)) return 'other';
  if (alts.some((a) => has(a, t))) return 'ok';
  if (alts.some((a) => has(a, o))) return 'other';
  return 'unclear';
}

const FILLERS = ['um', 'uh', 'er', 'erm', 'hmm', 'like', 'basically', 'actually'];

/** Fluency stats for free talk. */
export function fluency(transcript, seconds) {
  const words = String(transcript || '').toLowerCase().replace(/[^a-z' ]+/g, ' ').split(/\s+/).filter(Boolean);
  const uniq = new Set(words).size;
  const fillers = words.filter((w) => FILLERS.includes(w)).length;
  const wpm = seconds > 0 ? Math.round((words.length / seconds) * 60) : 0;
  return { words: words.length, uniq, fillers, wpm };
}

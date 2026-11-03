// Daily Quest: a balanced ~15-minute session that rotates through every skill:
// sounds → phrases → shadowing → listening → speaking → review.
import { h, btn, zh, pick, confetti, sfx, modal } from '../ui.js';
import { finishScreen } from '../components.js';
import { state, save, today, dayRec, addCoins, srsDue } from '../state.js';
import { SOUNDS } from '../data/sounds.js';
import { SHADOW_PACKS, PROMPTS } from '../data/practice.js';
import { STORIES } from '../data/stories.js';
import { runSayList } from './common.js';
import { PHRASES } from '../data/phrases.js';
import { STICKERS } from '../data/stickers.js';
import { SCENES } from '../data/scenes.js';
import * as soundlab from './soundlab.js';
import * as phrases from './phrases.js';
import * as shadow from './shadow.js';
import * as listening from './listening.js';
import * as roleplay from './roleplay.js';
import * as freetalk from './freetalk.js';
import * as review from './review.js';

const STEP_INFO = {
  sound: { icon: '👅', en: 'Sound warm-up', zh: '发音热身' },
  phrases: { icon: '💬', en: 'New phrases', zh: '学新表达' },
  shadow: { icon: '🦜', en: 'Shadowing', zh: '影子跟读' },
  listen: { icon: '👂', en: 'Listening', zh: '听力挑战' },
  scene: { icon: '🎭', en: 'Role-play', zh: '情景对话' },
  talk: { icon: '🎙️', en: 'Free talk', zh: '自由说' },
  review: { icon: '🔁', en: 'Review', zh: '复习' },
};

function dayNumber() {
  return Math.floor(new Date(today() + 'T00:00:00').getTime() / 86400000);
}

function leastPracticed(list, prefix) {
  const scored = list.map((x) => ({ x, s: state.done[prefix + x.id] ?? -1 }));
  const min = Math.min(...scored.map((o) => o.s));
  return pick(scored.filter((o) => o.s === min)).x;
}

export function buildPlan() {
  const lvl = state.settings.level;
  const n = dayNumber();
  const units = SOUNDS.filter((s) => s.level <= Math.max(lvl, 2));
  const packs = SHADOW_PACKS.filter((p) => p.level <= lvl && p.level >= lvl - 2);
  const scenes = SCENES.filter((s) => s.level <= lvl && s.level >= lvl - 1);
  const listenKinds = lvl >= 2 ? ['story', 'dictation', 'story', 'numbers', 'story', 'realspeed', 'cancant'] : ['story', 'numbers', 'story', 'dictation'];
  const kind = listenKinds[n % listenKinds.length];
  const listenStep = { type: 'listen', kind };
  if (kind === 'story') listenStep.id = pick(listening.storiesForLevel()).id;

  const steps = [
    { type: 'sound', id: leastPracticed(units, 'sound:').id },
    { type: 'phrases', ids: phrases.newPhrases(3).map((p) => p.id) },
    { type: 'shadow', id: leastPracticed(packs.length ? packs : SHADOW_PACKS.filter((p) => p.level <= lvl + 1), 'shadow:').id },
    listenStep,
    n % 2 === 0 && scenes.length
      ? { type: 'scene', id: leastPracticed(scenes, 'scene:').id }
      : { type: 'talk', q: pick(freetalk.promptsForLevel()).q },
  ];
  if (srsDue(1).length) steps.push({ type: 'review' });
  return { date: today(), steps: steps.map((s) => ({ ...s, done: false })) };
}

function currentPlan() {
  if (!state.plan || state.plan.date !== today()) {
    state.plan = buildPlan();
    save();
  }
  return state.plan;
}

async function runStep(root, step) {
  switch (step.type) {
    case 'sound': return soundlab.runDaily(root, SOUNDS.find((s) => s.id === step.id));
    case 'phrases': {
      let list = step.ids.map((id) => PHRASES.find((p) => p.id === id)).filter(Boolean);
      if (!list.length) list = phrases.newPhrases(3);
      return phrases.runLearn(root, list);
    }
    case 'shadow': return runSayList(root, shadow.packItems(SHADOW_PACKS.find((p) => p.id === step.id), 4), { title: '🦜 Shadowing', act: 'shadow' });
    case 'listen':
      if (step.kind === 'story') return listening.runStory(root, STORIES.find((s) => s.id === step.id));
      if (step.kind === 'dictation') return listening.runDictation(root, listening.dictationItems(4));
      if (step.kind === 'numbers') return listening.runNumbers(root, 6);
      if (step.kind === 'realspeed') return listening.runRealSpeed(root, 6);
      return listening.runCanCant(root, 6);
    case 'scene': return roleplay.runScene(root, SCENES.find((s) => s.id === step.id));
    case 'talk': {
      const p = PROMPTS.find((x) => x.q === step.q) || pick(freetalk.promptsForLevel());
      const secs = state.settings.level <= 2 ? 30 : 60;
      return freetalk.runTalk(root, p, secs);
    }
    case 'review': {
      const due = srsDue(8);
      if (!due.length) return { score: 1, xp: 0 };
      return review.runReview(root, due);
    }
    default: return { score: 1, xp: 0 };
  }
}

function stepLabel(step) {
  const info = STEP_INFO[step.type === 'scene' ? 'scene' : step.type];
  let detail = '';
  if (step.type === 'sound') detail = SOUNDS.find((s) => s.id === step.id)?.title;
  if (step.type === 'shadow') detail = SHADOW_PACKS.find((p) => p.id === step.id)?.title;
  if (step.type === 'scene') detail = SCENES.find((s) => s.id === step.id)?.title;
  if (step.type === 'listen') detail = { story: 'Story', dictation: 'Dictation', numbers: 'Number Ninja', realspeed: 'Real Speed', cancant: 'Can or Can\'t' }[step.kind];
  if (step.type === 'talk') detail = step.q;
  return { ...info, detail };
}

export function page(root, nav) {
  nav.title("Today's Quest 每日任务");
  const plan = currentPlan();
  const doneCount = plan.steps.filter((s) => s.done).length;
  const allDone = doneCount === plan.steps.length;
  const nextIdx = plan.steps.findIndex((s) => !s.done);

  const path = h('div', { class: 'quest-path' }, plan.steps.map((s, i) => {
    const l = stepLabel(s);
    return h('div', { class: 'quest-step' + (s.done ? ' done' : '') + (i === nextIdx ? ' current' : '') },
      h('div', { class: 'quest-dot' }, s.done ? '✓' : l.icon),
      h('div', { class: 'quest-body' }, h('b', {}, l.en), ' ', zh(l.zh), l.detail ? h('div', { class: 'muted small' }, l.detail) : null),
      s.done && s.score != null ? h('div', { class: 'stars small' }, '★'.repeat(Math.max(1, Math.round(s.score * 3)))) : null);
  }));

  const go = btn(doneCount ? '▶ Continue 继续' : '▶ Start 开始', async () => {
    const step = plan.steps[nextIdx];
    const r = await runStep(root, step);
    step.done = true;
    step.score = Math.round((r?.score ?? 1) * 100) / 100;
    save();
    const coins = Math.max(1, Math.round((r?.xp || 0) / 5));
    addCoins(coins);
    const finishedAll = plan.steps.every((s) => s.done);
    finishScreen(root, {
      score: r?.score ?? 1, xp: r?.xp ?? 0,
      title: finishedAll ? 'Quest complete! 🏆' : `Step ${nextIdx + 1} done!`,
      extra: h('div', {}, h('p', {}, `🪙 +${coins}`), r?.summary || null),
      onDone: () => (finishedAll ? reward(nav) : nav.go('daily', {}, true)),
    });
  }, 'primary big');

  root.replaceChildren(
    h('div', { class: 'quest-head' },
      h('div', { class: 'mascot bounce' }, '🦜'),
      h('div', {}, h('b', {}, allDone ? 'All done for today! 🎉' : `Step ${doneCount + 1} of ${plan.steps.length}`),
        h('div', {}, zh(allDone ? '今天的任务全部完成！明天见～ 也可以去自由练习。' : '大约 15 分钟。每完成一步都能拿星星和金币，全部完成开宝箱！')))),
    path,
    allDone ? btn('🎁 Bonus: one more scene 再来一个情景', () => nav.go('roleplay'), 'soft wide') : h('div', { class: 'row center' }, go));
}

async function reward(nav) {
  const d = dayRec();
  if (d.quest) return nav.go('home');
  d.quest = true;
  const owned = new Set(state.stickers);
  const avail = STICKERS.filter((s) => !owned.has(s.id));
  const sticker = avail.length ? pick(avail) : null;
  if (sticker) state.stickers.push(sticker.id);
  save();
  addCoins(20);
  confetti(120);
  sfx.win();
  await modal(h('div', { class: 'center' },
    h('div', { class: 'chest' }, '🎁'),
    h('h2', {}, 'Treasure chest!'),
    sticker ? h('div', {}, h('div', { class: 'sticker-big' }, sticker.e), h('p', {}, 'New sticker: ', h('b', {}, sticker.name))) : h('p', {}, 'You collected every sticker! 🏆'),
    h('p', {}, '🪙 +20 coins'),
    zh('连续每天完成任务，火苗🔥会越来越大！')), [{ label: 'Awesome! 🎉', value: true, cls: 'primary' }]);
  nav.go('home');
}

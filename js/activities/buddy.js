// AI Buddy: open-ended spoken conversation with Kingsley, powered by Claude.
// Optional — a parent enters their own Anthropic API key in the Parent Zone.
// The key stays in this browser (localStorage) and is sent only to the Anthropic API.
import { h, btn, zh, sfx } from '../ui.js';
import { speak, recognize, hasASR, stopSpeaking } from '../speech.js';
import { sayCard } from '../components.js';
import { state, addXP } from '../state.js';
import { LEVELS } from '../data/levels.js';
import { BUDDY_TOPICS } from '../data/practice.js';

const SDK_URL = 'https://cdn.jsdelivr.net/npm/@anthropic-ai/sdk@0.137.0/+esm';
const MAX_TURNS = 40;
// Models that support the server-side refusal fallback parameter.
const FALLBACK_MODELS = ['claude-opus-5-5', 'claude-sonnet-5-5'];

let sdk = null;
async function client() {
  if (!sdk) sdk = (await import(SDK_URL)).default;
  return { Anthropic: sdk, api: new sdk({ apiKey: state.settings.apiKey, dangerouslyAllowBrowser: true }) };
}

function systemPrompt(topic) {
  const lv = LEVELS.find((l) => l.n === state.settings.level) || LEVELS[0];
  const name = state.settings.kidName ? `The child's nickname is ${state.settings.kidName}.` : '';
  const short = state.settings.level <= 2
    ? 'Use simple, common words and short sentences (about 15 words or fewer per reply).'
    : state.settings.level <= 4
      ? 'Use natural everyday words; replies of 1-3 sentences.'
      : 'Talk like a friendly, articulate American teenager or young adult; replies of 2-4 sentences, and feel free to use idioms and phrasal verbs.';
  return `You are Kingsley, a funny, warm parrot who wears a little crown. You are an English conversation buddy for a Chinese child who is learning to speak natural American English. ${name}
The child's level is ${lv.n} of 6 ("${lv.name}"): ${lv.goal}

How to talk:
- Speak natural, everyday spoken American English, the way a friendly American kid or older sibling really talks: contractions, common expressions ("No way!", "That's awesome", "I'm down"), never textbook-stiff.
- ${short}
- End almost every reply with one easy, open question so the child keeps talking. Show real interest in their answers.
- Your reply is read aloud by text-to-speech: plain text only. No emojis, no markdown, no lists, no stage directions.
- The child's words come from speech recognition, so ignore missing punctuation and small recognition errors and guess what they meant.

Helping them improve:
- Never lecture or say "that's wrong". If they make a mistake, naturally use the correct form in your reply (a recast).
- If their last message had a mistake, or there is a clearly more natural way a native speaker would say it, add ONE final line in exactly this format:
TIP: <the natural English sentence> | <a very short explanation in simple Chinese>
- If their message was already natural, do not add a TIP line.
- If they write in Chinese or seem stuck, give them a simple English sentence they could say, as a TIP line.

Safety:
- Keep everything kind, positive and appropriate for a child. Never ask for personal information such as full name, address, school name, phone number or photos. If the conversation drifts somewhere inappropriate, cheerfully change the subject.

Today's conversation topic: ${topic}. You speak first: greet them and start the topic with a fun question.`;
}

function parseReply(text) {
  const lines = text.trim().split('\n');
  let tip = null;
  const keep = [];
  for (const line of lines) {
    const m = line.match(/^\s*TIP:\s*(.+)$/i);
    if (m) {
      const [en, z] = m[1].split('|').map((s) => s.trim());
      tip = { en, zh: z || '' };
    } else keep.push(line);
  }
  return { say: keep.join(' ').replace(/\s+/g, ' ').trim(), tip };
}

async function ask(messages, topic) {
  const { Anthropic, api } = await client();
  const model = state.settings.model || 'claude-opus-5-5';
  const params = {
    model,
    max_tokens: 2048,
    system: systemPrompt(topic),
    messages,
    output_config: { effort: 'low' },
  };
  try {
    const resp = FALLBACK_MODELS.includes(model)
      ? await api.beta.messages.create({ ...params, betas: ['server-side-fallback-2026-07-01'], fallbacks: 'default' })
      : await api.messages.create(params);
    if (resp.stop_reason === 'refusal') return { text: "Hmm, let's talk about something else! What's your favorite thing to do on weekends?" };
    const text = resp.content.filter((b) => b.type === 'text').map((b) => b.text).join('\n');
    return { text };
  } catch (e) {
    if (e instanceof Anthropic.AuthenticationError) return { error: 'API Key 无效，请爸爸妈妈在"家长中心"检查。' };
    if (e instanceof Anthropic.PermissionDeniedError) return { error: '这个 API Key 没有权限使用所选模型。' };
    if (e instanceof Anthropic.NotFoundError) return { error: '找不到所选模型，请在家长中心换一个模型。' };
    if (e instanceof Anthropic.RateLimitError) return { error: '请求太频繁或额度用完了，稍后再试。' };
    if (e instanceof Anthropic.APIConnectionError) return { error: '连不上 Claude 服务器。请检查网络（需要能访问 api.anthropic.com）。' };
    if (e instanceof Anthropic.APIError) return { error: `服务出错（${e.status}）：${e.message}` };
    return { error: '出错了：' + (e?.message || e) };
  }
}

export function page(root, nav) {
  nav.title('AI Buddy 和 Kingsley 聊天');
  if (!state.settings.apiKey) {
    root.replaceChildren(h('div', { class: 'tip-card' },
      h('div', { class: 'tip-title' }, '🦜 Meet Kingsley, your AI buddy!'),
      h('p', {}, zh('Kingsley 是一只会聊天的 AI 鹦鹉，可以陪你用英语聊任何话题，并悄悄帮你把话说得更地道。')),
      h('p', {}, zh('需要爸爸妈妈先在"家长中心"填写 Anthropic API Key（Claude）。')),
      btn('👨‍👩‍👧 Parent Zone 家长中心', () => nav.go('parent'), 'primary')));
    return;
  }
  root.replaceChildren(
    h('p', { class: 'intro' }, zh('选一个话题，和 Kingsley 用英语聊天吧！它会用地道的美式英语回答你，还会给你"Native Tip"。')),
    h('div', { class: 'grid' }, BUDDY_TOPICS.map((t) => h('button', { class: 'tile', type: 'button', onclick: () => chat(root, nav, t.en) },
      h('div', { class: 'tile-icon' }, t.icon), h('div', { class: 'tile-title' }, t.en), zh(t.zh, 'tile-zh')))));
}

async function chat(root, nav, topic) {
  const messages = [{ role: 'user', content: '(The child has joined. Please start the conversation.)' }];
  let turns = 0;
  const log = h('div', { class: 'chat' });
  const live = h('div', { class: 'live' });
  const status = h('div', { class: 'muted small center' });
  const input = h('input', { class: 'chat-input', placeholder: 'Or type here…', autocapitalize: 'off' });
  const sendTyped = btn('Send', () => {
    if (input.value.trim()) userSays(input.value.trim());
    input.value = '';
  }, 'soft');
  input.addEventListener('keydown', (e) => e.key === 'Enter' && sendTyped.click());
  const mic = btn('🎤 Talk', async () => {
    mic.disabled = true;
    mic.classList.add('listening');
    mic.textContent = '👂 Listening…';
    const { alts, error } = await recognize({ onInterim: (t) => (live.textContent = t), timeout: 20000 });
    mic.classList.remove('listening');
    mic.textContent = '🎤 Talk';
    live.textContent = '';
    if (error) {
      mic.disabled = false;
      status.textContent = `语音识别出错（${error}），可以打字。`;
      return;
    }
    if (!alts.length) {
      mic.disabled = false;
      status.textContent = "Didn't catch that — try again! 没听清，再说一次～";
      return;
    }
    userSays(alts[0]);
  }, 'primary big');
  const end = btn('🏁 End chat', () => {
    stopSpeaking();
    const xp = addXP(5 + turns * 4, 'buddy');
    sfx.win();
    root.replaceChildren(h('div', { class: 'finish' }, h('div', { class: 'mascot big bounce' }, '🦜'),
      h('h2', {}, 'Great chat!'), h('p', {}, `You talked ${turns} times. +${xp} XP`),
      btn('Continue ➜', () => nav.go('buddy', {}, true), 'primary big')));
  }, 'soft small');

  root.replaceChildren(h('div', { class: 'activity' },
    h('div', { class: 'row' }, h('b', {}, '🦜 ', topic), h('span', { class: 'grow' }), end),
    log, status,
    h('div', { class: 'reply-panel' }, h('div', { class: 'row center' }, hasASR ? mic : null), live, h('div', { class: 'row' }, input, sendTyped))));

  function bubble(who, text, extra) {
    const b = h('div', { class: `bubble ${who}` }, h('div', { class: 'bubble-text' }, text), extra || null);
    log.appendChild(b);
    b.scrollIntoView({ behavior: 'smooth', block: 'end' });
  }

  async function botTurn() {
    mic.disabled = true;
    status.textContent = 'Kingsley is thinking… 🤔';
    const r = await ask(messages, topic);
    status.textContent = '';
    mic.disabled = false;
    if (r.error) {
      // keep the conversation as is so the same turn can simply be retried
      status.replaceChildren(h('span', { class: 'warn' }, r.error), ' ', btn('🔁 Retry', () => botTurn(), 'chip tiny'));
      return;
    }
    messages.push({ role: 'assistant', content: r.text });
    const { say, tip } = parseReply(r.text);
    if (tip && log.lastChild) {
      const card = h('div', { class: 'native-tip' },
        h('div', {}, '💡 Native tip: ', h('b', {}, tip.en), ' ', btn('🔊', () => speak(tip.en), 'chip tiny')),
        tip.zh ? zh(tip.zh, 'small') : null,
        btn('🎤 Practice it', (e) => {
          e.target.replaceWith(sayCard({ text: tip.en, onScore: (s) => s >= 0.8 && addXP(2, 'buddy') }).node);
        }, 'chip tiny'));
      log.lastChild.appendChild(card);
    }
    bubble('bot', say, btn('🔊', () => speak(say, { voice: 'alt' }), 'chip tiny'));
    await speak(say, { voice: 'alt' });
  }

  async function userSays(text) {
    if (turns >= MAX_TURNS) {
      status.textContent = 'That was a long chat! Time for a break. 聊了很久啦，休息一下吧！';
      return;
    }
    turns++;
    bubble('kid', text);
    messages.push({ role: 'user', content: text });
    await botTurn();
  }

  botTurn();
}

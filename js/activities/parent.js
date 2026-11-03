// Parent Zone: progress dashboard, recordings, settings, data backup.
import { h, btn, zh, modal, toast } from '../ui.js';
import { state, save, today, addDays, streak, srsStats, exportData, importData, rank } from '../state.js';
import { americanVoices, voicesReady, speak, listRecordings, deleteRecording, playBlob, hasASR, hasRecorder } from '../speech.js';
import { LEVELS } from '../data/levels.js';
import { SCENES } from '../data/scenes.js';
import { STORIES } from '../data/stories.js';

let unlocked = false;

export async function page(root, nav) {
  nav.title('Parent Zone 家长中心');
  if (!unlocked) {
    const a = 6 + Math.floor(Math.random() * 4);
    const b = 6 + Math.floor(Math.random() * 4);
    const input = h('input', { type: 'number', inputmode: 'numeric', class: 'gate-input' });
    const ok = await modal(h('div', {}, h('h3', {}, '家长验证'), h('p', {}, `${a} × ${b} = ?`), input),
      [{ label: '取消', value: false }, { label: '进入', value: true, cls: 'primary' }]);
    if (!ok || Number(input.value) !== a * b) {
      toast('答案不对哦');
      return nav.go('home');
    }
    unlocked = true;
  }
  root.replaceChildren(h('div', { class: 'parent' }, dashboard(), calendar(), recordingsBox(), settingsBox(nav), adviceBox(), dataBox(nav)));
}

function minutes(sec) {
  return Math.round(sec / 60);
}

function dashboard() {
  const days = Object.entries(state.days);
  const total = days.reduce((a, [, d]) => a + d.sec, 0);
  let week = 0;
  for (let i = 0; i < 7; i++) week += state.days[addDays(today(), -i)]?.sec || 0;
  const s = srsStats();
  const r = rank();
  const scenesDone = SCENES.filter((x) => state.done['scene:' + x.id]).length;
  const storiesDone = STORIES.filter((x) => state.done['story:' + x.id]).length;
  const talks = state.talks;
  const recent = talks.slice(-5);
  const avgWpm = recent.length ? Math.round(recent.reduce((a, t) => a + t.wpm, 0) / recent.length) : 0;
  const first = talks.slice(0, 5);
  const firstWpm = first.length ? Math.round(first.reduce((a, t) => a + t.wpm, 0) / first.length) : 0;
  const card = (n, en, z) => h('div', { class: 'stat' }, h('div', { class: 'stat-n' }, String(n)), h('div', { class: 'small' }, en), h('div', { class: 'small muted' }, z));
  return h('section', { class: 'panel' },
    h('h3', {}, '📊 学习概况'),
    h('div', { class: 'stat-row' },
      card('🔥 ' + streak(), 'day streak', '连续天数'),
      card(minutes(week), 'min this week', '本周分钟'),
      card(minutes(total), 'min total', '累计分钟'),
      card(r.icon + ' ' + state.xp, r.name, '经验 · ' + r.zh)),
    h('div', { class: 'stat-row' },
      card(s.total, 'phrases/sentences', '已学表达'),
      card(s.mastered, 'mastered', '已牢固掌握'),
      card(`${scenesDone}/${SCENES.length}`, 'scenes', '情景对话'),
      card(`${storiesDone}/${STORIES.length}`, 'stories', '听力故事')),
    talks.length ? h('p', {}, `🎙️ 自由说：最近 5 次平均语速 ${avgWpm} 词/分钟（最早 5 次：${firstWpm}）。参考：母语儿童日常聊天约 110–150 词/分钟。`) : h('p', { class: 'muted' }, '还没有"自由说"记录。'),
    !hasASR ? h('p', { class: 'warn' }, '⚠️ 当前浏览器不支持语音识别，口语将使用"录音+自评"模式。推荐使用 Chrome / Edge（电脑、安卓）或 iPhone/iPad 的 Safari。') : null,
    !hasRecorder ? h('p', { class: 'warn' }, '⚠️ 当前浏览器不支持录音回放。') : null);
}

function calendar() {
  const goal = state.settings.dailyGoal * 60;
  const cells = [];
  const start = addDays(today(), -7 * 8 + 1);
  // align to Sunday
  const [y, m, d] = start.split('-').map(Number);
  const offset = new Date(y, m - 1, d).getDay();
  let key = addDays(start, -offset);
  while (key <= today()) {
    const rec = state.days[key];
    const sec = rec?.sec || 0;
    const lvl = !rec ? 0 : rec.quest || sec >= goal ? 4 : sec >= goal * 0.6 ? 3 : sec >= goal * 0.3 ? 2 : sec > 0 ? 1 : 0;
    cells.push(h('div', { class: `cal c${lvl}`, title: `${key}: ${minutes(sec)} 分钟${rec?.quest ? ' ✓任务' : ''}` }));
    key = addDays(key, 1);
  }
  return h('section', { class: 'panel' },
    h('h3', {}, '📅 最近 8 周'),
    h('div', { class: 'cal-grid' }, cells),
    h('div', { class: 'muted small' }, `颜色越深练得越多；最深 = 完成每日任务或达到每日目标（${state.settings.dailyGoal} 分钟）。`));
}

function recordingsBox() {
  const box = h('div', {}, h('p', { class: 'muted' }, '加载中…'));
  listRecordings().then((list) => {
    if (!list.length) return box.replaceChildren(h('p', { class: 'muted' }, '还没有录音。孩子做"自由说"时会自动保存（只保存在本设备）。'));
    box.replaceChildren(...list.slice(0, 15).map((r) => {
      const row = h('div', { class: 'rec-row' },
        h('div', { class: 'grow' },
          h('div', {}, new Date(r.at).toLocaleString(), ' · ', `${r.sec || '?'}秒`, r.wpm ? ` · ${r.wpm} 词/分` : ''),
          h('div', { class: 'small muted' }, r.title || ''),
          r.text ? h('details', {}, h('summary', { class: 'small' }, '识别文字'), h('p', { class: 'small' }, r.text)) : null),
        btn('▶', () => playBlob(r.blob), 'chip'),
        btn('🗑', async () => {
          await deleteRecording(r.id);
          row.remove();
        }, 'chip'));
      return row;
    }));
  });
  return h('section', { class: 'panel' }, h('h3', {}, '🎧 孩子的录音'), box);
}

function field(label, control, hint) {
  return h('label', { class: 'field' }, h('span', { class: 'field-label' }, label), control, hint ? h('span', { class: 'muted small' }, hint) : null);
}

function settingsBox(nav) {
  const s = state.settings;
  const set = (k, v) => {
    s[k] = v;
    save();
    document.body.classList.toggle('no-zh', !s.showZh);
  };

  const name = h('input', { value: s.kidName, placeholder: '例如 Leo', oninput: (e) => set('kidName', e.target.value.trim()) });
  const level = h('select', { onchange: (e) => { set('level', Number(e.target.value)); state.plan = null; save(); } },
    LEVELS.map((l) => h('option', { value: l.n, selected: l.n === s.level }, `${l.icon} L${l.n} ${l.name} ${l.zh}（${l.age}）`)));
  const levelInfo = h('div', { class: 'muted small' }, LEVELS.find((l) => l.n === s.level)?.goal);
  level.addEventListener('change', () => (levelInfo.textContent = LEVELS.find((l) => l.n === s.level)?.goal));

  const voiceSel = h('select', { onchange: (e) => set('voiceURI', e.target.value) }, h('option', {}, '加载中…'));
  voicesReady().then(() => {
    const vs = americanVoices();
    voiceSel.replaceChildren(...(vs.length ? vs : []).map((v) => h('option', { value: v.voiceURI, selected: v.voiceURI === s.voiceURI }, `${v.name}${v.localService ? '' : ' (online)'}`)));
    if (!vs.length) voiceSel.replaceChildren(h('option', {}, '未找到美式英语语音'));
  });
  const rate = h('input', { type: 'range', min: '0.7', max: '1.2', step: '0.05', value: s.rate, oninput: (e) => set('rate', Number(e.target.value)) });
  const goal = h('select', { onchange: (e) => set('dailyGoal', Number(e.target.value)) }, [10, 15, 20, 30].map((m) => h('option', { value: m, selected: m === s.dailyGoal }, `${m} 分钟`)));
  const showZh = h('input', { type: 'checkbox', checked: s.showZh, onchange: (e) => set('showZh', e.target.checked) });

  const key = h('input', { type: 'password', value: s.apiKey, placeholder: 'sk-ant-…', autocomplete: 'off', oninput: (e) => set('apiKey', e.target.value.trim()) });
  const model = h('select', { onchange: (e) => set('model', e.target.value) },
    [['claude-opus-5-5', 'Claude Opus 5.5（默认，最聪明）'], ['claude-sonnet-5-5', 'Claude Sonnet 5.5（更快更便宜）'], ['claude-haiku-5-5', 'Claude Haiku 5.5（最便宜，适合大量聊天）']]
      .map(([v, l]) => h('option', { value: v, selected: v === s.model }, l)));

  return h('section', { class: 'panel' },
    h('h3', {}, '⚙️ 设置'),
    field('孩子的英文昵称', name, 'AI 伙伴会这样称呼孩子（可不填）'),
    field('难度等级', level, null), levelInfo,
    field('朗读声音（美式）', h('div', { class: 'row' }, voiceSel, btn('试听', () => speak('Hi! I\'m Kingsley. Let\'s practice English together!'), 'chip')),
      '建议选带 Natural / Enhanced / Premium / Google 字样的声音，更自然。iPhone 可在"设置→辅助功能→朗读内容→声音"下载增强版英语(美国)声音。'),
    field('语速', rate, '0.95 为默认；初学可调慢'),
    field('每日目标', goal),
    field('显示中文提示', showZh, '孩子水平提高后可关闭，进入"全英文沉浸模式"'),
    h('h4', {}, '🤖 AI 伙伴（可选）'),
    h('p', { class: 'small muted' }, 'AI 伙伴使用 Anthropic 的 Claude 模型进行开放式英语对话。需要你自己的 API Key（在 console.anthropic.com 创建，按用量付费）。Key 只保存在本浏览器中，只会发送给 Anthropic API。网络需要能访问 api.anthropic.com。建议在 Anthropic 控制台为这个 Key 设置每月消费上限。'),
    field('Anthropic API Key', key),
    field('模型', model));
}

function adviceBox() {
  const tips = [
    ['每天 15 分钟 > 每周一次 2 小时', '语言是"肌肉记忆"，高频短时最有效。固定时间（如晚饭后）做每日任务，养成习惯。'],
    ['先听后说，大量输入', '母语者是先听了几千小时才开口的。除了本工具，每天让孩子看 20–30 分钟英文动画/儿童节目（如 Bluey、Wild Kratts、Magic School Bus，大一点看 Avatar、Brain Games），关掉中文字幕。'],
    ['模仿语调比单词更重要', '"影子跟读"时提醒孩子像演员一样模仿情绪、快慢和连读，而不是一个词一个词地念。'],
    ['不纠正每个错误', '孩子说错时，用正确的方式自然重复一遍就好（"I goed to the park!" → "Oh, you went to the park? Cool!"）。保护开口的勇气最重要。'],
    ['多夸努力，少夸聪明', '"你今天练了 20 分钟，真坚持！"比"你真聪明"更能让孩子长期坚持。'],
    ['随年龄升级', '每 3–6 个月看一下孩子的情况，在上面"难度等级"中调高一级。到 L4 以后可以关闭中文提示，进入全英文模式。'],
    ['找真实的交流对象', '如果条件允许，每周 1–2 次与母语者（外教、美国小朋友笔友视频）交流，把练习的内容真正用起来。'],
  ];
  return h('section', { class: 'panel' }, h('h3', {}, '💡 给家长的建议（来自语言习得研究）'),
    tips.map(([t, d]) => h('div', { class: 'advice' }, h('b', {}, t), h('p', {}, d))));
}

function dataBox(nav) {
  const file = h('input', { type: 'file', accept: 'application/json', hidden: true });
  file.addEventListener('change', async () => {
    const f = file.files[0];
    if (!f) return;
    try {
      importData(await f.text());
      toast('已恢复学习记录');
      nav.go('home');
    } catch {
      toast('文件格式不对');
    }
  });
  return h('section', { class: 'panel' }, h('h3', {}, '💾 数据'),
    h('p', { class: 'small muted' }, '学习记录保存在本浏览器中。换设备前请先导出备份，在新设备导入。'),
    h('div', { class: 'row wrap' },
      btn('⬇️ 导出备份', () => {
        const blob = new Blob([exportData()], { type: 'application/json' });
        const a = h('a', { href: URL.createObjectURL(blob), download: `spokenlikeking-${today()}.json` });
        document.body.appendChild(a);
        a.click();
        a.remove();
      }, 'soft'),
      btn('⬆️ 导入备份', () => file.click(), 'soft'),
      btn('🗑 清空所有记录', async () => {
        const ok = await modal(h('p', {}, '确定要清空所有学习记录吗？此操作无法撤销。'), [{ label: '取消', value: false }, { label: '清空', value: true, cls: 'danger' }]);
        if (ok) {
          localStorage.removeItem('slk.v1');
          location.reload();
        }
      }, 'soft')),
    file);
}

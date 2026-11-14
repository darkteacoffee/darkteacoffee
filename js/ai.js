// AI 回顾：组装提示词、调用接口、逐字接收。

export const PERSONAS = [
  {
    id: 'oldfriend',
    name: '毒舌老朋友',
    desc: '说真话，不惯着',
    prompt:
      '你是一个认识我很多年、说话很直的老朋友。你不绕弯子，会直接指出我在自欺、在拖、在给自己找台阶的地方，但从不当众羞辱我，也不刻薄取笑。句子短，语气像损友，偶尔带一点调侃，但收尾是站在我这边。',
  },
  {
    id: 'gentle',
    name: '温柔倾听者',
    desc: '先接住情绪',
    prompt:
      '你是一个不会评判我的朋友。你先把这几天我真正在意的东西、没说出口的情绪说出来，让我觉得被听见。不急着给建议，不急着让我振作。语气温和、慢，像深夜聊天。只在最后轻轻问一句。',
  },
  {
    id: 'analyst',
    name: '冷静分析师',
    desc: '只看模式和趋势',
    prompt:
      '你是一个冷静的观察者。你只关心模式、频率、前后变化和时间分布，用事实说话，指出反复出现的东西和它出现的条件。不做情绪安慰，不说鼓励的话。可以直接给数字和对比。',
  },
  {
    id: 'coach',
    name: '教练',
    desc: '给能做的事',
    prompt:
      '你是一个务实的教练。你看我卡在哪，然后给出最多两件具体、今天就能做的小事，并说清为什么是这两件。不要空泛的鼓励，不要列十条建议，不要用"加油"这类词。',
  },
  {
    id: 'custom',
    name: '自定义',
    desc: '你自己写',
    prompt: '',
  },
];

const HARD_RULES = `硬性要求（不管你扮演谁，都必须遵守）：
1. 只能依据下面提供的日记原文说话。不要编造任何事件、人物、数字、时间或感受。日记里没写的，不要当成事实。
2. 每一条判断后面用【MM-DD】标出依据的日期，例如：你这周睡得都不太好【11-09】【11-11】。没有依据的判断不要写。
3. 材料太少就说"这几天记录太少，看不出趋势"，不要硬凑意义，也不要为了显得有用而编一个主题出来。
4. 允许推测，但要明确写成"我猜"或"看起来像"，不能伪装成事实。
5. 你不是医生，也不是心理咨询师。不要做任何疾病或心理障碍的判断，不要用"抑郁""焦虑症"这类词给人下结论。
6. 如果日记里出现自伤、自杀、被伤害这类内容，平静地提醒他去联系信任的人或寻求专业帮助，不要展开描写，也不要说教。
7. 用中文，直接称"你"。不要大段复述日记原文，引用只保留几个字。
8. 不要写"首先/其次/总之""综上所述"这类八股。
9. 不要说"作为AI""我无法"这类话。
10. 不要结尾总结、不要喊口号、不要"希望你能……"式的鸡汤。说完就停。
11. 宁短勿长。一句话能说清楚的，不要写成三句。`;

export const LENGTH_RULES = {
  short: '篇幅：总共不超过 120 字，最多两段。能用一句话说完就用一句话，不铺垫、不复述。',
  normal: '篇幅：总共不超过 250 字，最多三段。',
  long: '篇幅：可以写到 600 字，但不要注水，不要为了凑字数重复。',
};

/** 常见服务商。换一家只要选一下，地址不用记。 */
export const PROVIDERS = [
  {
    id: 'deepseek',
    name: 'DeepSeek',
    base: 'https://api.deepseek.com',
    models: ['deepseek-chat', 'deepseek-reasoner'],
  },
  {
    id: 'zhipu',
    name: '智谱 GLM',
    base: 'https://open.bigmodel.cn/api/paas/v4',
    models: ['glm-4-plus', 'glm-4-air', 'glm-4-flash'],
  },
  {
    id: 'moonshot',
    name: '月之暗面 Kimi',
    base: 'https://api.moonshot.cn/v1',
    models: ['moonshot-v1-8k', 'moonshot-v1-32k', 'moonshot-v1-128k'],
  },
  {
    id: 'dashscope',
    name: '阿里通义千问',
    base: 'https://dashscope.aliyuncs.com/compatible-mode/v1',
    models: ['qwen-plus', 'qwen-max', 'qwen-turbo'],
  },
  {
    id: 'siliconflow',
    name: '硅基流动',
    base: 'https://api.siliconflow.cn/v1',
    models: ['deepseek-ai/DeepSeek-V3'],
  },
  {
    id: 'openai',
    name: 'OpenAI',
    base: 'https://api.openai.com/v1',
    models: ['gpt-4o-mini', 'gpt-4o'],
  },
  {
    id: 'custom',
    name: '自定义 / 本地',
    base: '',
    models: [],
  },
];

export function guessProvider(baseUrl) {
  const base = String(baseUrl || '').replace(/\/+$/, '').toLowerCase();
  const hit = PROVIDERS.find((p) => p.id !== 'custom' && p.base && p.base.toLowerCase() === base);
  return hit ? hit.id : 'custom';
}

export class ApiError extends Error {
  constructor(status, detail, friendly) {
    super(friendly || detail || '请求失败');
    this.status = status;
    this.detail = detail;
    this.friendly = friendly;
  }
}

const STATUS_HINT = {
  400: '请求格式被拒绝了，可能是模型名写错了',
  401: 'API Key 不对或已经失效',
  402: '账户余额不足',
  403: '没有权限使用这个模型',
  404: '接口地址不对，检查一下「接口地址」这一栏',
  422: '参数不对',
  429: '请求太频繁，等一会儿再试',
  500: '对方服务器出错了，稍后再试',
  502: '对方服务器出错了，稍后再试',
  503: '对方服务器忙，稍后再试',
};

export function normalizeEndpoint(baseUrl) {
  let base = String(baseUrl || '').trim();
  if (!base) base = 'https://api.deepseek.com';
  base = base.replace(/\/+$/, '');
  if (/\/chat\/completions$/.test(base)) return base;
  return base + '/chat/completions';
}

export function getPersona(settings) {
  const ai = (settings && settings.ai) || {};
  const p = PERSONAS.find((x) => x.id === ai.personaId) || PERSONAS[0];
  const overrides = ai.personaOverrides || {};

  if (p.id === 'custom') {
    const text = String(overrides.custom ?? ai.personaText ?? '').trim();
    return {
      id: 'custom',
      name: '自定义',
      prompt: text || '你是一个平静、诚实、不啰嗦的朋友。',
      isDefault: !text,
    };
  }

  const custom = String(overrides[p.id] || '').trim();
  return { ...p, prompt: custom || p.prompt, isDefault: !custom };
}

/** 这个人在设置里被人改动过没有 */
export function personaIsEdited(settings, id) {
  const ai = (settings && settings.ai) || {};
  const overrides = ai.personaOverrides || {};
  if (id === 'custom') return String(overrides.custom ?? ai.personaText ?? '').trim().length > 0;
  return String(overrides[id] || '').trim().length > 0;
}

/** 人设的默认文本（用来「恢复默认」和预填输入框） */
export function personaDefaultText(settings, id) {
  const ai = (settings && settings.ai) || {};
  const overrides = ai.personaOverrides || {};
  if (id === 'custom') return String(overrides.custom ?? ai.personaText ?? '').trim();
  const p = PERSONAS.find((x) => x.id === id);
  return (overrides[id] || '').trim() || (p ? p.prompt : '');
}

export function buildSystemPrompt(persona, length = 'normal') {
  const len = LENGTH_RULES[length] || LENGTH_RULES.normal;
  return `你要扮演这个人：

${persona.prompt}

这个身份不是装饰。用词、句子长短、先关注什么、给不给建议、要不要反问我，都要按这个人来。
同一个问题，换一个人设说出来应该明显不一样。如果你写的东西换谁都能说，那就是没入戏。

${HARD_RULES}

${len}`;
}

/** 把条目按天分组 */
export function groupByDay(list) {
  const map = new Map();
  for (const e of list) {
    if (!map.has(e.dayKey)) map.set(e.dayKey, []);
    map.get(e.dayKey).push(e);
  }
  for (const arr of map.values()) arr.sort((a, b) => a.createdAt - b.createdAt);
  return map;
}

const MOOD_NAME = { 1: '很难受', 2: '低落', 3: '一般', 4: '还行', 5: '很好' };

/** 把日记拼成给模型看的材料 */
export function formatMaterials(grouped, { weekdayCN, timeHM, dateCN }) {
  const keys = [...grouped.keys()].sort();
  const out = [];
  for (const key of keys) {
    const items = grouped.get(key);
    out.push(`=== ${dateCN(key)} ${weekdayCN(key)} ===`);
    for (const e of items) {
      const mood = e.mood ? `　心情：${MOOD_NAME[e.mood] || ''}` : '';
      const text = (e.text || '').trim();
      out.push(`${timeHM(e.createdAt)}${mood}`);
      if (text) out.push(text);
    }
    out.push('');
  }
  return { text: out.join('\n').trim(), days: keys.length, entries: [...grouped.values()].reduce((s, a) => s + a.length, 0) };
}

const TASK_TEXT = {
  recent7:
    '回顾这七天。不要分点、不要列提纲、不要写"①②③"，用你自己的方式说我最近怎么样、有什么反复出现的东西。',
  recent30:
    '回顾这段时间。不要分点、不要列提纲，说说这段时间我大致是怎么过的、有什么反复出现的。',
  month: '回顾这个月。不要分点、不要列提纲，说说这个月我大致是怎么过的、有什么反复出现的。',
  single: '只针对这一天，说点我可能自己没注意到的东西。',
};

export function buildUserMessage({ materials, taskType, question }) {
  const head = `下面是这段时间的日记原文：\n\n${materials}\n\n`;
  if (taskType === 'question' && question && question.trim()) {
    return head + `我的问题：${question.trim()}\n\n请结合上面的日记回答，有依据才说，没依据就说没依据。`;
  }
  const task = TASK_TEXT[taskType] || TASK_TEXT.recent7;
  return head + `任务：${task}`;
}

/* ---------- 只针对某一天的评价 ---------- */

export const DAY_TASK = `就这一天，说几句。

怎么组织、用什么口气，由你的身份决定：可以直接说，可以绕一下，也可以先问我一句。
不要分点、不要写"①②③"、不要小标题、不要复述我写了什么、不要夸我。

如果这天写得太少（比如只有"好累"两个字），就直接说这天写得太少，然后问我一句。`;

export function buildDayMessages({ persona, materials, dateLabel, length = 'normal' }) {
  return [
    { role: 'system', content: buildSystemPrompt(persona, length) },
    {
      role: 'user',
      content: `这一天是 ${dateLabel}。\n\n下面是这天的日记原文：\n\n${materials}\n\n${DAY_TASK}`,
    },
  ];
}

/**
 * 流式对话。返回完整文本。
 * onDelta(deltaText, fullText) 每收到一小段就调一次。
 */
export async function streamChat({ baseUrl, apiKey, model, messages, temperature = 0.75, signal, onDelta }) {
  if (!apiKey) throw new ApiError(0, '', '还没填 API Key，去设置里贴一个');
  const url = normalizeEndpoint(baseUrl);

  let res;
  try {
    res = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: 'Bearer ' + apiKey.trim(),
      },
      body: JSON.stringify({
        model: model || 'deepseek-chat',
        messages,
        stream: true,
        temperature,
      }),
      signal,
    });
  } catch (err) {
    if (err && err.name === 'AbortError') throw err;
    throw new ApiError(0, String(err && err.message), '连不上接口，检查一下网络');
  }

  if (!res.ok) {
    let detail = '';
    try {
      detail = await res.text();
    } catch { /* 忽略 */ }
    let friendly = STATUS_HINT[res.status] || `接口返回 ${res.status}`;
    try {
      const j = JSON.parse(detail);
      if (j && j.error && j.error.message) detail = j.error.message;
    } catch { /* 不是 JSON 就算了 */ }
    if (res.status === 401) friendly = 'API Key 不对或已经失效';
    throw new ApiError(res.status, detail, friendly);
  }

  if (!res.body) throw new ApiError(0, '', '这个浏览器收不了流式回话');

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buf = '';
  let full = '';
  let finished = false;

  while (!finished) {
    const { done, value } = await reader.read();
    if (done) break;
    buf += decoder.decode(value, { stream: true });
    let nl;
    while ((nl = buf.indexOf('\n')) >= 0) {
      const line = buf.slice(0, nl).replace(/\r$/, '');
      buf = buf.slice(nl + 1);
      if (!line || !line.startsWith('data:')) continue;
      const payload = line.slice(5).trim();
      if (payload === '[DONE]') {
        finished = true;
        break;
      }
      try {
        const json = JSON.parse(payload);
        const delta = json.choices?.[0]?.delta?.content;
        if (delta) {
          full += delta;
          if (onDelta) onDelta(delta, full);
        }
      } catch {
        /* 半截 JSON，跳过 */
      }
    }
  }

  return full;
}

/** 问服务商现在有哪些模型。不支持的会报错，让用户手填。 */
export async function listModels({ baseUrl, apiKey }) {
  if (!apiKey) throw new ApiError(0, '', '还没填 API Key');
  let base = String(baseUrl || '').trim().replace(/\/+$/, '');
  base = base.replace(/\/chat\/completions$/, '');
  if (!base) throw new ApiError(0, '', '还没填接口地址');

  let res;
  try {
    res = await fetch(base + '/models', { headers: { Authorization: 'Bearer ' + apiKey.trim() } });
  } catch (err) {
    throw new ApiError(0, String(err && err.message), '连不上接口，检查一下网络');
  }
  if (!res.ok) {
    const detail = await res.text().catch(() => '');
    throw new ApiError(res.status, detail, STATUS_HINT[res.status] || '这家列不出模型，直接手填吧');
  }
  let json;
  try {
    json = await res.json();
  } catch {
    throw new ApiError(0, '', '返回的不是 JSON，这家可能不支持列模型');
  }
  const arr = Array.isArray(json.data)
    ? json.data
    : Array.isArray(json.models)
      ? json.models
      : Array.isArray(json)
        ? json
        : [];
  const ids = arr.map((m) => (typeof m === 'string' ? m : m.id || m.name || '')).filter(Boolean);
  const uniq = [...new Set(ids)];
  if (!uniq.length) throw new ApiError(0, '', '这家没返回模型列表，直接手填吧');
  return uniq;
}

/** 测试 Key 能不能用：发一条极短的请求 */export async function testConnection({ baseUrl, apiKey, model }) {
  if (!apiKey) throw new ApiError(0, '', '还没填 API Key');
  const url = normalizeEndpoint(baseUrl);
  let res;
  try {
    res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + apiKey.trim() },
      body: JSON.stringify({
        model: model || 'deepseek-chat',
        messages: [{ role: 'user', content: '回答一个字：好' }],
        max_tokens: 5,
        stream: false,
      }),
    });
  } catch (err) {
    throw new ApiError(0, String(err && err.message), '连不上接口，检查一下网络');
  }
  if (!res.ok) {
    const detail = await res.text().catch(() => '');
    throw new ApiError(res.status, detail, STATUS_HINT[res.status] || `接口返回 ${res.status}`);
  }
  return true;
}

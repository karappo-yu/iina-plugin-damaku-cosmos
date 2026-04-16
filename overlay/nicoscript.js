/**
 * nicoscript.js — Nicoscript 解析与状态管理
 *
 * 处理所有投稿者 Nicoscript：逆/速度/默认/禁止/跳转/替换/禁止拖动。
 * 对应原项目: src/utils/comment.ts (processNicoscript 相关部分)
 */

// --- Nicoscript 全局状态 ---
window.nicoScripts = {
  reverse: [],
  speed: [],
  default: [],
  ban: [],
  replace: [],
  seekDisable: [],
  jump: []
};

// --- 缓存（按 vpos 查询结果缓存，避免重复遍历） ---
let reverseActiveOwnerCache = new Map();
let reverseActiveViewerCache = new Map();
let speedActiveOwnerCache = new Map();
let speedActiveViewerCache = new Map();

/**
 * 重置所有 Nicoscript 状态（加载新弹幕时调用）
 */
window.resetNicoScripts = function () {
  nicoScripts.reverse = [];
  nicoScripts.speed = [];
  nicoScripts.default = [];
  nicoScripts.ban = [];
  nicoScripts.replace = [];
  nicoScripts.seekDisable = [];
  nicoScripts.jump = [];
  reverseActiveOwnerCache.clear();
  reverseActiveViewerCache.clear();
  speedActiveOwnerCache.clear();
  speedActiveViewerCache.clear();
};

// --- 正则 ---
const RE_REVERSE = /^@\u9006(?:\s+)?(\u5168|\u30b3\u30e1|\u6295\u30b3\u30e1)?/;
const RE_SPEED_UP = /^@\u901f\u3044/;      // @速い
const RE_SPEED_DOWN = /^@\u9045\u3044/;    // @遅い
const RE_DEFAULT = /^[@\uff20]\u30c7\u30d5\u30a9\u30eb\u30c8/;
const RE_BAN = /^[@\uff20]\u30b3\u30e1\u30f3\u30c8\u7981\u6b62/;
const RE_SEEK_DISABLE = /^[@\uff20]\u30b7\u30fc\u30af\u7981\u6b62/;
const RE_JUMP = /^[@\uff20]\u30b8\u30e3\u30f3\u30d7(?:\s+(.+))?/;
const RE_REPLACE = /^[@\uff20]\u7f6e\u63db/;

// ===================== 逆脚本 =====================

/**
 * 处理 @逆 Nicoscript
 */
window.processReverseScript = function (vpos, content, commands) {
  const reverseMatch = RE_REVERSE.exec(content);
  if (!reverseMatch) return;

  const target = reverseMatch[1] || "\u5168";
  let durationVpos = 3000;

  for (const cmd of commands) {
    const durationMatch = /^@(\d+)$/.exec(cmd);
    if (durationMatch) {
      durationVpos = parseInt(durationMatch[1], 10) * 100;
      break;
    }
  }

  nicoScripts.reverse.unshift({
    start: vpos,
    end: vpos + durationVpos,
    target: target
  });
  reverseActiveOwnerCache.clear();
  reverseActiveViewerCache.clear();
};

/**
 * 查询当前 vpos 是否处于逆播放状态
 */
window.isReverseActive = function (vpos, isOwner) {
  const cache = isOwner ? reverseActiveOwnerCache : reverseActiveViewerCache;
  const cached = cache.get(vpos);
  if (cached !== undefined) return cached;

  let result = false;
  for (const range of nicoScripts.reverse) {
    if (
      (range.target === "\u30b3\u30e1" && isOwner) ||
      (range.target === "\u6295\u30b3\u30e1" && !isOwner)
    ) {
      continue;
    }
    if (range.start < vpos && vpos < range.end) {
      result = true;
      break;
    }
  }

  cache.set(vpos, result);
  return result;
};

// ===================== 速度脚本 =====================

/**
 * 处理 @速い / @遅い Nicoscript
 */
window.processSpeedScript = function (vpos, content, commands) {
  const speedUpMatch = RE_SPEED_UP.exec(content);
  const speedDownMatch = RE_SPEED_DOWN.exec(content);
  if (!speedUpMatch && !speedDownMatch) return;

  const isSpeedUp = !!speedUpMatch;
  let durationVpos = 3000;

  for (const cmd of commands) {
    const durationMatch = /^@(\d+)$/.exec(cmd);
    if (durationMatch) {
      durationVpos = parseInt(durationMatch[1], 10) * 100;
      break;
    }
  }

  nicoScripts.speed.unshift({
    start: vpos,
    end: vpos + durationVpos,
    multiplier: isSpeedUp ? 2 : 0.5
  });
  speedActiveOwnerCache.clear();
  speedActiveViewerCache.clear();
};

/**
 * 查询当前 vpos 的播放速度倍率
 */
window.getSpeedMultiplier = function (vpos, isOwner) {
  const cache = isOwner ? speedActiveOwnerCache : speedActiveViewerCache;
  const cached = cache.get(vpos);
  if (cached !== undefined) return cached;

  let multiplier = 1;
  for (const range of nicoScripts.speed) {
    if (range.start < vpos && vpos < range.end) {
      multiplier = range.multiplier;
      break;
    }
  }

  cache.set(vpos, multiplier);
  return multiplier;
};

// ===================== 默认脚本 =====================

/**
 * 处理 @デフォルト Nicoscript（设置默认颜色/字号/字体/位置）
 */
window.processDefaultScript = function (vpos, content, commands, mc) {
  if (!RE_DEFAULT.test(content)) return;

  let durationVpos = 3000;
  for (const cmd of commands) {
    const durationMatch = /^@(\d+)$/.exec(cmd);
    if (durationMatch) {
      durationVpos = parseInt(durationMatch[1], 10) * 100;
      break;
    }
  }

  nicoScripts.default.unshift({
    start: vpos,
    end: vpos + durationVpos,
    color: mc.color !== '#FFFFFF' ? mc.color : null,
    size: mc.size !== 25 ? mc.size : null,
    font: mc.font,
    loc: mc.mode !== 1 ? mc.mode : null
  });
};

/**
 * 查询当前 vpos 下的默认命令覆盖
 */
window.getDefaultCommand = function (vpos) {
  nicoScripts.default = nicoScripts.default.filter(
    item => !item.end || item.end >= vpos
  );

  let color = null, size = null, font = null, loc = null;
  for (const item of nicoScripts.default) {
    if (item.start < vpos && vpos < item.end) {
      if (item.loc && loc === null) loc = item.loc;
      if (item.color && color === null) color = item.color;
      if (item.size && size === null) size = item.size;
      if (item.font && font === null) font = item.font;
      if (loc && color && size && font) break;
    }
  }
  return { color, size, font, loc };
};

// ===================== 禁止脚本 =====================

/**
 * 处理 @コメント禁止 Nicoscript
 */
window.processBanScript = function (vpos, content, commands) {
  if (!RE_BAN.test(content)) return;

  let durationVpos = 3000;
  for (const cmd of commands) {
    const durationMatch = /^@(\d+)$/.exec(cmd);
    if (durationMatch) {
      durationVpos = parseInt(durationMatch[1], 10) * 100;
      break;
    }
  }

  nicoScripts.ban.unshift({
    start: vpos,
    end: vpos + durationVpos
  });
};

/**
 * 查询当前 vpos 是否处于弹幕禁止状态
 */
window.isBanActive = function (vpos) {
  for (const range of nicoScripts.ban) {
    if (range.start < vpos && vpos < range.end) return true;
  }
  return false;
};

// ===================== 禁止拖动脚本 =====================

/**
 * 处理 @シーク禁止 Nicoscript
 */
window.processSeekDisableScript = function (vpos, content, commands) {
  if (!RE_SEEK_DISABLE.test(content)) return;

  let durationVpos = 3000;
  for (const cmd of commands) {
    const durationMatch = /^@(\d+)$/.exec(cmd);
    if (durationMatch) {
      durationVpos = parseInt(durationMatch[1], 10) * 100;
      break;
    }
  }

  nicoScripts.seekDisable.unshift({
    start: vpos,
    end: vpos + durationVpos
  });
};

/**
 * 查询当前 vpos 是否处于拖动禁止状态
 */
window.isSeekDisabled = function (vpos) {
  for (const range of nicoScripts.seekDisable) {
    if (range.start < vpos && vpos < range.end) return true;
  }
  return false;
};

// ===================== 跳转脚本 =====================

/**
 * 处理 @ジャンプ Nicoscript
 */
window.processJumpScript = function (vpos, content, commands) {
  const jumpMatch = RE_JUMP.exec(content);
  if (!jumpMatch) return;

  const param = jumpMatch[1];
  if (!param) return;

  let durationVpos = undefined;
  for (const cmd of commands) {
    const durationMatch = /^@(\d+)$/.exec(cmd);
    if (durationMatch) {
      durationVpos = parseInt(durationMatch[1], 10) * 100;
      break;
    }
  }

  // 时间跳转（如 #1:30）
  const timeMatch = /#([0-9]+):([0-9]+)(?:\.([0-9]+))?/.exec(param);
  if (timeMatch) {
    const min = parseInt(timeMatch[1], 10);
    const sec = parseInt(timeMatch[2], 10);
    const ms = timeMatch[3] ? parseInt(timeMatch[3].padEnd(3, '0').slice(0, 3), 10) : 0;
    const targetVpos = Math.round((min * 60 + sec) * 100 + ms / 10);
    const messageMatch = /\s+(.+)$/.exec(param.slice(timeMatch[0].length));
    nicoScripts.jump.unshift({
      start: vpos,
      end: durationVpos !== undefined ? vpos + durationVpos : undefined,
      to: `#${timeMatch[1]}:${timeMatch[2]}`,
      targetVpos: targetVpos,
      message: messageMatch ? messageMatch[1].trim() : ''
    });
    return;
  }

  // 视频跳转（如 sm12345）
  const videoMatch = /((?:sm|so|nm)\d+)\s*(.*)/.exec(param);
  if (videoMatch) {
    nicoScripts.jump.unshift({
      start: vpos,
      end: durationVpos !== undefined ? vpos + durationVpos : undefined,
      to: videoMatch[1],
      targetVpos: null,
      message: videoMatch[2] || ''
    });
  }
};

// ===================== 替换脚本 =====================

/**
 * 分割带引号的字符串（用于 @置換 的参数解析）
 */
function splitQuotedString(str) {
  const chars = [...str];
  const result = [];
  let quoteChar = '';
  let current = '';
  let prev = '';

  for (const ch of chars) {
    if ((ch === '"' || ch === "'" || ch === '\u300c') && quoteChar === '') {
      quoteChar = ch;
    } else if ((ch === '"' || ch === "'") && quoteChar === ch && prev !== '\\') {
      result.push(current.replaceAll('\\n', '\n'));
      quoteChar = '';
      current = '';
    } else if (ch === '\u300d' && quoteChar === '\u300c') {
      result.push(current);
      quoteChar = '';
      current = '';
    } else if (quoteChar === '' && /^\s$/.test(ch)) {
      if (current) { result.push(current); current = ''; }
    } else {
      current += ch;
    }
    prev = ch;
  }
  if (current) result.push(current);
  return result;
}

/**
 * 处理 @置換 Nicoscript
 */
window.processReplaceScript = function (vpos, content, commands, mc) {
  if (!RE_REPLACE.test(content)) return;

  let durationVpos = 3000;
  for (const cmd of commands) {
    const durationMatch = /^@(\d+)$/.exec(cmd);
    if (durationMatch) {
      durationVpos = parseInt(durationMatch[1], 10) * 100;
      break;
    }
  }

  const params = splitQuotedString(content.slice(4));

  const validTargets = ['コメ', '投コメ', '全', '含まない', '含む'];
  const validConditions = ['部分一致', '完全一致'];
  const target = validTargets.includes(params[3]) ? params[3] : 'コメ';
  const condition = validConditions.includes(params[4]) ? params[4] : '部分一致';

  nicoScripts.replace.unshift({
    start: vpos,
    end: vpos + durationVpos,
    keyword: params[0] ?? '',
    replace: params[1] ?? '',
    range: params[2] === '全' ? '全' : '単',
    target: target,
    condition: condition,
    color: mc.color !== '#FFFFFF' ? mc.color : null,
    size: mc.size !== 25 ? mc.size : null,
    font: mc.font,
    loc: mc.mode !== 1 ? mc.mode : null
  });

  nicoScripts.replace.sort((a, b) =>
    a.start < b.start ? -1 : a.start > b.start ? 1 : 0
  );
};

/**
 * 对弹幕应用替换规则
 */
window.applyReplaceScripts = function (vpos, danmaku) {
  nicoScripts.replace = nicoScripts.replace.filter(
    item => !item.end || item.end >= vpos
  );

  for (const rule of nicoScripts.replace) {
    if (rule.start > vpos) continue;
    if (rule.end && rule.end <= vpos) continue;

    if ((rule.target === 'コメ' || rule.target === '含まない') && danmaku._isOwner) continue;
    if (rule.target === '投コメ' && !danmaku._isOwner) continue;
    if (rule.target === '含まない' && danmaku._isOwner) continue;
    if (rule.condition === '完全一致' && danmaku.text !== rule.keyword) continue;
    if (rule.condition === '部分一致' && !danmaku.text.includes(rule.keyword)) continue;

    if (rule.range === '単') {
      danmaku.text = danmaku.text.replaceAll(rule.keyword, rule.replace);
    } else {
      danmaku.text = rule.replace;
    }

    if (rule.loc) danmaku.m = rule.loc;
    if (rule.color) danmaku.c = rule.color;
    if (rule.size) danmaku.size = rule.size;
    if (rule.font) danmaku.font = rule.font;
  }

  return danmaku;
};

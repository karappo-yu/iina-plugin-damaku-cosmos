const container = document.getElementById('danmaku-container');

// --- 引擎状态 ---
let allDanmaku = [];
let activeDanmaku = new Set();
let currentIndex = 0;
let lastTime = 0;
let isPaused = false;
let lastReverseState = false;
let lastSeekDisabled = false;

function reverseAllActiveDanmaku(newReverseState) {
  if (activeDanmaku.size === 0) return;
  
  const winW = window.innerWidth;
  
  activeDanmaku.forEach(item => {
    const el = item.el;
    const d = item.d;
    if (item.type !== 'scroll') return;
    const durMs = scrollDuration;
    const currentSpeedMult = getSpeedMultiplier(lastTime, d._isOwner);
    const adjustedDurMs = durMs / currentSpeedMult;
    const elapsedMs = (lastTime - d.t) * 10;
    const remainingMs = adjustedDurMs - elapsedMs;
    
    const rect = el.getBoundingClientRect();
    const currentX = rect.left;
    const elW = rect.width;
    
    el.style.animation = 'none';
    el.offsetHeight;
    
    if (newReverseState) {
      const mirroredX = winW - currentX;
      el.style.setProperty('--start-x', `${mirroredX}px`);
      el.style.setProperty('--end-x', `${winW + elW}px`);
    } else {
      const mirroredX = winW - currentX;
      el.style.setProperty('--start-x', `${mirroredX}px`);
      el.style.setProperty('--end-x', `${-elW}px`);
    }
    
    el.style.setProperty('--dur', `${remainingMs}ms`);
    el.style.setProperty('--delay', `0ms`);
    el.style.animation = '';
  });
  
  resetLaneData();
}

// --- 动态参数 ---
let danmakuVisible = true;
let currentOpacity = 0.8;
let scrollDuration = 4000;
let fixedDuration = 4000;
let fontScale = 1.0;
let blockForceLane = false;
let maxLaneRatio = 1.0;
const _refHeight = 1080;

// --- Nico 专属颜色映射表 ---
const NICO_FONT_SIZE = {
  html5: { small: 18, medium: 27, big: 39 },
  flash: { small: 15, medium: 24, big: 39 }
};

const NICO_LINE_HEIGHT = {
  small: 1.2,
  medium: 1.16,
  big: 45 / 39
};

const FLASH_THRESHOLD = 1499871600;

function getSizeKey(size) {
  if (size >= 36) return 'big';
  if (size <= 15) return 'small';
  return 'medium';
}

function isFlashDanmaku(dateSec, commands) {
  if (dateSec > 0 && dateSec < FLASH_THRESHOLD) return true;
  for (const cmd of commands) {
    if (cmd.toLowerCase() === 'nico:flash') return true;
  }
  return false;
}

function resolveFontSize(size, isFlash) {
  const sizeKey = getSizeKey(size);
  const mode = isFlash ? 'flash' : 'html5';
  return NICO_FONT_SIZE[mode][sizeKey];
}

function preprocessFlashText(text) {
  let result = text;
  result = result.replace(/\t/g, '\u3000\u3000');
  result = result.replace(/\u2000/g, '\u3000');
  return result;
}

const NICO_COLORS = {
  red: '#FF0000', pink: '#FF8080', orange: '#FFC000', yellow: '#FFFF00',
  green: '#00FF00', cyan: '#00FFFF', blue: '#0000FF', purple: '#C000FF',
  black: '#000000', white: '#FFFFFF', white2: '#CCCC99', niconicowhite: '#CCCC99',
  red2: '#CC0033', truered: '#CC0033', pink2: '#FF33CC', orange2: '#FF6600',
  passionorange: '#FF6600', yellow2: '#999900', mikan: '#999900',
  green2: '#00CC66', cyan2: '#00CCCC', blue2: '#3399FF', marineblue: '#3399FF',
  purple2: '#6633CC', black2: '#666666'
};

const NICO_FONTS = {
  gothic: '"Hiragino Sans", "Yu Gothic", "游ゴシック体", sans-serif',
  mincho: '"Hiragino Mincho ProN", "Yu Mincho", "游明朝体", serif',
  gulim: 'Gulim, "Hiragino Sans", sans-serif',
  simsun: 'SimSun, "Hiragino Mincho ProN", serif'
};

function resolveColor(val) {
  if (!val) return null;
  const lower = val.toLowerCase();
  if (NICO_COLORS[lower]) return NICO_COLORS[lower];
  if (/^#(?:[0-9a-f]{3}|[0-9a-f]{6})$/i.test(val)) return val.toUpperCase();
  return null;
}

const RE_NICOSCRIPT = /^[@\uff20]\S+/;

function isNicoscript(content) {
  return RE_NICOSCRIPT.test(content);
}

const RE_POSITION = /^([\d.]+)x([\d.]+)/;

function parsePositionedContent(text) {
  const match = RE_POSITION.exec(text);
  if (!match) return null;
  const posX = parseFloat(match[1]);
  const posY = parseFloat(match[2]);
  if (isNaN(posX) || isNaN(posY) || posX < 0 || posX > 1 || posY < 0 || posY > 1) return null;
  const rest = text.slice(match[0].length).replace(/^\s+/, '');
  return { posX, posY, text: rest || '' };
}

function parseMailCommands(commands) {
  let mode = 1;
  let size = 25;
  let color = '#FFFFFF';
  let colorSet = false;
  let locSet = false;
  let font = null;
  let invisible = false;
  let live = false;
  let full = false;
  let ender = false;
  let strokeColor = null;
  let wakuColor = null;
  let fillColor = null;
  let opacity = null;

  for (const raw of commands) {
    const c = raw.toLowerCase();

    if (!locSet) {
      if (c === 'naka') { mode = 1; locSet = true; continue; }
      if (c === 'shita') { mode = 4; locSet = true; continue; }
      if (c === 'ue') { mode = 5; locSet = true; continue; }
    }

    if (c === 'big' && size === 25) { size = 36; continue; }
    if (c === 'small' && size === 25) { size = 15; continue; }

    if (!font && (c === 'gothic' || c === 'mincho' || c === 'gulim' || c === 'simsun')) {
      font = c; continue;
    }

    if (c === 'invisible') { invisible = true; continue; }
    if (c === '_live') { live = true; continue; }
    if (c === 'full') { full = true; continue; }
    if (c === 'ender') { ender = true; continue; }

    if (c.startsWith('nico:stroke:') && !strokeColor) {
      strokeColor = resolveColor(raw.slice(12)); continue;
    }
    if (c.startsWith('nico:waku:') && !wakuColor) {
      wakuColor = resolveColor(raw.slice(10)); continue;
    }
    if (c.startsWith('nico:fill:') && !fillColor) {
      fillColor = resolveColor(raw.slice(10)); continue;
    }
    if (c.startsWith('nico:opacity:') && opacity === null) {
      const v = parseFloat(c.slice(13));
      if (!isNaN(v) && v >= 0 && v <= 1) opacity = v;
      continue;
    }

    if (!colorSet) {
      if (NICO_COLORS[c]) { color = NICO_COLORS[c]; colorSet = true; }
      else if (raw.startsWith('#') && (raw.length === 7 || raw.length === 4)) { color = raw; colorSet = true; }
    }
  }

  return { mode, size, color, font, invisible, live, full, ender, strokeColor, wakuColor, fillColor, opacity };
}

// --- 多层偏移常量 ---
const MAX_OFFSET_LEVELS = 3;
const OFFSET_STEP = 0.25;           // 可微调：0.22~0.28 之间最舒服

// --- 倒放脚本状态 ---
const nicoScripts = {
  reverse: [],
  speed: [],
  default: [],
  ban: [],
  replace: [],
  seekDisable: [],
  jump: []
};
let reverseActiveOwnerCache = new Map();
let reverseActiveViewerCache = new Map();
let speedActiveOwnerCache = new Map();
let speedActiveViewerCache = new Map();

// --- 倒放脚本解析 ---
const RE_REVERSE = /^@\u9006(?:\s+)?(\u5168|\u30b3\u30e1|\u6295\u30b3\u30e1)?/;

function processReverseScript(vpos, content, commands) {
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
}

function isReverseActive(vpos, isOwner) {
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
}

// --- 速度脚本解析 ---
const RE_SPEED_UP = /^@\u901f\u3044/;      // @速い
const RE_SPEED_DOWN = /^@\u9045\u3044/;    // @遅い

function processSpeedScript(vpos, content, commands) {
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
}

function getSpeedMultiplier(vpos, isOwner) {
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
}

const RE_DEFAULT = /^[@\uff20]\u30c7\u30d5\u30a9\u30eb\u30c8/;

function processDefaultScript(vpos, content, commands, mc) {
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
}

function getDefaultCommand(vpos) {
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
}

const RE_BAN = /^[@\uff20]\u30b3\u30e1\u30f3\u30c8\u7981\u6b62/;

function processBanScript(vpos, content, commands) {
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
}

function isBanActive(vpos) {
  for (const range of nicoScripts.ban) {
    if (range.start < vpos && vpos < range.end) return true;
  }
  return false;
}

const RE_SEEK_DISABLE = /^[@\uff20]\u30b7\u30fc\u30af\u7981\u6b62/;

function processSeekDisableScript(vpos, content, commands) {
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
}

function isSeekDisabled(vpos) {
  for (const range of nicoScripts.seekDisable) {
    if (range.start < vpos && vpos < range.end) return true;
  }
  return false;
}

const RE_JUMP = /^[@\uff20]\u30b8\u30e3\u30f3\u30d7(?:\s+(.+))?/;

function processJumpScript(vpos, content, commands) {
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
}

const RE_REPLACE = /^[@\uff20]\u7f6e\u63db/;

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

function processReplaceScript(vpos, content, commands, mc) {
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
}

function applyReplaceScripts(vpos, danmaku) {
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
}

// --- 动态轨道控制（现在是 2D 数组 [lane][level]）---
let maxLanes = 0;
let scrollLanes = [];
let topLanes = [];
let bottomLanes = [];

function resetLaneData() {
  scrollLanes = Array.from({ length: maxLanes }, () =>
    Array.from({ length: MAX_OFFSET_LEVELS }, () => ({ tailEnterTime: 0, tailReachOneThirdTime: 0 }))
  );
  topLanes = Array.from({ length: maxLanes }, () =>
    Array.from({ length: MAX_OFFSET_LEVELS }, () => ({ leaveScreenTime: 0 }))
  );
  bottomLanes = Array.from({ length: maxLanes }, () =>
    Array.from({ length: MAX_OFFSET_LEVELS }, () => ({ leaveScreenTime: 0 }))
  );
}

// 新增：清除弹幕的布局与轨道缓存
function clearDanmakuCaches() {
  allDanmaku.forEach(d => {
    d._lane = undefined;
    d._offsetLevel = undefined;
    d._textW = undefined;
    d._forced = undefined;
  });
}

function updateLanes() {
  const laneHeightVh = (27 / 27) * (100 / 15) * NICO_LINE_HEIGHT.medium * fontScale;
  const newMaxLanes = Math.max(1, Math.floor(100 / laneHeightVh));

  if (newMaxLanes !== maxLanes) {
    maxLanes = newMaxLanes;
    resetLaneData();
  }
}

/** 只在溢出时使用的「最早释放排序」 */
function getSortedStartingLanes(lanes2d, lanesNeeded, isScroll) {
  const maxAvailableLanes = Math.floor(maxLanes * maxLaneRatio);
  const validStartsCount = Math.max(1, maxAvailableLanes - lanesNeeded + 1);
  let infos = [];
  for (let start = 0; start < validStartsCount; start++) {
    let blockRelease = -Infinity;
    for (let k = 0; k < lanesNeeded; k++) {
      const sub = start + k;
      let rel = isScroll ? lanes2d[sub][0].tailEnterTime : lanes2d[sub][0].leaveScreenTime;
      blockRelease = Math.max(blockRelease, rel);
    }
    infos.push({ startLane: start, releaseTime: blockRelease });
  }
  infos.sort((a, b) => a.releaseTime - b.releaseTime);
  return infos;
}

/** 滚动弹幕 - 新版轨道查找（无溢出时严格从上到下） */
function getFreeScrollLane(lanesArr, textW, winW, durMs, currentTime, lanesNeeded) {
  const speed = (winW + textW) / durMs;
  const headReachOneThirdTime = currentTime + (2 * winW / 3) / speed;
  const tailReachOneThirdTimeNew = currentTime + (2 * winW / 3 + textW) / speed;

  const maxAvailableLanes = Math.floor(maxLanes * maxLaneRatio);
  const validStartsCount = Math.max(1, maxAvailableLanes - lanesNeeded + 1);

  // ==================== Level 0（正常层）：严格从上到下 ====================
  for (let start = 0; start < validStartsCount; start++) {
    let enoughSpace = true;
    for (let k = 0; k < lanesNeeded; k++) {
      const slot = lanesArr[start + k][0];
      const isEntranceFree = currentTime >= slot.tailEnterTime;
      const isNoCatchUp = headReachOneThirdTime >= slot.tailReachOneThirdTime;
      if (!isEntranceFree || !isNoCatchUp) {
        enoughSpace = false;
        break;
      }
    }
    if (enoughSpace) {
      return { lane: start, forced: false, offsetLevel: 0 };
    }
  }

  const laneInfos = getSortedStartingLanes(lanesArr, lanesNeeded, true);

  // Level 1（偏移层1）
  for (let info of laneInfos) {
    const start = info.startLane;
    let enoughSpace = true;
    for (let k = 0; k < lanesNeeded; k++) {
      if (currentTime < lanesArr[start + k][1].tailEnterTime) {
        enoughSpace = false;
        break;
      }
    }
    if (enoughSpace) return { lane: start, forced: true, offsetLevel: 1 };
  }

  // Level 2（偏移层2）
  for (let info of laneInfos) {
    const start = info.startLane;
    let enoughSpace = true;
    for (let k = 0; k < lanesNeeded; k++) {
      if (currentTime < lanesArr[start + k][2].tailEnterTime) {
        enoughSpace = false;
        break;
      }
    }
    if (enoughSpace) return { lane: start, forced: true, offsetLevel: 2 };
  }

  // 最终保底：Level 0 强制（最早释放）
  for (let info of laneInfos) {
    const start = info.startLane;
    let level0NotUsed = true;
    for (let k = 0; k < lanesNeeded; k++) {
      if (currentTime < lanesArr[start + k][0].tailEnterTime) {
        level0NotUsed = false;
        break;
      }
    }
    if (level0NotUsed) return { lane: start, forced: true, offsetLevel: 0 };
  }

  return laneInfos.length ? { lane: laneInfos[0].startLane, forced: true, offsetLevel: 0 } : null;
}

/** 固定弹幕（顶部/底部）- 同逻辑 */
function getFreeFixedLane(lanesArr, durMs, currentTime, lanesNeeded) {
  const leaveScreenTimeNew = currentTime + durMs;
  const maxAvailableLanes = Math.floor(maxLanes * maxLaneRatio);
  const validStartsCount = Math.max(1, maxAvailableLanes - lanesNeeded + 1);

  // Level 0：严格从上到下
  for (let start = 0; start < validStartsCount; start++) {
    let enoughSpace = true;
    for (let k = 0; k < lanesNeeded; k++) {
      if (currentTime < lanesArr[start + k][0].leaveScreenTime) {
        enoughSpace = false;
        break;
      }
    }
    if (enoughSpace) return { lane: start, forced: false, offsetLevel: 0 };
  }

  const laneInfos = getSortedStartingLanes(lanesArr, lanesNeeded, false);

  // Level 1
  for (let info of laneInfos) {
    const start = info.startLane;
    let enoughSpace = true;
    for (let k = 0; k < lanesNeeded; k++) {
      if (currentTime < lanesArr[start + k][1].leaveScreenTime) enoughSpace = false;
    }
    if (enoughSpace) return { lane: start, forced: true, offsetLevel: 1 };
  }

  // Level 2
  for (let info of laneInfos) {
    const start = info.startLane;
    let enoughSpace = true;
    for (let k = 0; k < lanesNeeded; k++) {
      if (currentTime < lanesArr[start + k][2].leaveScreenTime) enoughSpace = false;
    }
    if (enoughSpace) return { lane: start, forced: true, offsetLevel: 2 };
  }

  // 最终保底
  for (let info of laneInfos) {
    const start = info.startLane;
    let level0NotUsed = true;
    for (let k = 0; k < lanesNeeded; k++) {
      if (currentTime < lanesArr[start + k][0].leaveScreenTime) level0NotUsed = false;
    }
    if (level0NotUsed) return { lane: start, forced: true, offsetLevel: 0 };
  }

  return laneInfos.length ? { lane: laneInfos[0].startLane, forced: true, offsetLevel: 0 } : null;
}

function createDanmaku(d, currentTime = null) {
  if (!danmakuVisible) return;

  if (d.invisible) return;

  if (isBanActive(d.t)) return;

  const defCmd = getDefaultCommand(d.t);
  const effectiveMode = defCmd.loc || d.m;
  const effectiveColor = defCmd.color || d.c;
  const effectiveSize = defCmd.size || d.size;
  const effectiveFont = defCmd.font || d.font;

  const isScroll = effectiveMode >= 1 && effectiveMode <= 3;
  const isReverseScroll = effectiveMode === 6;
  const isBottom = effectiveMode === 4;
  const isTop = effectiveMode === 5;
  const isPositioned = effectiveMode === 7;
  
  if ((isScroll || isReverseScroll) && window._blockScroll) return;
  if (isTop && window._blockTop) return;
  if (isBottom && window._blockBottom) return;

  const durMs = (isScroll || isReverseScroll) ? scrollDuration : fixedDuration;
  const speedMult = getSpeedMultiplier(d.t, d._isOwner);
  const adjustedDurMs = durMs / speedMult;
  const videoTimeMs = d.t * 10;
  const elapsedMs = currentTime !== null ? (currentTime - d.t) * 10 : 0;
  
  if (elapsedMs >= adjustedDurMs || elapsedMs < 0) return;

  const el = document.createElement('div');
  el.className = 'dm-item';
  
  let posX = null, posY = null;
  if (isPositioned) {
    const parsed = parsePositionedContent(d.text);
    if (parsed) {
      posX = parsed.posX;
      posY = parsed.posY;
      el.textContent = parsed.text;
    } else {
      el.textContent = d.text;
    }
  } else {
    el.textContent = d.text;
  }
  
  el.style.color = effectiveColor;
  el.dataset.size = effectiveSize;
  const sizeKey = getSizeKey(effectiveSize);
  const resolvedFs = resolveFontSize(effectiveSize, d._isFlash);
  const lineCount = (d.text.match(/\n/g) || []).length + 1;
  const isMultiLine = lineCount > 1;
  let danmakuFs;
  if (isMultiLine) {
    danmakuFs = (100 / (lineCount * NICO_LINE_HEIGHT[sizeKey]) * fontScale).toFixed(4) + 'vh';
  } else {
    danmakuFs = (resolvedFs / 27 * (100 / 15) * fontScale).toFixed(4) + 'vh';
  }
  el.style.fontSize = danmakuFs;
  el.style.lineHeight = NICO_LINE_HEIGHT[sizeKey];

  if (effectiveFont && NICO_FONTS[effectiveFont]) {
    el.style.fontFamily = NICO_FONTS[effectiveFont];
    if (effectiveFont === 'mincho' || effectiveFont === 'simsun') {
      el.style.fontWeight = '400';
    }
  }

  if (d.strokeColor) {
    el.style.webkitTextStroke = `0.16vw ${d.strokeColor}`;
  } else if (d.c === '#000000' || d.c === 'black' || d.c === 'rgb(0,0,0)') {
    el.style.webkitTextStroke = '0.03vw rgba(255,255,255,0.7)';
  }

  if (d.wakuColor) {
    el.style.border = `1px solid ${d.wakuColor}`;
  }

  if (d.fillColor) {
    el.style.backgroundColor = d.fillColor;
  }

  if (d.dmOpacity !== null && d.dmOpacity !== undefined) {
    el.style.setProperty('--dm-opacity', d.dmOpacity);
    el.classList.add('dm-custom-opacity');
  }

  if (d.live) {
    el.classList.add('dm-live');
  }

  if (d.full) {
    el.classList.add('dm-full');
  }

  if (d.ender) {
    el.classList.add('dm-ender');
  }

  if (isScroll || isReverseScroll) el.classList.add('dm-scroll');
  else if (isBottom) el.classList.add('dm-bottom');
  else if (isTop) el.classList.add('dm-top');
  else if (isPositioned) el.classList.add('dm-positioned');

  container.appendChild(el);

  if ((isBottom || isTop) && !d.ender) {
    setTimeout(() => el.classList.add('priority-low'), adjustedDurMs / 2);
  }

  if (isPositioned) {
    if (d._textW === undefined) {
      d._textW = el.offsetWidth;
    }
    const textW = d._textW;
    const winW = window.innerWidth;
    const maxW = d.full ? winW : winW * 0.95;
    if (textW > maxW) {
      el.style.transform = `translateX(-50%) scaleX(${maxW / textW})`;
    } else {
      el.style.transform = `translateX(-50%)`;
    }
    
    el.style.setProperty('--dur', `${adjustedDurMs}ms`);
    el.style.setProperty('--delay', `-${elapsedMs}ms`);
    
    if (posX !== null && posY !== null) {
      el.style.left = `${posX * 100}%`;
      el.style.top = `${posY * 100}%`;
    } else {
      el.style.left = '50%';
      el.style.top = '50%';
    }
    
    const item = { el, d, type: 'fixed' };
    activeDanmaku.add(item);
    
    el.addEventListener('animationend', () => {
      el.remove();
      activeDanmaku.delete(item);
    });
    return;
  }

  if (isMultiLine) {
    el.style.left = '50%';
    el.style.transform = 'translateX(-50%)';
    el.style.top = '0';
    el.style.setProperty('--dur', `${adjustedDurMs}ms`);
    el.style.setProperty('--delay', `-${elapsedMs}ms`);
    
    const item = { el, d, type: 'fixed' };
    activeDanmaku.add(item);
    
    el.addEventListener('animationend', () => {
      el.remove();
      activeDanmaku.delete(item);
    });
    return;
  }

  if (d._textW === undefined) {
    d._textW = el.offsetWidth;
  }
  const textW = d._textW;
  const winW = window.innerWidth;
  const lanesNeeded = Math.ceil(effectiveSize / 25);

  // ========== 轨道分配 ==========
  let lane = d._lane;
  let offsetLevel = (d._offsetLevel !== undefined) ? d._offsetLevel : 0;

  const isMemory = lane !== undefined && lane < maxLanes;

  if (isMemory) {
    if (blockForceLane && (d._forced ?? false)) {
      el.remove();
      return;
    }
  } else {
    let result = null;
    if (isScroll || isReverseScroll) {
      result = getFreeScrollLane(scrollLanes, textW, winW, adjustedDurMs, videoTimeMs, lanesNeeded);
    } else if (isTop) {
      result = getFreeFixedLane(topLanes, adjustedDurMs, videoTimeMs, lanesNeeded);
    } else if (isBottom) {
      result = getFreeFixedLane(bottomLanes, adjustedDurMs, videoTimeMs, lanesNeeded);
    }

    if (!result) {
      el.remove();
      return;
    }
    if (blockForceLane && result.forced) {
      el.remove();
      return;
    }

    lane = result.lane;
    offsetLevel = result.offsetLevel;
    d._lane = lane;
    d._offsetLevel = offsetLevel;
    d._forced = result.forced;
  }

  // ========== 统一更新轨道占用状态（记忆或新分配都走这里）==========
  if (isScroll || isReverseScroll) {
    const speed = (winW + textW) / durMs;
    const tailEnterTime = videoTimeMs + (textW / speed) + 100;
    const tailReachOneThirdTime = videoTimeMs + (2 * winW / 3 + textW) / speed;
    for (let k = 0; k < lanesNeeded; k++) {
      if (lane + k < maxLanes) {
        scrollLanes[lane + k][offsetLevel] = { tailEnterTime, tailReachOneThirdTime };
      }
    }
  } else if (isTop) {
    const leaveScreenTime = videoTimeMs + durMs;
    for (let k = 0; k < lanesNeeded; k++) {
      if (lane + k < maxLanes) topLanes[lane + k][offsetLevel] = { leaveScreenTime };
    }
  } else if (isBottom) {
    const leaveScreenTime = videoTimeMs + durMs;
    for (let k = 0; k < lanesNeeded; k++) {
      if (lane + k < maxLanes) bottomLanes[lane + k][offsetLevel] = { leaveScreenTime };
    }
  }

  // ========== 视觉定位（带偏移）==========
  const laneHeightVh = 100 / maxLanes;
  let visualTop = lane + offsetLevel * OFFSET_STEP;
  if (isScroll || isReverseScroll || isTop) {
    el.style.top = `${visualTop * laneHeightVh}vh`;
  } else if (isBottom) {
    const visualBottom = Math.max(0, lane - offsetLevel * OFFSET_STEP);
    el.style.bottom = `${visualBottom * laneHeightVh + 1}vh`;
  }

  if ((isTop || isBottom) && d._textW !== undefined) {
    const maxW = window.innerWidth * 0.95;
    if (d._textW > maxW) {
      el.style.transform = `translateX(-50%) scaleX(${maxW / d._textW})`;
    } else {
      el.style.transform = `translateX(-50%)`;
    }
  }

  el.style.setProperty('--dur', `${adjustedDurMs}ms`);
  el.style.setProperty('--delay', `-${elapsedMs}ms`);

  const isReverse = isReverseScroll || isReverseActive(d.t, d._isOwner);

  if (isScroll || isReverseScroll) {
    if (isReverse) {
      el.style.setProperty('--start-x', `-100%`);
      el.style.setProperty('--end-x', `100vw`);
    } else {
      el.style.setProperty('--start-x', `100vw`);
      el.style.setProperty('--end-x', `-100%`);
    }
  } else {
    const maxW = d.full ? winW : winW * 0.95;
    if (textW > maxW) {
      el.style.transform = `translateX(-50%) scaleX(${maxW / textW})`;
    } else {
      el.style.transform = `translateX(-50%)`;
    }
  }

  const item = { el, d, type: (isScroll || isReverseScroll) ? 'scroll' : 'fixed' };
  activeDanmaku.add(item);

  el.addEventListener('animationend', () => {
    el.remove();
    activeDanmaku.delete(item);
  });
}

// 其余函数保持不变（handleSeek、iina 消息处理等）
function handleSeek(timeVpos) {
  container.innerHTML = '';
  activeDanmaku.clear();
  
  resetLaneData();
  updateLanes();
  
  const durVpos = Math.max(scrollDuration, fixedDuration) / 10;
  currentIndex = allDanmaku.findIndex(d => d.t >= timeVpos - durVpos);
  if (currentIndex === -1) currentIndex = allDanmaku.length;

  let tempIndex = currentIndex;
  while (tempIndex < allDanmaku.length && allDanmaku[tempIndex].t <= timeVpos) {
    const d = allDanmaku[tempIndex];
    const typeDur = (d.m >= 1 && d.m <= 6) ? scrollDuration : fixedDuration;
    if (timeVpos - d.t < typeDur / 10) {
      createDanmaku(d, timeVpos);
    }
    tempIndex++;
  }
  currentIndex = tempIndex;
  
  lastReverseState = isReverseActive(timeVpos, false);
}

iina.onMessage("time-update", (data) => {
  let t = data.time * 100;
  if (Math.abs(t - lastTime) > 150) {
    handleSeek(t);
  } else if (!isPaused) {
    while (currentIndex < allDanmaku.length && allDanmaku[currentIndex].t <= t) {
      createDanmaku(allDanmaku[currentIndex], t);
      currentIndex++;
    }
  }
  
  const currentReverseState = isReverseActive(t, false);
  if (currentReverseState !== lastReverseState && activeDanmaku.size > 0) {
    reverseAllActiveDanmaku(currentReverseState);
    lastReverseState = currentReverseState;
  }

  const currentSeekDisabled = isSeekDisabled(t);
  if (currentSeekDisabled !== lastSeekDisabled) {
    iina.postMessage(currentSeekDisabled ? "seek-disable" : "seek-enable", {});
    lastSeekDisabled = currentSeekDisabled;
  }

  for (const jump of nicoScripts.jump) {
    if (jump.start <= t && t - jump.start < 20) {
      if (jump._fired) continue;
      jump._fired = true;
      if (jump.targetVpos !== null) {
        iina.postMessage("jump", { targetSec: jump.targetVpos / 100, message: jump.message, to: jump.to });
      } else {
        iina.postMessage("jump-video", { videoId: jump.to, message: jump.message });
      }
    }
  }
  
  lastTime = t;
});

iina.onMessage("load-danmaku", (data) => {
  if (data.fontScale) fontScale = data.fontScale;
  if (data.scrollDuration) scrollDuration = data.scrollDuration;
  if (data.opacity) {
    currentOpacity = data.opacity;
    document.documentElement.style.setProperty('--global-opacity', currentOpacity);
  }
  updateLanes();
  
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
  lastReverseState = false;
  
  let list = [];
  const encodedStr = data.xmlContent.replace(/(..)/g, '%$1');
  const xmlStr = decodeURIComponent(encodedStr);
  
  const tryJson = encodedStr.startsWith('%5b') || encodedStr.startsWith('%5B') || encodedStr.startsWith('[');
  if (tryJson) {
    try {
      const jsonData = JSON.parse(decodeURIComponent(encodedStr));
      for (const thread of jsonData) {
        const isOwner = thread.fork === 'owner';
        for (const comment of thread.comments) {
          if (!comment.body) continue;
          const vpos = comment.vposMs / 10;
          const commands = comment.commands || [];
          const content = comment.body;
          const mc = parseMailCommands(commands);
          const isFlash = isFlashDanmaku(0, commands);
          const displayText = isFlash ? preprocessFlashText(content) : content;
          
          if (isOwner) {
            processReverseScript(vpos, content, commands);
            processSpeedScript(vpos, content, commands);
            processBanScript(vpos, content, commands);
            processSeekDisableScript(vpos, content, commands);
            processJumpScript(vpos, content, commands);
            processReplaceScript(vpos, content, commands, mc);
          }

          const nicoscriptInvisible = isOwner && isNicoscript(content);

          if (isOwner) {
            processDefaultScript(vpos, content, commands, mc);
          }

          const item = {
            t: vpos,
            m: mc.mode,
            c: mc.color,
            text: displayText,
            size: mc.size,
            _isOwner: isOwner,
            _isFlash: isFlash,
            font: mc.font,
            invisible: mc.invisible || nicoscriptInvisible,
            live: mc.live,
            full: mc.full,
            ender: mc.ender,
            strokeColor: mc.strokeColor,
            wakuColor: mc.wakuColor,
            fillColor: mc.fillColor,
            dmOpacity: mc.opacity
          };
          applyReplaceScripts(vpos, item);
          list.push(item);
        }
      }
    } catch (e) {
      console.warn('JSON parse failed, falling back to XML:', e);
      list = parseXmlDanmaku(xmlStr);
    }
  } else {
    list = parseXmlDanmaku(xmlStr);
  }

  allDanmaku = list.sort((a, b) => a.t - b.t);

  handleSeek(0);
});

function parseXmlDanmaku(xmlStr) {
  const parser = new DOMParser();
  const xmlDoc = parser.parseFromString(xmlStr, "text/xml");
  const chats = xmlDoc.getElementsByTagName('chat');
  let list = [];

  if (chats.length > 0) {
    for (let i = 0; i < chats.length; i++) {
      const el = chats[i];
      const text = el.textContent;
      if (!text) continue;

      const vpos = parseInt(el.getAttribute('vpos') || "0", 10);
      const mail = el.getAttribute('mail') || "";
      const commands = mail.toLowerCase().split(/\s+/);
      const isOwner = !el.getAttribute('user_id');
      const dateSec = parseInt(el.getAttribute('date') || "0", 10);
      const mc = parseMailCommands(commands);
      const isFlash = isFlashDanmaku(dateSec, commands);
      const displayText = isFlash ? preprocessFlashText(text) : text;

      if (isOwner) {
        processReverseScript(vpos, text, commands);
        processSpeedScript(vpos, text, commands);
        processBanScript(vpos, text, commands);
        processSeekDisableScript(vpos, text, commands);
        processJumpScript(vpos, text, commands);
        processReplaceScript(vpos, text, commands, mc);
      }

      const nicoscriptInvisible = isOwner && isNicoscript(text);

      if (isOwner) {
        processDefaultScript(vpos, text, commands, mc);
      }

      const item = {
        t: vpos,
        m: mc.mode,
        c: mc.color,
        text: displayText,
        size: mc.size,
        _isOwner: isOwner,
        _isFlash: isFlash,
        font: mc.font,
        invisible: mc.invisible || nicoscriptInvisible,
        live: mc.live,
        full: mc.full,
        ender: mc.ender,
        strokeColor: mc.strokeColor,
        wakuColor: mc.wakuColor,
        fillColor: mc.fillColor,
        dmOpacity: mc.opacity
      };
      applyReplaceScripts(vpos, item);
      list.push(item);
    }
  } else {
    const regex = /<d p="([^"]+)">([\s\S]*?)<\/d>/g;
    let match;
    while ((match = regex.exec(xmlStr)) !== null) {
      let p = match[1].split(",");
      let colorVal = parseInt(p[3]);
      if (colorVal < 0) colorVal = (colorVal >>> 0) & 0xFFFFFF;
      let danmakuSize = parseInt(p[2]) || 25;
      const vpos = Math.round(parseFloat(p[0]) * 100);
      const text = match[2].replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/<\/d/, '');
      const commands = p[5] ? p[5].toLowerCase().split(/\s+/) : [];
      processSpeedScript(vpos, text, commands);
      const mc = parseMailCommands(commands);
      const item = {
        t: vpos,
        m: parseInt(p[1]),
        c: "#" + colorVal.toString(16).padStart(6, '0'),
        text: text,
        size: danmakuSize,
        _isOwner: true,
        _isFlash: false,
        font: mc.font,
        invisible: mc.invisible,
        live: mc.live,
        full: mc.full,
        ender: mc.ender,
        strokeColor: mc.strokeColor,
        wakuColor: mc.wakuColor,
        fillColor: mc.fillColor,
        dmOpacity: mc.opacity
      };
      applyReplaceScripts(vpos, item);
      list.push(item);
    }
  }
  return list;
}

iina.onMessage("resize", () => {
  updateLanes();
  clearDanmakuCaches();

  activeDanmaku.forEach(item => {
    if (item.type === 'fixed') {
      const winW = window.innerWidth;
      const textW = item.el.offsetWidth;
      const maxW = item.d.full ? winW : winW * 0.95;
      if (textW > maxW) {
        item.el.style.transform = `translateX(-50%) scaleX(${maxW / textW})`;
      } else {
        item.el.style.transform = `translateX(-50%)`;
      }
    }
  });
});

iina.onMessage("pause-state", (data) => {
  isPaused = data.paused;
  document.body.classList.toggle('is-paused', isPaused);
});

iina.onMessage("toggle-danmaku", (data) => {
  danmakuVisible = data.enabled;
  container.style.display = danmakuVisible ? '' : 'none';
  if (!danmakuVisible) {
    container.innerHTML = '';
    activeDanmaku.clear();
  }
});

iina.onMessage("set-opacity", (data) => {
  currentOpacity = data.opacity;
  document.documentElement.style.setProperty('--global-opacity', currentOpacity);
});

iina.onMessage("set-fontscale", (data) => {
  fontScale = data.scale;
  updateLanes();
  clearDanmakuCaches();
  handleSeek(lastTime);
});

iina.onMessage("set-scroll-duration", (data) => {
  scrollDuration = data.duration;
});

iina.onMessage("clear-danmaku", () => {
  container.innerHTML = '';
  activeDanmaku.clear();
  allDanmaku = [];
  currentIndex = 0;
});

iina.onMessage("apply-settings", (data) => {
  if (data.opacity !== undefined) {
    currentOpacity = data.opacity;
    document.documentElement.style.setProperty('--global-opacity', currentOpacity);
  }
  if (data.fontScale !== undefined) fontScale = data.fontScale;
  if (data.scrollDuration !== undefined) scrollDuration = data.scrollDuration;
  if (data.blockForceLane !== undefined) blockForceLane = data.blockForceLane;
  if (data.maxLaneRatio !== undefined) maxLaneRatio = data.maxLaneRatio;
  updateLanes();
});

iina.onMessage("block-type", (data) => {
  window._blockScroll = data.blockScroll;
  window._blockTop = data.blockTop;
  window._blockBottom = data.blockBottom;
});

iina.onMessage("block-force-lane", (data) => {
  blockForceLane = data.blockForceLane;
});

iina.onMessage("set-lane-limit", (data) => {
  if (data.maxLaneRatio !== undefined) {
    maxLaneRatio = data.maxLaneRatio;
    updateLanes();
  }
});

updateLanes();

window.addEventListener("resize", () => {
  updateLanes();
  iina.postMessage("resize", {});
});

document.addEventListener("visibilitychange", () => {
  if (document.visibilityState === "visible" && lastTime > 0) {
    handleSeek(lastTime);
  }
});

setTimeout(() => iina.postMessage("overlay-ready", {}), 300);
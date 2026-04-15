const container = document.getElementById('danmaku-container');

// --- 引擎状态 ---
let allDanmaku = [];
let activeDanmaku = new Set();
let currentIndex = 0;
let lastTime = 0;
let isPaused = false;

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
const NICO_COLORS = {
  red: '#FF0000', pink: '#FF8080', orange: '#FFC000', yellow: '#FFFF00',
  green: '#00FF00', cyan: '#00FFFF', blue: '#0000FF', purple: '#C000FF',
  black: '#000000', white: '#FFFFFF', white2: '#CCCC99', niconicowhite: '#CCCC99',
  red2: '#CC0033', truered: '#CC0033', pink2: '#FF33CC', orange2: '#FF6600',
  passionorange: '#FF6600', yellow2: '#999900', mikan: '#999900',
  green2: '#00CC66', cyan2: '#00CCCC', blue2: '#3399FF', marineblue: '#3399FF',
  purple2: '#6633CC', black2: '#666666'
};

// --- 多层偏移常量 ---
const MAX_OFFSET_LEVELS = 3;
const OFFSET_STEP = 0.25;           // 可微调：0.22~0.28 之间最舒服

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
  const laneHeightVh = (100 / 15) * 1.1 * fontScale;
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

  const isScroll = d.m >= 1 && d.m <= 3;
  const isBottom = d.m === 4;
  const isTop = d.m === 5;
  
  if (isScroll && window._blockScroll) return;
  if (isTop && window._blockTop) return;
  if (isBottom && window._blockBottom) return;

  const durMs = isScroll ? scrollDuration : fixedDuration;
  const videoTimeMs = d.t * 1000;
  const elapsedMs = currentTime !== null ? (currentTime - d.t) * 1000 : 0;
  
  if (elapsedMs >= durMs || elapsedMs < 0) return;

  const el = document.createElement('div');
  el.className = 'dm-item';
  el.textContent = d.text;
  el.style.color = d.c;
  el.dataset.size = d.size;
  const danmakuFs = ((d.size / 25) * (100 / 15) * fontScale).toFixed(4) + 'vh';
  el.style.fontSize = danmakuFs;
  if (d.c === '#000000' || d.c === 'black' || d.c === 'rgb(0,0,0)') {
    el.style.webkitTextStroke = '0.03vw rgba(255,255,255,0.7)';
  }

  if (isScroll) el.classList.add('dm-scroll');
  else if (isBottom) el.classList.add('dm-bottom');
  else if (isTop) el.classList.add('dm-top');

  container.appendChild(el);

  if (isBottom || isTop) {
    setTimeout(() => el.classList.add('priority-low'), durMs / 2);
  }

  if (d._textW === undefined) {
    d._textW = el.offsetWidth;
  }
  const textW = d._textW;
  const winW = window.innerWidth;
  const lanesNeeded = Math.ceil(d.size / 25);

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
    if (isScroll) {
      result = getFreeScrollLane(scrollLanes, textW, winW, durMs, videoTimeMs, lanesNeeded);
    } else if (isTop) {
      result = getFreeFixedLane(topLanes, durMs, videoTimeMs, lanesNeeded);
    } else if (isBottom) {
      result = getFreeFixedLane(bottomLanes, durMs, videoTimeMs, lanesNeeded);
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
  if (isScroll) {
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
  if (isScroll || isTop) {
    el.style.top = `${visualTop * laneHeightVh}vh`;
  } else if (isBottom) {
    const visualBottom = Math.max(0, lane - offsetLevel * OFFSET_STEP);
    el.style.bottom = `${visualBottom * laneHeightVh + 1}vh`;
  }

  el.style.setProperty('--dur', `${durMs}ms`);
  el.style.setProperty('--delay', `-${elapsedMs}ms`);

  if (isScroll) {
    el.style.setProperty('--start-x', `100vw`);
    el.style.setProperty('--end-x', `-100%`);
  } else {
    const maxW = winW * 0.95;
    if (textW > maxW) {
      el.style.transform = `translateX(-50%) scaleX(${maxW / textW})`;
    } else {
      el.style.transform = `translateX(-50%)`;
    }
  }

  const item = { el, d, type: isScroll ? 'scroll' : 'fixed' };
  activeDanmaku.add(item);

  el.addEventListener('animationend', () => {
    el.remove();
    activeDanmaku.delete(item);
  });
}

// 其余函数保持不变（handleSeek、iina 消息处理等）
function handleSeek(timeSec) {
  container.innerHTML = '';
  activeDanmaku.clear();
  
  resetLaneData();
  updateLanes(); 
  
  const durSec = Math.max(scrollDuration, fixedDuration) / 1000;
  currentIndex = allDanmaku.findIndex(d => d.t >= timeSec - durSec);
  if (currentIndex === -1) currentIndex = allDanmaku.length;

  let tempIndex = currentIndex;
  while (tempIndex < allDanmaku.length && allDanmaku[tempIndex].t <= timeSec) {
    const d = allDanmaku[tempIndex];
    const typeDur = (d.m >= 1 && d.m <= 3) ? scrollDuration : fixedDuration;
    if (timeSec - d.t < typeDur / 1000) {
      createDanmaku(d, timeSec); 
    }
    tempIndex++;
  }
  currentIndex = tempIndex;
}

iina.onMessage("time-update", (data) => {
  let t = data.time;
  if (Math.abs(t - lastTime) > 1.5) {
    handleSeek(t);
  } else if (!isPaused) {
    while (currentIndex < allDanmaku.length && allDanmaku[currentIndex].t <= t) {
      createDanmaku(allDanmaku[currentIndex], t);
      currentIndex++;
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
  
  const encodedStr = data.xmlContent.replace(/(..)/g, '%$1');
  const xmlStr = decodeURIComponent(encodedStr);
  
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

      let mode = 1; 
      if (commands.includes('shita')) mode = 4;
      else if (commands.includes('ue')) mode = 5;

      let size = 25; 
      if (commands.includes('big')) size = 36;
      else if (commands.includes('small')) size = 15;

      let color = '#FFFFFF';
      for (const cmd of commands) {
        if (NICO_COLORS[cmd]) {
          color = NICO_COLORS[cmd];
          break;
        }
        if (cmd.startsWith('#') && (cmd.length === 7 || cmd.length === 4)) {
          color = cmd;
          break;
        }
      }

      list.push({
        t: vpos / 100,
        m: mode,
        c: color,
        text: text,
        size: size
      });
    }
  } else {
    const regex = /<d p="([^"]+)">([\s\S]*?)<\/d>/g;
    let match;
    while ((match = regex.exec(xmlStr)) !== null) {
      let p = match[1].split(",");
      let colorVal = parseInt(p[3]);
      if (colorVal < 0) colorVal = (colorVal >>> 0) & 0xFFFFFF;
      let danmakuSize = parseInt(p[2]) || 25;
      list.push({
        t: parseFloat(p[0]),
        m: parseInt(p[1]),
        c: "#" + colorVal.toString(16).padStart(6, '0'),
        text: match[2].replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/<\/d/, ''),
        size: danmakuSize
      });
    }
  }

  allDanmaku = list.sort((a, b) => a.t - b.t);

  handleSeek(0);
});

iina.onMessage("resize", () => {
  updateLanes();
  clearDanmakuCaches();

  activeDanmaku.forEach(item => {
    if (item.type === 'fixed') {
      const winW = window.innerWidth;
      const textW = item.el.offsetWidth;
      const maxW = winW * 0.95;
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
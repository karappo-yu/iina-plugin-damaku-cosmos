/**
 * main.js — 弹幕引擎主入口
 *
 * 负责引擎状态管理、IINA 消息处理、事件循环调度。
 * 对应原项目: src/main.ts, src/eventHandler.ts
 */

// --- 引擎状态 ---
let allDanmaku = [];
let currentIndex = 0;
let lastTime = 0;
let isPaused = false;
let lastReverseState = false;
let lastSeekDisabled = false;

// --- 动态参数 ---
let currentOpacity = 0.8;

/**
 * Seek 处理：重置画面并从指定时间点重新渲染
 */
function handleSeek(timeVpos) {
  const { scrollDuration, fixedDuration } = getRendererConfig();
  clearAllDanmaku();
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

// ===================== IINA 消息处理 =====================

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

  // 逆播放状态切换
  const currentReverseState = isReverseActive(t, false);
  if (currentReverseState !== lastReverseState && getActiveDanmaku().size > 0) {
    reverseAllActiveDanmaku(currentReverseState, lastTime);
    lastReverseState = currentReverseState;
  }

  // 拖动禁止状态切换
  const currentSeekDisabled = isSeekDisabled(t);
  if (currentSeekDisabled !== lastSeekDisabled) {
    iina.postMessage(currentSeekDisabled ? "seek-disable" : "seek-enable", {});
    lastSeekDisabled = currentSeekDisabled;
  }

  // 跳转脚本触发
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
  // 设置参数
  if (data.fontScale) {
    setRendererConfig({ fontScale: data.fontScale });
    setLaneConfig({ fontScale: data.fontScale });
  }
  if (data.scrollDuration) setRendererConfig({ scrollDuration: data.scrollDuration });
  if (data.opacity) {
    currentOpacity = data.opacity;
    document.documentElement.style.setProperty('--global-opacity', currentOpacity);
  }
  updateLanes();

  // 重置 Nicoscript 状态
  resetNicoScripts();
  lastReverseState = false;

  // 解析弹幕数据
  const encodedStr = data.xmlContent.replace(/(..)/g, '%$1');
  let list = parseDanmaku(encodedStr);

  // 排序
  allDanmaku = list.sort((a, b) => a.t - b.t);

  // CA 层分离：识别弹幕画并分配独立 layer
  if (typeof assignCALayers === 'function') {
    assignCALayers(allDanmaku);
  }

  handleSeek(0);
});

iina.onMessage("resize", () => {
  updateLanes();
  clearDanmakuCaches(allDanmaku);

  const active = getActiveDanmaku();
  active.forEach(item => {
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
  setRendererConfig({ danmakuVisible: data.enabled });
  const container = getContainer();
  container.style.display = data.enabled ? '' : 'none';
  if (!data.enabled) {
    clearAllDanmaku();
  }
});

iina.onMessage("set-opacity", (data) => {
  currentOpacity = data.opacity;
  document.documentElement.style.setProperty('--global-opacity', currentOpacity);
});

iina.onMessage("set-fontscale", (data) => {
  setRendererConfig({ fontScale: data.scale });
  setLaneConfig({ fontScale: data.scale });
  updateLanes();
  clearDanmakuCaches(allDanmaku);
  handleSeek(lastTime);
});

iina.onMessage("set-scroll-duration", (data) => {
  setRendererConfig({ scrollDuration: data.duration });
});

iina.onMessage("clear-danmaku", () => {
  clearAllDanmaku();
  allDanmaku = [];
  currentIndex = 0;
});

iina.onMessage("apply-settings", (data) => {
  if (data.opacity !== undefined) {
    currentOpacity = data.opacity;
    document.documentElement.style.setProperty('--global-opacity', currentOpacity);
  }
  if (data.fontScale !== undefined) {
    setRendererConfig({ fontScale: data.fontScale });
    setLaneConfig({ fontScale: data.fontScale });
  }
  if (data.scrollDuration !== undefined) setRendererConfig({ scrollDuration: data.scrollDuration });
  if (data.blockForceLane !== undefined) setRendererConfig({ blockForceLane: data.blockForceLane });
  if (data.maxLaneRatio !== undefined) setLaneConfig({ maxLaneRatio: data.maxLaneRatio });
  updateLanes();
});

iina.onMessage("block-type", (data) => {
  window._blockScroll = data.blockScroll;
  window._blockTop = data.blockTop;
  window._blockBottom = data.blockBottom;
});

iina.onMessage("block-force-lane", (data) => {
  setRendererConfig({ blockForceLane: data.blockForceLane });
});

iina.onMessage("set-lane-limit", (data) => {
  if (data.maxLaneRatio !== undefined) {
    setLaneConfig({ maxLaneRatio: data.maxLaneRatio });
    updateLanes();
  }
});

// ===================== 初始化 =====================

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

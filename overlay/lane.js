/**
 * lane.js — 轨道分配与管理
 *
 * 负责弹幕轨道的初始化、查找、分配和占用状态更新。
 * 支持多层偏移（offset level）机制，减少弹幕重叠。
 */

// --- 轨道数据 ---
let maxLanes = 0;
let scrollLanes = [];   // [lane][level] = { tailEnterTime, tailReachOneThirdTime, layer, isOwner }
let topLanes = [];       // [lane][level] = { leaveScreenTime, layer, isOwner }
let bottomLanes = [];    // [lane][level] = { leaveScreenTime, layer, isOwner }

// --- 动态参数 ---
let _fontScale = 1.0;
let _maxLaneRatio = 1.0;

/**
 * 设置轨道参数（由 main.js 调用）
 */
window.setLaneConfig = function (opts) {
  if (opts.fontScale !== undefined) _fontScale = opts.fontScale;
  if (opts.maxLaneRatio !== undefined) _maxLaneRatio = opts.maxLaneRatio;
};

/**
 * 获取当前最大轨道数
 */
window.getMaxLanes = function () {
  return maxLanes;
};

/**
 * 重置所有轨道数据
 */
window.resetLaneData = function () {
  scrollLanes = Array.from({ length: maxLanes }, () =>
    Array.from({ length: MAX_OFFSET_LEVELS }, () => ({ tailEnterTime: 0, tailReachOneThirdTime: 0, layer: -1, isOwner: false }))
  );
  topLanes = Array.from({ length: maxLanes }, () =>
    Array.from({ length: MAX_OFFSET_LEVELS }, () => ({ leaveScreenTime: 0, layer: -1, isOwner: false }))
  );
  bottomLanes = Array.from({ length: maxLanes }, () =>
    Array.from({ length: MAX_OFFSET_LEVELS }, () => ({ leaveScreenTime: 0, layer: -1, isOwner: false }))
  );
};

/**
 * 清除弹幕的布局与轨道缓存（窗口缩放时调用）
 */
window.clearDanmakuCaches = function (allDanmaku) {
  allDanmaku.forEach(d => {
    d._lane = undefined;
    d._offsetLevel = undefined;
    d._textW = undefined;
    d._forced = undefined;
  });
};

/**
 * 根据当前 fontScale 重新计算轨道数
 */
window.updateLanes = function () {
  const laneHeightVh = (27 / 27) * (100 / 15) * NICO_LINE_HEIGHT.medium * _fontScale;
  const newMaxLanes = Math.max(1, Math.floor(100 / laneHeightVh));

  if (newMaxLanes !== maxLanes) {
    maxLanes = newMaxLanes;
    resetLaneData();
  }
};

/**
 * 判断轨道槽位是否与当前弹幕需要碰撞避让
 *
 * 规则（参考 niconicomments getPosY）：
 * - 不同 owner 不碰撞（投稿者与观众互不干扰）
 * - 同 owner 但不同 layer 不碰撞（CA 保护：不同 CA 作品允许重叠）
 * - 同 owner 且同 layer 才碰撞
 *
 * @param {object} slot - 轨道槽位 { layer, isOwner, ... }
 * @param {number} myLayer - 当前弹幕的 layer
 * @param {boolean} myIsOwner - 当前弹幕是否投稿者
 * @returns {boolean} true 表示需要碰撞避让
 */
function shouldCollideSlot(slot, myLayer, myIsOwner) {
  // 不同 owner 不碰撞
  if (slot.isOwner !== myIsOwner) return false;
  // 同 owner 但不同 layer 不碰撞（CA 保护）
  if (slot.layer !== myLayer) return false;
  return true;
}

/**
 * 溢出时使用的「最早释放排序」
 * 按 releaseTime 升序排列所有可用的起始轨道组合
 * 只考虑与当前弹幕同 layer + 同 owner 的占用
 */
function getSortedStartingLanes(lanes2d, lanesNeeded, isScroll, layer, isOwner) {
  const maxAvailableLanes = Math.floor(maxLanes * _maxLaneRatio);
  const validStartsCount = Math.max(1, maxAvailableLanes - lanesNeeded + 1);
  let infos = [];
  for (let start = 0; start < validStartsCount; start++) {
    let blockRelease = -Infinity;
    for (let k = 0; k < lanesNeeded; k++) {
      const sub = start + k;
      const slot = lanes2d[sub][0];
      // 只考虑需要碰撞的占用
      if (shouldCollideSlot(slot, layer, isOwner)) {
        let rel = isScroll ? slot.tailEnterTime : slot.leaveScreenTime;
        blockRelease = Math.max(blockRelease, rel);
      }
    }
    infos.push({ startLane: start, releaseTime: blockRelease });
  }
  infos.sort((a, b) => a.releaseTime - b.releaseTime);
  return infos;
}

/**
 * 滚动弹幕 — 轨道查找
 *
 * 查找优先级：
 * 1. Level 0（正常层）：严格从上到下
 * 2. Level 1（偏移层1）
 * 3. Level 2（偏移层2）
 * 4. Level 0 强制（最早释放）
 *
 * @returns {{ lane, forced, offsetLevel } | null}
 */
/**
 * 滚动弹幕 — 轨道查找
 *
 * 查找优先级：
 * 1. Level 0（正常层）：严格从上到下
 * 2. Level 1（偏移层1）
 * 3. Level 2（偏移层2）
 * 4. Level 0 强制（最早释放）
 *
 * layer 隔离：同 owner + 同 layer 的弹幕才碰撞避让，
 *            不同 layer 或不同 owner 的弹幕可以共享轨道（CA 保护）
 *
 * @param {number} textW - 弹幕文本宽度
 * @param {number} winW - 窗口宽度
 * @param {number} durMs - 持续时间（毫秒）
 * @param {number} currentTime - 当前视频时间（毫秒）
 * @param {number} lanesNeeded - 需要的轨道数
 * @param {number} [layer=-1] - 弹幕所属 layer（CA 分层用）
 * @param {boolean} [isOwner=false] - 是否投稿者弹幕
 * @returns {{ lane, forced, offsetLevel } | null}
 */
window.getFreeScrollLane = function (textW, winW, durMs, currentTime, lanesNeeded, layer, isOwner) {
  layer = layer ?? -1;
  isOwner = !!isOwner;
  const speed = (winW + textW) / durMs;
  const headReachOneThirdTime = currentTime + (2 * winW / 3) / speed;

  const maxAvailableLanes = Math.floor(maxLanes * _maxLaneRatio);
  const validStartsCount = Math.max(1, maxAvailableLanes - lanesNeeded + 1);

  // Level 0：严格从上到下
  for (let start = 0; start < validStartsCount; start++) {
    let enoughSpace = true;
    for (let k = 0; k < lanesNeeded; k++) {
      const slot = scrollLanes[start + k][0];
      // layer 隔离：同 owner + 同 layer 才碰撞
      if (shouldCollideSlot(slot, layer, isOwner)) {
        const isEntranceFree = currentTime >= slot.tailEnterTime;
        const isNoCatchUp = headReachOneThirdTime >= slot.tailReachOneThirdTime;
        if (!isEntranceFree || !isNoCatchUp) {
          enoughSpace = false;
          break;
        }
      }
    }
    if (enoughSpace) {
      return { lane: start, forced: false, offsetLevel: 0 };
    }
  }

  const laneInfos = getSortedStartingLanes(scrollLanes, lanesNeeded, true, layer, isOwner);

  // Level 1（偏移层1）
  for (let info of laneInfos) {
    const start = info.startLane;
    let enoughSpace = true;
    for (let k = 0; k < lanesNeeded; k++) {
      const slot = scrollLanes[start + k][1];
      if (shouldCollideSlot(slot, layer, isOwner) && currentTime < slot.tailEnterTime) {
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
      const slot = scrollLanes[start + k][2];
      if (shouldCollideSlot(slot, layer, isOwner) && currentTime < slot.tailEnterTime) {
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
      const slot = scrollLanes[start + k][0];
      if (shouldCollideSlot(slot, layer, isOwner) && currentTime < slot.tailEnterTime) {
        level0NotUsed = false;
        break;
      }
    }
    if (level0NotUsed) return { lane: start, forced: true, offsetLevel: 0 };
  }

  return laneInfos.length ? { lane: laneInfos[0].startLane, forced: true, offsetLevel: 0 } : null;
};

/**
 * 固定弹幕（顶部/底部）— 轨道查找
 *
 * layer 隔离：同 owner + 同 layer 才碰撞，不同 layer 不碰撞
 *
 * @param {'top'|'bottom'} position - 顶部或底部
 * @param {number} durMs - 持续时间
 * @param {number} currentTime - 当前时间
 * @param {number} lanesNeeded - 需要轨道数
 * @param {number} [layer=-1] - 弹幕所属 layer
 * @param {boolean} [isOwner=false] - 是否投稿者弹幕
 * @returns {{ lane, forced, offsetLevel } | null}
 */
window.getFreeFixedLane = function (position, durMs, currentTime, lanesNeeded, layer, isOwner) {
  layer = layer ?? -1;
  isOwner = !!isOwner;
  const lanesArr = position === 'top' ? topLanes : bottomLanes;
  const maxAvailableLanes = Math.floor(maxLanes * _maxLaneRatio);
  const validStartsCount = Math.max(1, maxAvailableLanes - lanesNeeded + 1);

  // Level 0：严格从上到下
  for (let start = 0; start < validStartsCount; start++) {
    let enoughSpace = true;
    for (let k = 0; k < lanesNeeded; k++) {
      const slot = lanesArr[start + k][0];
      if (shouldCollideSlot(slot, layer, isOwner) && currentTime < slot.leaveScreenTime) {
        enoughSpace = false;
        break;
      }
    }
    if (enoughSpace) return { lane: start, forced: false, offsetLevel: 0 };
  }

  const laneInfos = getSortedStartingLanes(lanesArr, lanesNeeded, false, layer, isOwner);

  // Level 1
  for (let info of laneInfos) {
    const start = info.startLane;
    let enoughSpace = true;
    for (let k = 0; k < lanesNeeded; k++) {
      const slot = lanesArr[start + k][1];
      if (shouldCollideSlot(slot, layer, isOwner) && currentTime < slot.leaveScreenTime) enoughSpace = false;
    }
    if (enoughSpace) return { lane: start, forced: true, offsetLevel: 1 };
  }

  // Level 2
  for (let info of laneInfos) {
    const start = info.startLane;
    let enoughSpace = true;
    for (let k = 0; k < lanesNeeded; k++) {
      const slot = lanesArr[start + k][2];
      if (shouldCollideSlot(slot, layer, isOwner) && currentTime < slot.leaveScreenTime) enoughSpace = false;
    }
    if (enoughSpace) return { lane: start, forced: true, offsetLevel: 2 };
  }

  // 最终保底
  for (let info of laneInfos) {
    const start = info.startLane;
    let level0NotUsed = true;
    for (let k = 0; k < lanesNeeded; k++) {
      const slot = lanesArr[start + k][0];
      if (shouldCollideSlot(slot, layer, isOwner) && currentTime < slot.leaveScreenTime) level0NotUsed = false;
    }
    if (level0NotUsed) return { lane: start, forced: true, offsetLevel: 0 };
  }

  return laneInfos.length ? { lane: laneInfos[0].startLane, forced: true, offsetLevel: 0 } : null;
};

/**
 * 更新轨道占用状态
 *
 * @param {number} lane - 起始轨道
 * @param {number} offsetLevel - 偏移层级
 * @param {number} lanesNeeded - 占用轨道数
 * @param {'scroll'|'top'|'bottom'} type - 弹幕类型
 * @param {object} timing - 滚动: { tailEnterTime, tailReachOneThirdTime }, 固定: { leaveScreenTime }
 * @param {number} [layer=-1] - 弹幕所属 layer
 * @param {boolean} [isOwner=false] - 是否投稿者弹幕
 */
window.occupyLane = function (lane, offsetLevel, lanesNeeded, type, timing, layer, isOwner) {
  const slotData = { ...timing, layer: layer ?? -1, isOwner: !!isOwner };
  if (type === 'scroll') {
    for (let k = 0; k < lanesNeeded; k++) {
      if (lane + k < maxLanes) {
        scrollLanes[lane + k][offsetLevel] = slotData;
      }
    }
  } else if (type === 'top') {
    for (let k = 0; k < lanesNeeded; k++) {
      if (lane + k < maxLanes) topLanes[lane + k][offsetLevel] = slotData;
    }
  } else if (type === 'bottom') {
    for (let k = 0; k < lanesNeeded; k++) {
      if (lane + k < maxLanes) bottomLanes[lane + k][offsetLevel] = slotData;
    }
  }
};

/**
 * 计算弹幕的视觉垂直位置（vh）
 *
 * @param {number} lane - 轨道号
 * @param {number} offsetLevel - 偏移层级
 * @param {'scroll'|'top'|'bottom'} position - 位置类型
 * @returns {{ top?: string, bottom?: string }} - CSS top/bottom 值
 */
window.getVisualPosition = function (lane, offsetLevel, position) {
  const laneHeightVh = 100 / maxLanes;
  if (position === 'scroll' || position === 'top') {
    const visualTop = lane + offsetLevel * OFFSET_STEP;
    return { top: `${visualTop * laneHeightVh}vh` };
  } else {
    const visualBottom = Math.max(0, lane - offsetLevel * OFFSET_STEP);
    return { bottom: `${visualBottom * laneHeightVh + 1}vh` };
  }
};

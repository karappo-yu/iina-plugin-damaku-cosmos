/**
 * config.js — 全局常量与配置
 *
 * 弹幕颜色映射、字体定义、字号表、行高比等静态配置。
 * 对应原项目: src/definition/config.ts, src/@types/config.ts
 */

// --- 字号映射表（单位: px，基于 1080p 参考高度） ---
window.NICO_FONT_SIZE = {
  html5: { small: 18, medium: 27, big: 39 },
  flash: { small: 15, medium: 24, big: 39 }
};

// --- 行高比 ---
window.NICO_LINE_HEIGHT = {
  small: 1.2,
  medium: 1.16,
  big: 45 / 39
};

// --- Flash 弹幕时间阈值（2017/7/12 19:00 JST 之前的弹幕视为 Flash） ---
window.FLASH_THRESHOLD = 1499871600;

// --- Flash 上下标正则 ---
window.FLASH_SCRIPT_CHAR = {
  super: /[\u00aa\u00b2\u00b3\u00b9\u00ba\u02b0\u02b2\u02b3\u02b7\u02b8\u02e1-\u02e3\u0304\u1d2c-\u1d43\u1d45-\u1d61\u1d9b-\u1da1\u1da3-\u1dbf\u2070\u2071\u2074-\u207f\u2c7d]/g,
  sub: /[\u0320\u1d62-\u1d6a\u2080-\u208e\u2090-\u209c\u2c7c]/g
};

// --- Flash 上下标偏移量（em） ---
window.FLASH_SCRIPT_CHAR_OFFSET = 0.12;

// --- Niconico 专属颜色映射 ---
window.NICO_COLORS = {
  red: '#FF0000', pink: '#FF8080', orange: '#FFC000', yellow: '#FFFF00',
  green: '#00FF00', cyan: '#00FFFF', blue: '#0000FF', purple: '#C000FF',
  black: '#000000', white: '#FFFFFF', white2: '#CCCC99', niconicowhite: '#CCCC99',
  red2: '#CC0033', truered: '#CC0033', pink2: '#FF33CC', orange2: '#FF6600',
  passionorange: '#FF6600', yellow2: '#999900', mikan: '#999900',
  green2: '#00CC66', cyan2: '#00CCCC', blue2: '#3399FF', marineblue: '#3399FF',
  purple2: '#6633CC', black2: '#666666'
};

// --- 字体族映射 ---
window.NICO_FONTS = {
  gothic: '"Hiragino Sans", "Yu Gothic", "游ゴシック体", sans-serif',
  mincho: '"Hiragino Mincho ProN", "Yu Mincho", "游明朝体", serif',
  gulim: 'Gulim, "Hiragino Sans", sans-serif',
  simsun: 'SimSun, "Hiragino Mincho ProN", serif'
};

// --- 多层偏移常量 ---
window.MAX_OFFSET_LEVELS = 3;
window.OFFSET_STEP = 0.25;  // 可微调：0.22~0.28 之间最舒服

// --- 参考高度（px） ---
window.REF_HEIGHT = 1080;

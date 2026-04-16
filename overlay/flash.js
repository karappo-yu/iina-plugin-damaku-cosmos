/**
 * flash.js — Flash 弹幕文字预处理
 *
 * 处理 Flash 弹幕的特殊字符：Tab/空格替换、上下标（ruby）渲染。
 * 对应原项目: src/utils/flash.ts
 */

/**
 * HTML 转义
 */
function escapeHtml(text) {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/**
 * Flash 弹幕基础文本预处理（不含 ruby）
 * - Tab → 全角空格×2
 * - U+2000 → 全角空格
 */
window.preprocessFlashText = function (text) {
  let result = text;
  result = result.replace(/\t/g, '\u3000\u3000');
  result = result.replace(/\u2000/g, '\u3000');
  return result;
};

/**
 * Flash 弹幕文字预处理（含上下标 ruby 检测）
 *
 * 扫描文本中的 Unicode 上下标字符，将其包裹在 <span class="dm-ruby-super/sub"> 中。
 * 若不含任何上下标字符，直接返回纯文本。
 *
 * @param {string} text - 原始弹幕文本
 * @returns {{ hasRuby: boolean, html: string }}
 */
window.preprocessFlashTextWithRuby = function (text) {
  let result = text;
  result = result.replace(/\t/g, '\u3000\u3000');
  result = result.replace(/\u2000/g, '\u3000');

  const parts = [];
  let lastIndex = 0;
  let superCount = 0;
  let subCount = 0;

  // 合并上下标的正则
  const combinedRegex = /[\u00aa\u00b2\u00b3\u00b9\u00ba\u02b0\u02b2\u02b3\u02b7\u02b8\u02e1-\u02e3\u0304\u1d2c-\u1d43\u1d45-\u1d61\u1d9b-\u1da1\u1da3-\u1dbf\u2070\u2071\u2074-\u207f\u2c7d\u0320\u1d62-\u1d6a\u2080-\u208e\u2090-\u209c\u2c7c]/g;

  let match;
  while ((match = combinedRegex.exec(result)) !== null) {
    if (match.index > lastIndex) {
      parts.push({ type: 'text', content: result.slice(lastIndex, match.index) });
    }

    const char = match[0];
    const isSuper = FLASH_SCRIPT_CHAR.super.test(char);
    const isSub = FLASH_SCRIPT_CHAR.sub.test(char);

    if (isSuper || isSub) {
      parts.push({ type: isSuper ? 'super' : 'sub', content: char });
      if (isSuper) superCount++;
      if (isSub) subCount++;
    } else {
      parts.push({ type: 'text', content: char });
    }

    lastIndex = match.index + char.length;
  }

  if (lastIndex < result.length) {
    parts.push({ type: 'text', content: result.slice(lastIndex) });
  }

  // 无上下标，直接返回纯文本
  if (superCount === 0 && subCount === 0) {
    return { hasRuby: false, html: result };
  }

  // 生成带 ruby 标记的 HTML
  let html = '';
  for (const part of parts) {
    if (part.type === 'super') {
      html += `<span class="dm-ruby-super">${escapeHtml(part.content)}</span>`;
    } else if (part.type === 'sub') {
      html += `<span class="dm-ruby-sub">${escapeHtml(part.content)}</span>`;
    } else {
      html += escapeHtml(part.content);
    }
  }

  return { hasRuby: true, html };
};

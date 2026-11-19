// ==UserScript==
// @name         New API 常规 TPS（不含首字）
// @namespace    local.newapi.conv-tps
// @version      1.2.1
// @description  在 New API 用量日志的 t/s 旁追加“输出 tokens ÷ (耗时 − 首字)”的常规解码吞吐，并用独立胶囊样式区分。
// @match        *://*/*
// @run-at       document-idle
// @grant        none
// ==/UserScript==

/*
 * 背景
 * ----
 * 日志页原有的 t/s = completion_tokens / use_time，use_time 从请求开始计时，
 * 包含首字（TTFT）、排队和预填充，属于端到端吞吐。
 * 常规 TPS（解码吞吐）应为：
 *
 *     TPS = completion_tokens / (use_time - ttft)
 *
 * 本脚本不改站点代码，只在原 t/s 下方追加一个带 ≈ 的胶囊。
 *
 * TPS 区间
 * --------
 * use_time 只有整秒精度，真实总时长 d 满足 T-1 < d < T+1；
 * 首字 <60s 显示到 0.1s，>=60s 显示为 Xm Ys；记显示的舍入半宽为 h：
 *
 *     TPS >  N / (T + 1 - f + h)
 *     TPS <  N / (T - 1 - f - h)   （分母为正时）
 *
 * 胶囊显示这个区间；点估计只放在悬停提示里。
 * 当首字 >= 耗时、点估计不存在时，显示可确定的下界（≥x t/s）。
 * TPS >= 400 时通常解码窗口很短、区间很宽，脚本会弱化显示。
 *
 * 收窄作用范围
 * ------------
 * 默认 @match 覆盖所有站点，脚本只在 /usage-logs 路由下工作。
 * 建议把 @match 改成你的域名，例如：
 *     // @match https://your-newapi.example.com/*
 * 也可以保留默认匹配，在下方 CONFIG.allowedHosts 里填写域名。
 */

(() => {
  'use strict';

  /* ==================== 可调参数 ==================== */
  const CONFIG = {
    // 留空表示所有主机；填写后仅在这些 hostname 上运行，例如 ['api.example.com']
    allowedHosts: [],
    // 是否弱化原始 t/s（保留便于对比）
    dimOriginal: true,
    // 是否直接隐藏原始 t/s（优先级高于 dimOriginal）
    hideOriginal: false,
    // 首字 >= 耗时（点估计不存在）时是否显示下界 “≥x t/s”
    showUnavailable: true,
    // 点估计达到该 TPS、或区间只有下界时弱化显示：可信度偏低
    lowConfidenceTps: 400,
  };

  const MARKER_CLASS = 'newapi-conv-tps';
  const DIM_CLASS = 'newapi-orig-tps-dim';
  const STYLE_ID = 'newapi-conv-tps-style';
  const LOGS_PATH = /\/usage-logs(?:\/|$)/;

  let running = false;
  let observer = null;
  let frame = 0;

  /* ==================== 解析 ==================== */

  // "6.1s" / "23.0s" / "1m 40s" / "1m 60s" / "0.9s" -> 秒
  function parseSeconds(raw) {
    const text = (raw || '').replace(/\s+/g, ' ').trim();
    if (!text) return NaN;

    const minuteMatch = text.match(/(\d+(?:[.,]\d+)?)\s*m\b/i);
    const secondMatch = text.match(/(\d+(?:[.,]\d+)?)\s*s\b/i);
    const toNumber = (value) => Number.parseFloat(value.replace(',', '.'));

    if (minuteMatch || secondMatch) {
      const minutes = minuteMatch ? toNumber(minuteMatch[1]) : 0;
      const seconds = secondMatch ? toNumber(secondMatch[1]) : 0;
      return minutes * 60 + seconds;
    }

    if (/^\d+(?:[.,]\d+)?$/.test(text)) return toNumber(text);
    return NaN;
  }

  // prompt_tokens 单元格里的 "126,377 / 121"（或 de 等 locale 的 "126.377 / 121"）
  // 取最后一个分隔符后的数字串，忽略千位分隔符。
  function parseCompletionTokens(cell) {
    const span = cell.querySelector('span.tabular-nums');
    if (!span) return NaN;

    const text = span.textContent || '';
    const slash = text.lastIndexOf('/');
    if (slash < 0) return NaN;

    const digits = text.slice(slash + 1).replace(/\D/g, '');
    if (!digits) return NaN;

    const tokens = Number.parseInt(digits, 10);
    return tokens > 0 ? tokens : NaN;
  }

  const numberFormat = new Intl.NumberFormat();

  function formatInt(value) {
    return numberFormat.format(Math.round(value));
  }

  function formatSeconds(value) {
    return `${value.toFixed(1)}s`;
  }

  function formatTps(tps) {
    if (tps < 10) return `${tps.toFixed(1)} t/s`;
    return `${Math.round(tps)} t/s`;
  }

  function formatTpsRange(lower, upper) {
    if (!Number.isFinite(upper)) return `≥${formatTps(lower)}`;

    const format = (value) => (value < 10 ? value.toFixed(1) : `${Math.round(value)}`);
    const low = format(lower);
    const high = format(upper);
    return low === high ? `${low} t/s` : `${low}–${high} t/s`;
  }

  /* ==================== 渲染 ==================== */

  function updateRow(row) {
    const streamCell = row.querySelector('td[data-column-id="is_stream"]');
    if (!streamCell) return;

    const marker = streamCell.querySelector(`.${MARKER_CLASS}`);
    const original = streamCell.querySelector('span.tabular-nums');
    const timeCell = row.querySelector('td[data-column-id="use_time"]');
    const tokenCell = row.querySelector('td[data-column-id="prompt_tokens"]');

    const clear = () => {
      marker?.remove();
      if (original) {
        original.classList.remove(DIM_CLASS);
        original.style.display = '';
      }
    };

    if (!original || !timeCell || !tokenCell) {
      clear();
      return;
    }

    // use_time 单元格里按顺序是「首字」「耗时」；非流式只有「耗时」
    const timeValues = timeCell.querySelectorAll('.tabular-nums');
    if (timeValues.length < 2) {
      clear();
      return;
    }

    const ttftText = timeValues[0].textContent || '';
    const ttft = parseSeconds(ttftText);
    const total = parseSeconds(timeValues[1].textContent);
    const tokens = parseCompletionTokens(tokenCell);

    if (!Number.isFinite(ttft) || !Number.isFinite(total) || !Number.isFinite(tokens)) {
      clear();
      return;
    }

    // 首字 <60s 显示到 0.1s；>=60s 显示为 "Xm Ys"，秒数按整数舍入。
    const ttftHalfWidth = /\d\s*m\b/i.test(ttftText) ? 0.5 : 0.05;

    const pointDecode = total - ttft;
    const pointTps = pointDecode > 0.05 ? tokens / pointDecode : NaN;

    // 真实总时长 d 在 (total-1, total+1) 内，显示的首字在 ttft ± halfWidth 内。
    const maxDecode = total + 1 - (ttft - ttftHalfWidth);
    const minDecode = total - 1 - (ttft + ttftHalfWidth);
    const lower = tokens / maxDecode;
    const upper = minDecode > 0 ? tokens / minDecode : Infinity;

    const key = `${tokens}|${ttft}|${total}`;
    let text;
    let title;
    let state;

    if (!Number.isFinite(pointTps)) {
      if (!CONFIG.showUnavailable) {
        clear();
        return;
      }

      // 点估计不存在，但解码时间 < maxDecode，仍可给出下界。
      text = `≥${formatTps(lower)}`;
      state = 'low';
      title = [
        '常规 TPS（解码阶段，不含首字）',
        `首字 ${formatSeconds(ttft)} ≥ 耗时 ${formatSeconds(total)}`,
        `解码时间 < ${formatSeconds(maxDecode)}，因此 TPS > ${formatTps(lower)}`,
        '耗时按整秒截断；首字接近结束时只能确定下限。',
      ].join('\n');
    } else {
      const lowConfidence = pointTps >= CONFIG.lowConfidenceTps || !Number.isFinite(upper);
      text = Number.isFinite(upper)
        ? `≈${formatTpsRange(lower, upper)}`
        : `≥${formatTps(lower)}`;
      state = lowConfidence ? 'low' : 'ok';

      const lines = [
        '常规 TPS（解码阶段，不含首字）',
        `点估计 ≈${formatTps(pointTps)}`,
        `= ${formatInt(tokens)} tokens ÷ ${formatSeconds(pointDecode)}`,
        Number.isFinite(upper)
          ? `区间 ${formatTpsRange(lower, upper)}`
          : `下界 ${formatTps(lower)}`,
        '',
        '区间来源：耗时只有整秒精度（±1s），首字按显示精度舍入。',
      ];
      if (lowConfidence) {
        lines.push(
          `⚠ 可信度偏低：高 TPS 行通常解码窗口较短，整秒误差占比更大；请以区间为准。`
        );
      }
      title = lines.join('\n');
    }

    if (marker) {
      if (marker.dataset.key !== key) {
        marker.dataset.key = key;
        marker.dataset.state = state;
        marker.textContent = text;
        marker.title = title;
      }
    } else {
      const node = document.createElement('span');
      node.className = MARKER_CLASS;
      node.dataset.key = key;
      node.dataset.state = state;
      node.setAttribute('role', 'note');
      node.textContent = text;
      node.title = title;
      (original.parentElement || streamCell).appendChild(node);
    }

    original.classList.toggle(DIM_CLASS, CONFIG.dimOriginal && !CONFIG.hideOriginal);
    original.style.display = CONFIG.hideOriginal ? 'none' : '';
  }

  function scan() {
    const rows = document.querySelectorAll('tr[data-slot="table-row"]');
    for (const row of rows) {
      try {
        updateRow(row);
      } catch {
        // 单个行解析失败不影响其他行
      }
    }
  }

  function scheduleScan() {
    if (frame) return;
    frame = requestAnimationFrame(() => {
      frame = 0;
      scan();
    });
  }

  /* ==================== 样式 ==================== */

  function injectStyles() {
    if (document.getElementById(STYLE_ID)) return;

    const style = document.createElement('style');
    style.id = STYLE_ID;
    style.textContent = `
      .${MARKER_CLASS} {
        display: inline-flex;
        align-items: center;
        margin-top: 1px;
        padding: 0 5px;
        border: 1px dashed rgba(109, 40, 217, 0.55);
        border-radius: 999px;
        background: rgba(124, 58, 237, 0.10);
        color: #6d28d9;
        font-family: inherit;
        font-size: 11px;
        font-weight: 600;
        line-height: 16px;
        font-variant-numeric: tabular-nums;
        letter-spacing: 0;
        white-space: nowrap;
        cursor: help;
        user-select: none;
      }
      .${MARKER_CLASS}[data-state="low"] {
        border-style: dotted;
        opacity: 0.55;
        filter: grayscale(0.65);
        font-weight: 500;
      }
      html.dark .${MARKER_CLASS},
      .dark .${MARKER_CLASS} {
        color: #ddd6fe;
        border-color: rgba(196, 181, 253, 0.55);
        background: rgba(139, 92, 246, 0.20);
      }
      .${DIM_CLASS} {
        opacity: 0.5;
      }
    `;
    (document.head || document.documentElement).appendChild(style);
  }

  /* ==================== 生命周期 ==================== */

  function isLogsPage() {
    return LOGS_PATH.test(location.pathname + location.hash);
  }

  function hostAllowed() {
    return CONFIG.allowedHosts.length === 0 || CONFIG.allowedHosts.includes(location.hostname);
  }

  function start() {
    if (running || !document.body) return;
    running = true;

    injectStyles();
    scheduleScan();

    observer = new MutationObserver((records) => {
      for (const record of records) {
        // 忽略我们自己插入/更新胶囊引发的变更
        if (record.target instanceof Element && record.target.closest(`.${MARKER_CLASS}`)) {
          continue;
        }
        if (record.type === 'childList' && record.removedNodes.length === 0) {
          const added = Array.from(record.addedNodes);
          if (
            added.length > 0 &&
            added.every(
              (node) =>
                node.nodeType === Node.ELEMENT_NODE &&
                node.classList.contains(MARKER_CLASS)
            )
          ) {
            continue;
          }
        }
        scheduleScan();
        return;
      }
    });

    observer.observe(document.body, {
      childList: true,
      subtree: true,
      characterData: true,
    });
  }

  function stop() {
    if (!running) return;
    running = false;

    observer?.disconnect();
    observer = null;

    if (frame) {
      cancelAnimationFrame(frame);
      frame = 0;
    }

    document.querySelectorAll(`.${MARKER_CLASS}`).forEach((node) => node.remove());
    document.querySelectorAll(`.${DIM_CLASS}`).forEach((node) => node.classList.remove(DIM_CLASS));
  }

  function sync() {
    if (!hostAllowed()) {
      stop();
      return;
    }

    if (isLogsPage() || document.querySelector('td[data-column-id="is_stream"]')) {
      start();
    } else {
      stop();
    }
  }

  // SPA 路由变化：patch history，并监听 popstate/hashchange
  for (const method of ['pushState', 'replaceState']) {
    const original = history[method];
    if (typeof original !== 'function') continue;

    try {
      history[method] = function patchedHistoryMethod(...args) {
        const result = original.apply(this, args);
        queueMicrotask(sync);
        return result;
      };
    } catch {
      // 某些环境会冻结 history；此时仅依赖 popstate/hashchange
    }
  }

  window.addEventListener('popstate', sync);
  window.addEventListener('hashchange', sync);
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden) scheduleScan();
  });

  sync();
})();

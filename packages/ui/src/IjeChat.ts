import type { ChatChartSpec } from '@yoyomq/ije-core';
import { Ije } from '@yoyomq/ije-core';
import { createPoweredByYoyo } from './branding';

const CHART_PALETTE = ['#8A2BE2', '#6366f1', '#22c55e', '#f59e0b', '#ef4444', '#06b6d4', '#ec4899'];

function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function formatAnswer(text: string): string {
  return escapeHtml(text)
    .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
    .replace(/\n/g, '<br>');
}

function hexToRgb(hex: string): { r: number; g: number; b: number } | null {
  const clean = hex.replace('#', '');
  if (clean.length !== 6) return null;
  return {
    r: parseInt(clean.slice(0, 2), 16),
    g: parseInt(clean.slice(2, 4), 16),
    b: parseInt(clean.slice(4, 6), 16),
  };
}

// ─── Chart renderers ──────────────────────────────────────────────────────────

function renderBarChart(spec: ChatChartSpec, primaryColor: string): HTMLElement {
  const W = 360, H = 160;
  const padL = 34, padB = 28, padT = 10, padR = 10;
  const drawW = W - padL - padR;
  const drawH = H - padT - padB;

  const data = spec.datasets[0]?.data ?? [];
  const maxVal = Math.max(...data, 1);
  const barW = Math.min((drawW / data.length) - 6, 80);

  const rgb = hexToRgb(primaryColor);
  const fillAlpha = rgb ? `rgba(${rgb.r},${rgb.g},${rgb.b},0.15)` : primaryColor + '26';

  let rects = '';
  data.forEach((val, i) => {
    const bh = Math.max((val / maxVal) * drawH, 2);
    const bx = padL + (drawW / data.length) * i + ((drawW / data.length) - barW) / 2;
    const by = padT + drawH - bh;
    rects += `<rect x="${bx.toFixed(1)}" y="${by.toFixed(1)}" width="${barW.toFixed(1)}" height="${bh.toFixed(1)}" fill="${primaryColor}" opacity="0.85" rx="3"/>`;
    rects += `<rect x="${bx.toFixed(1)}" y="${by.toFixed(1)}" width="${barW.toFixed(1)}" height="2" fill="${primaryColor}" rx="1"/>`;
    const label = spec.labels[i] ?? '';
    rects += `<text x="${(bx + barW / 2).toFixed(1)}" y="${H - 6}" fill="#71717a" font-size="10" text-anchor="middle">${escapeHtml(label)}</text>`;
  });

  const axes = `
    <line x1="${padL}" y1="${padT}" x2="${padL}" y2="${padT + drawH}" stroke="#71717a" stroke-opacity="0.25" stroke-width="1"/>
    <line x1="${padL}" y1="${padT + drawH}" x2="${padL + drawW}" y2="${padT + drawH}" stroke="#71717a" stroke-opacity="0.25" stroke-width="1"/>
    <text x="${padL - 4}" y="${padT + 8}" fill="#71717a" font-size="10" text-anchor="end">${maxVal}</text>
    <text x="${padL - 4}" y="${padT + drawH}" fill="#71717a" font-size="10" text-anchor="end">0</text>
  `;

  const div = document.createElement('div');
  div.innerHTML = `<svg width="100%" viewBox="0 0 ${W} ${H}" xmlns="http://www.w3.org/2000/svg">${axes}${rects}</svg>`;
  return div;
}

function renderLineChart(spec: ChatChartSpec, primaryColor: string): HTMLElement {
  const W = 360, H = 160;
  const padL = 34, padB = 28, padT = 10, padR = 10;
  const drawW = W - padL - padR;
  const drawH = H - padT - padB;

  const data = spec.datasets[0]?.data ?? [];
  const maxVal = Math.max(...data, 1);
  const minVal = Math.min(...data, 0);
  const range = maxVal - minVal || 1;
  const step = data.length > 1 ? drawW / (data.length - 1) : drawW;

  const pts = data.map((v, i) => {
    const px = padL + step * i;
    const py = padT + drawH - ((v - minVal) / range) * drawH;
    return `${px.toFixed(1)},${py.toFixed(1)}`;
  });

  const dots = data.map((v, i) => {
    const px = padL + step * i;
    const py = padT + drawH - ((v - minVal) / range) * drawH;
    return `<circle cx="${px.toFixed(1)}" cy="${py.toFixed(1)}" r="3.5" fill="${primaryColor}" stroke="var(--yoyo-background,#fff)" stroke-width="1.5"/>`;
  }).join('');

  const xLabels = spec.labels.map((l, i) => {
    const px = padL + step * i;
    return `<text x="${px.toFixed(1)}" y="${H - 4}" fill="#71717a" font-size="10" text-anchor="middle">${escapeHtml(l)}</text>`;
  }).join('');

  const axes = `
    <line x1="${padL}" y1="${padT}" x2="${padL}" y2="${padT + drawH}" stroke="#71717a" stroke-opacity="0.25" stroke-width="1"/>
    <line x1="${padL}" y1="${padT + drawH}" x2="${padL + drawW}" y2="${padT + drawH}" stroke="#71717a" stroke-opacity="0.25" stroke-width="1"/>
    <text x="${padL - 4}" y="${padT + 8}" fill="#71717a" font-size="10" text-anchor="end">${maxVal}</text>
    <text x="${padL - 4}" y="${padT + drawH}" fill="#71717a" font-size="10" text-anchor="end">${minVal}</text>
  `;

  const rgb = hexToRgb(primaryColor);
  const areaFill = rgb ? `rgba(${rgb.r},${rgb.g},${rgb.b},0.1)` : primaryColor + '1a';
  const areaPoints = [...pts, `${(padL + step * (data.length - 1)).toFixed(1)},${padT + drawH}`, `${padL},${padT + drawH}`].join(' ');

  const div = document.createElement('div');
  div.innerHTML = `<svg width="100%" viewBox="0 0 ${W} ${H}" xmlns="http://www.w3.org/2000/svg">
    ${axes}
    <polygon points="${areaPoints}" fill="${areaFill}"/>
    <polyline points="${pts.join(' ')}" fill="none" stroke="${primaryColor}" stroke-width="2.5" stroke-linejoin="round" stroke-linecap="round"/>
    ${dots}
    ${xLabels}
  </svg>`;
  return div;
}

function renderPieChart(spec: ChatChartSpec): HTMLElement {
  const W = 340, H = 160;
  const cx = 80, cy = 80, r = 68;
  const data = spec.datasets[0]?.data ?? [];
  const total = data.reduce((s, v) => s + v, 0) || 1;

  let paths = '';
  let legendItems = '';
  let angle = -Math.PI / 2;

  data.forEach((val, i) => {
    const slice = (val / total) * 2 * Math.PI;
    const x1 = cx + r * Math.cos(angle);
    const y1 = cy + r * Math.sin(angle);
    angle += slice;
    const x2 = cx + r * Math.cos(angle);
    const y2 = cy + r * Math.sin(angle);
    const large = slice > Math.PI ? 1 : 0;
    const color = CHART_PALETTE[i % CHART_PALETTE.length];
    paths += `<path d="M${cx} ${cy} L${x1.toFixed(2)} ${y1.toFixed(2)} A${r} ${r} 0 ${large} 1 ${x2.toFixed(2)} ${y2.toFixed(2)} Z" fill="${color}"/>`;
    const pct = ((val / total) * 100).toFixed(0);
    legendItems += `
      <rect x="168" y="${12 + i * 22}" width="10" height="10" fill="${color}" rx="2"/>
      <text x="182" y="${22 + i * 22}" fill="#71717a" font-size="11">${escapeHtml(spec.labels[i] ?? '')} · ${pct}%</text>
    `;
  });

  const div = document.createElement('div');
  div.innerHTML = `<svg width="100%" viewBox="0 0 ${W} ${H}" xmlns="http://www.w3.org/2000/svg">
    ${paths}
    ${legendItems}
  </svg>`;
  return div;
}

function renderTable(spec: ChatChartSpec): HTMLElement {
  const div = document.createElement('div');
  div.style.overflowX = 'auto';

  const thStyle = 'padding:6px 10px;text-align:left;border-bottom:1px solid var(--yoyo-border,#e4e4e7);font-size:11px;font-weight:600;color:#71717a;white-space:nowrap;';
  const tdStyle = 'padding:5px 10px;font-size:12px;border-bottom:1px solid var(--yoyo-border,#e4e4e7);';

  const headers = ['', ...spec.datasets.map(d => d.label)];
  const headerHtml = headers.map(h => `<th style="${thStyle}">${escapeHtml(h)}</th>`).join('');

  const rowsHtml = spec.labels.map((label, i) =>
    `<tr>
      <td style="${tdStyle}font-weight:600;">${escapeHtml(label)}</td>
      ${spec.datasets.map(d => `<td style="${tdStyle}">${escapeHtml(String(d.data[i] ?? '—'))}</td>`).join('')}
    </tr>`
  ).join('');

  div.innerHTML = `<table style="width:100%;border-collapse:collapse;font-family:var(--yoyo-font,sans-serif);">
    <thead><tr>${headerHtml}</tr></thead>
    <tbody>${rowsHtml}</tbody>
  </table>`;
  return div;
}

function renderScatterChart(spec: ChatChartSpec, primaryColor: string): HTMLElement {
  const W = 360, H = 160;
  const padL = 34, padB = 28, padT = 10, padR = 10;
  const drawW = W - padL - padR;
  const drawH = H - padT - padB;

  const data = spec.datasets[0]?.data ?? [];
  const maxVal = Math.max(...data, 1);
  const step = data.length > 1 ? drawW / (data.length - 1) : drawW;

  const dots = data.map((v, i) => {
    const px = padL + step * i;
    const py = padT + drawH - (v / maxVal) * drawH;
    return `<circle cx="${px.toFixed(1)}" cy="${py.toFixed(1)}" r="4.5" fill="${primaryColor}" opacity="0.75"/>`;
  }).join('');

  const xLabels = spec.labels.map((l, i) => {
    const px = padL + step * i;
    return `<text x="${px.toFixed(1)}" y="${H - 4}" fill="#71717a" font-size="10" text-anchor="middle">${escapeHtml(l)}</text>`;
  }).join('');

  const div = document.createElement('div');
  div.innerHTML = `<svg width="100%" viewBox="0 0 ${W} ${H}" xmlns="http://www.w3.org/2000/svg">
    <line x1="${padL}" y1="${padT}" x2="${padL}" y2="${padT + drawH}" stroke="#71717a" stroke-opacity="0.25" stroke-width="1"/>
    <line x1="${padL}" y1="${padT + drawH}" x2="${padL + drawW}" y2="${padT + drawH}" stroke="#71717a" stroke-opacity="0.25" stroke-width="1"/>
    <text x="${padL - 4}" y="${padT + 8}" fill="#71717a" font-size="10" text-anchor="end">${maxVal}</text>
    ${dots}
    ${xLabels}
  </svg>`;
  return div;
}

function buildChartElement(spec: ChatChartSpec, primaryColor: string): HTMLElement {
  const wrapper = document.createElement('div');
  wrapper.style.cssText = 'margin-top:12px;border-radius:8px;overflow:hidden;background:rgba(128,128,128,0.07);padding:12px 12px 6px;';

  const titleEl = document.createElement('div');
  titleEl.style.cssText = 'font-size:10px;font-weight:600;text-transform:uppercase;letter-spacing:0.6px;color:#71717a;margin-bottom:8px;';
  titleEl.textContent = spec.title;
  wrapper.appendChild(titleEl);

  let chartEl: HTMLElement;
  switch (spec.chart_type) {
    case 'bar':     chartEl = renderBarChart(spec, primaryColor); break;
    case 'line':    chartEl = renderLineChart(spec, primaryColor); break;
    case 'pie':     chartEl = renderPieChart(spec); break;
    case 'table':   chartEl = renderTable(spec); break;
    case 'scatter': chartEl = renderScatterChart(spec, primaryColor); break;
    default:        chartEl = document.createElement('div');
  }

  wrapper.appendChild(chartEl);
  return wrapper;
}

// ─── Web Component ────────────────────────────────────────────────────────────

export class IjeChat extends HTMLElement {
  private messagesEl: HTMLDivElement | null = null;
  private inputEl: HTMLTextAreaElement | null = null;
  private sendBtn: HTMLButtonElement | null = null;
  private typingIndicatorEl: HTMLDivElement | null = null;
  private isLoading = false;

  static get observedAttributes() {
    return ['title', 'placeholder', 'height'];
  }

  connectedCallback() {
    this.style.cssText = `
      display:flex; flex-direction:column;
      width:${this.getAttribute('width') || '100%'};
      height:${this.getAttribute('height') || '520px'};
      font-family:var(--yoyo-font,sans-serif);
      border-radius:12px; overflow:hidden;
      border:1px solid var(--yoyo-border,#e4e4e7);
      background:var(--yoyo-background,#fff);
    `;
    this._renderShell();
  }

  private _renderShell() {
    const primaryColor = Ije.config?.theme?.primaryColor || '#8A2BE2';
    const titleText = this.getAttribute('title') || 'Fleet Assistant';
    const placeholder = this.getAttribute('placeholder') || 'Ask about your fleet…';

    // ── Header ──
    const header = document.createElement('div');
    header.style.cssText = `
      display:flex; align-items:center; justify-content:space-between;
      padding:12px 16px; flex-shrink:0;
      border-bottom:1px solid var(--yoyo-border,#e4e4e7);
      background:var(--yoyo-card-bg,#f4f4f5);
    `;

    const headerLeft = document.createElement('div');
    headerLeft.style.cssText = 'display:flex;align-items:center;gap:8px;';

    const iconWrap = document.createElement('div');
    iconWrap.style.cssText = `width:28px;height:28px;border-radius:6px;background:${primaryColor}22;color:${primaryColor};display:flex;align-items:center;justify-content:center;flex-shrink:0;`;
    iconWrap.innerHTML = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>`;

    const titleEl = document.createElement('span');
    titleEl.style.cssText = 'font-weight:600;font-size:14px;color:var(--yoyo-foreground,inherit);';
    titleEl.textContent = titleText;

    headerLeft.appendChild(iconWrap);
    headerLeft.appendChild(titleEl);

    const newChatBtn = document.createElement('button');
    newChatBtn.textContent = 'New Chat';
    newChatBtn.style.cssText = `
      font-size:11px;padding:4px 10px;border-radius:6px;cursor:pointer;
      border:1px solid var(--yoyo-border,#e4e4e7);
      background:var(--yoyo-background,#fff);
      color:var(--yoyo-muted,#888);font-family:inherit;
    `;
    newChatBtn.addEventListener('click', () => this._resetChat());

    header.appendChild(headerLeft);
    header.appendChild(newChatBtn);
    this.appendChild(header);

    // ── Messages area ──
    this.messagesEl = document.createElement('div');
    this.messagesEl.style.cssText = 'flex:1;overflow-y:auto;padding:16px;display:flex;flex-direction:column;gap:12px;';
    this.appendChild(this.messagesEl);

    // ── Typing indicator ──
    this.typingIndicatorEl = document.createElement('div');
    this.typingIndicatorEl.style.cssText = 'display:none;padding:0 16px 8px;flex-shrink:0;';
    this.typingIndicatorEl.innerHTML = `
      <div style="display:inline-flex;align-items:center;gap:4px;padding:8px 12px;background:var(--yoyo-card-bg,#f4f4f5);border-radius:14px;">
        <span style="width:6px;height:6px;border-radius:50%;background:#888;animation:ije-blink 1.2s ease-in-out infinite;"></span>
        <span style="width:6px;height:6px;border-radius:50%;background:#888;animation:ije-blink 1.2s ease-in-out 0.2s infinite;"></span>
        <span style="width:6px;height:6px;border-radius:50%;background:#888;animation:ije-blink 1.2s ease-in-out 0.4s infinite;"></span>
      </div>
    `;
    this.appendChild(this.typingIndicatorEl);

    if (!document.getElementById('ije-chat-keyframes')) {
      const styleTag = document.createElement('style');
      styleTag.id = 'ije-chat-keyframes';
      styleTag.textContent = '@keyframes ije-blink{0%,100%{opacity:.25;transform:scale(.85)}50%{opacity:1;transform:scale(1)}}';
      document.head.appendChild(styleTag);
    }

    // ── Input area ──
    const inputArea = document.createElement('div');
    inputArea.style.cssText = `
      display:flex;align-items:flex-end;gap:8px;padding:12px 16px;flex-shrink:0;
      border-top:1px solid var(--yoyo-border,#e4e4e7);
      background:var(--yoyo-card-bg,#f4f4f5);
    `;

    this.inputEl = document.createElement('textarea');
    this.inputEl.placeholder = placeholder;
    this.inputEl.rows = 1;
    this.inputEl.style.cssText = `
      flex:1;resize:none;border:1px solid var(--yoyo-border,#e4e4e7);
      border-radius:8px;padding:8px 12px;font-size:13px;font-family:inherit;
      background:var(--yoyo-background,#fff);color:var(--yoyo-foreground,inherit);
      outline:none;line-height:1.5;max-height:120px;overflow-y:auto;
    `;
    this.inputEl.addEventListener('keydown', e => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        this._handleSend();
      }
    });
    this.inputEl.addEventListener('input', () => {
      if (!this.inputEl) return;
      this.inputEl.style.height = 'auto';
      this.inputEl.style.height = `${Math.min(this.inputEl.scrollHeight, 120)}px`;
    });

    this.sendBtn = document.createElement('button');
    this.sendBtn.textContent = 'Send';
    this.sendBtn.style.cssText = `
      padding:8px 18px;border-radius:8px;border:none;cursor:pointer;
      background:${primaryColor};color:#fff;font-size:13px;font-weight:600;
      font-family:inherit;flex-shrink:0;transition:opacity 0.15s;
    `;
    this.sendBtn.addEventListener('click', () => this._handleSend());

    inputArea.appendChild(this.inputEl);
    inputArea.appendChild(this.sendBtn);
    this.appendChild(inputArea);

    // ── Powered by Yoyo ──
    const footer = createPoweredByYoyo();
    footer.style.justifyContent = 'center';
    footer.style.padding = '8px';
    footer.style.background = 'var(--yoyo-card-bg,#f4f4f5)';
    this.appendChild(footer);

    this._addMessage('assistant', 'Hi! I can answer questions about your fleet — try asking about device counts, speed trends, battery levels, or trip history.');
  }

  private _addMessage(role: 'user' | 'assistant', text: string, chart?: ChatChartSpec) {
    if (!this.messagesEl) return;
    const primaryColor = Ije.config?.theme?.primaryColor || '#8A2BE2';
    const isUser = role === 'user';

    const row = document.createElement('div');
    row.style.cssText = `display:flex;justify-content:${isUser ? 'flex-end' : 'flex-start'};`;

    const bubble = document.createElement('div');
    bubble.style.cssText = `
      max-width:88%;
      padding:10px 14px;
      border-radius:${isUser ? '16px 16px 4px 16px' : '16px 16px 16px 4px'};
      background:${isUser ? primaryColor : 'var(--yoyo-card-bg,#f4f4f5)'};
      color:${isUser ? '#fff' : 'var(--yoyo-foreground,inherit)'};
      font-size:13px;line-height:1.6;
    `;

    if (isUser) {
      bubble.textContent = text;
    } else {
      bubble.innerHTML = formatAnswer(text);
      if (chart) {
        bubble.appendChild(buildChartElement(chart, primaryColor));
      }
    }

    row.appendChild(bubble);
    this.messagesEl.appendChild(row);
    this.messagesEl.scrollTop = this.messagesEl.scrollHeight;
  }

  private _setLoading(loading: boolean) {
    this.isLoading = loading;
    if (this.typingIndicatorEl) {
      this.typingIndicatorEl.style.display = loading ? 'block' : 'none';
    }
    if (this.sendBtn) {
      this.sendBtn.disabled = loading;
      this.sendBtn.style.opacity = loading ? '0.5' : '1';
    }
    if (this.inputEl) {
      this.inputEl.disabled = loading;
    }
    if (loading && this.messagesEl) {
      this.messagesEl.scrollTop = this.messagesEl.scrollHeight;
    }
  }

  private async _handleSend() {
    if (this.isLoading || !this.inputEl) return;
    const question = this.inputEl.value.trim();
    if (!question) return;

    this.inputEl.value = '';
    this.inputEl.style.height = 'auto';
    this._addMessage('user', question);
    this._setLoading(true);

    try {
      const response = await Ije.chat.ask(question);
      this._addMessage('assistant', response.answer, response.chart);
    } catch (err) {
      console.error('[Ije] Chat error:', err);
      this._addMessage('assistant', 'Sorry, I ran into an error. Please try again.');
    } finally {
      this._setLoading(false);
      this.inputEl?.focus();
    }
  }

  private _resetChat() {
    if (this.messagesEl) this.messagesEl.innerHTML = '';
    Ije.chat.resetSession();
    this._addMessage('assistant', 'New conversation started. What would you like to know?');
  }
}

if (typeof window !== 'undefined') {
  customElements.define('ije-chat', IjeChat);
}

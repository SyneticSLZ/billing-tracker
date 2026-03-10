import { getTypeColor } from '../utils.js';

export function renderDonutChart(container, data) {
  if (!data.length || data.every(d => d.value === 0)) {
    container.innerHTML = '<div class="empty-state"><p>No data</p></div>';
    return;
  }

  const total = data.reduce((s, d) => s + d.value, 0);
  const size = 160;
  const cx = size / 2;
  const cy = size / 2;
  const r = 55;
  const strokeWidth = 20;

  let cumulative = 0;
  const segments = data.filter(d => d.value > 0).map(d => {
    const pct = d.value / total;
    const start = cumulative;
    cumulative += pct;
    return { ...d, pct, start, end: cumulative };
  });

  function arcPath(startPct, endPct) {
    const startAngle = startPct * 2 * Math.PI - Math.PI / 2;
    const endAngle = endPct * 2 * Math.PI - Math.PI / 2;
    const x1 = cx + r * Math.cos(startAngle);
    const y1 = cy + r * Math.sin(startAngle);
    const x2 = cx + r * Math.cos(endAngle);
    const y2 = cy + r * Math.sin(endAngle);
    const largeArc = (endPct - startPct) > 0.5 ? 1 : 0;
    return `M ${x1} ${y1} A ${r} ${r} 0 ${largeArc} 1 ${x2} ${y2}`;
  }

  let svg = `<svg width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">`;

  segments.forEach(seg => {
    if (seg.pct >= 0.999) {
      svg += `<circle cx="${cx}" cy="${cy}" r="${r}" fill="none" stroke="${seg.color}" stroke-width="${strokeWidth}" />`;
    } else {
      svg += `<path d="${arcPath(seg.start, seg.end)}" fill="none" stroke="${seg.color}" stroke-width="${strokeWidth}" stroke-linecap="round">
        <title>${seg.label}: ${seg.value} (${Math.round(seg.pct * 100)}%)</title>
      </path>`;
    }
  });

  svg += `<text x="${cx}" y="${cy - 6}" text-anchor="middle" fill="#e8eaf0" font-family="'Playfair Display', serif" font-size="22" font-weight="700">${total}</text>`;
  svg += `<text x="${cx}" y="${cy + 12}" text-anchor="middle" fill="#7a8499" font-family="'DM Mono', monospace" font-size="9">entries</text>`;
  svg += '</svg>';

  const legend = segments.map(s =>
    `<div class="legend-item"><span class="legend-dot" style="background:${s.color}"></span>${s.label}: ${s.value}</div>`
  ).join('');

  container.innerHTML = `<div><div class="chart-container">${svg}</div><div class="chart-legend">${legend}</div></div>`;
}

export function renderBarChart(container, data) {
  if (!data.length) {
    container.innerHTML = '<div class="empty-state"><p>No data</p></div>';
    return;
  }

  const maxVal = Math.max(...data.map(d => d.value), 1);
  const barWidth = Math.max(16, Math.min(36, Math.floor(600 / data.length) - 6));
  const gap = 4;
  const leftPad = 32;
  const chartWidth = Math.max(300, leftPad + data.length * (barWidth + gap) + 10);
  const chartHeight = 160;
  const bottomPad = 40;
  const topPad = 10;
  const barArea = chartHeight - bottomPad - topPad;

  // Use hardcoded colors (CSS vars don't work in SVG fill)
  const barColor = '#4fd1c5';
  const gridColor = '#2a3044';
  const labelColor = '#7a8499';

  let svg = `<svg width="100%" viewBox="0 0 ${chartWidth} ${chartHeight}" preserveAspectRatio="xMinYMid meet">`;

  // Grid lines
  const gridSteps = Math.min(4, maxVal);
  for (let i = 0; i <= gridSteps; i++) {
    const y = topPad + (barArea * i / gridSteps);
    svg += `<line x1="${leftPad}" y1="${y}" x2="${chartWidth}" y2="${y}" stroke="${gridColor}" stroke-width="0.5" />`;
    const label = Math.round(maxVal * (gridSteps - i) / gridSteps);
    svg += `<text x="${leftPad - 4}" y="${y + 3}" text-anchor="end" fill="${labelColor}" font-size="8" font-family="'DM Mono', monospace">${label}</text>`;
  }

  // Bars
  data.forEach((d, i) => {
    const x = leftPad + 4 + i * (barWidth + gap);
    const h = Math.max(1, (d.value / maxVal) * barArea);
    const y = topPad + barArea - h;

    svg += `<rect x="${x}" y="${y}" width="${barWidth}" height="${h}" rx="2" fill="${d.color || barColor}" opacity="0.85">
      <title>${d.fullLabel || d.label}: ${d.value} entries</title>
    </rect>`;

    // Value on top of bar (only if enough room)
    if (d.value > 0 && barWidth >= 16) {
      svg += `<text x="${x + barWidth / 2}" y="${y - 3}" text-anchor="middle" fill="${labelColor}" font-size="7" font-family="'DM Mono', monospace">${d.value}</text>`;
    }

    // X-axis label — show every label if <=20 bars, otherwise thin them out
    const showLabel = data.length <= 20 || i % Math.ceil(data.length / 15) === 0;
    if (showLabel) {
      svg += `<text x="${x + barWidth / 2}" y="${chartHeight - 4}" text-anchor="middle" fill="${labelColor}" font-size="7.5" font-family="'DM Mono', monospace">${d.label}</text>`;
    }
  });

  svg += '</svg>';
  container.innerHTML = `<div style="overflow-x:auto;padding-bottom:4px">${svg}</div>`;
}

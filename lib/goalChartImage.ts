import type { TreatmentModality } from './types';
import type { ExportTranslator } from './ehrExport';
import { formatLongDate } from './dates';

// ---------------------------------------------------------------------------
// Per-goal response chart → PNG, for pasting into the EHR.
//
// Renders ONE goal's weekly response as a self-contained image: goal text,
// the cycle header, the chart, and a one-line response caption. Deliberately
// PRINT-styled — white background, dark ink, a plain sans font, a fixed
// width — so it looks right dropped into a white record regardless of the
// app's (often dark) theme. NOT a screenshot of the on-screen chart; built
// fresh as an SVG string and rasterised to PNG via a canvas, the same
// approach FaceMap uses for its export image.
//
// NRS goals plot the raw 0–10 line with baseline/target reference lines;
// GAS goals plot the five attainment bands. Peak / wearing-off / end are
// computed on the direction-normalised GAS value (mirrors lib/ehrExport),
// so the caption matches the text export.
// ---------------------------------------------------------------------------

export interface GoalChartPoint {
  week: number;
  gas: number | null;
  nrs: number | null;
}

export interface GoalChartInput {
  goalText: string;
  kind?: 'nrs' | 'gas';
  nrsDirection?: 'higherIsBetter' | 'lowerIsBetter';
  nrsBaseline?: number | null;
  nrsTarget?: number | null;
  points: GoalChartPoint[];
  /** Physiotherapist + clinic-video comparison series, plotted on the same
   *  axis as the patient (drawn dimmer). Optional — omit for patient-only. */
  physioPoints?: GoalChartPoint[];
  clinicPoints?: GoalChartPoint[];
  /** Pre-translated legend labels. The PNG translator is scoped to
   *  ehrExport, which doesn't carry these, so the caller passes them in. */
  legend?: { patient: string; physio: string; clinic: string };
  header: { modality?: TreatmentModality; cycleNumber: number; startDate: string };
  /** Translator scoped to the `ehrExport` namespace. */
  t: ExportTranslator;
  locale: string;
}

// --- Geometry (logical px; rasterised at 2× for crispness) -----------------
const W = 680;
const H = 372;
const PLOT_R = 656;
const PLOT_TOP = 96;
const PLOT_BOTTOM = 264;
const PLOT_H = PLOT_BOTTOM - PLOT_TOP;
const NRS_PLOT_L = 52;
const GAS_PLOT_L = 190;
const FONT = "Arial, 'Helvetica Neue', Helvetica, sans-serif";

const C = {
  ink: '#1f2421',
  soft: '#4b5450',
  muted: '#8a8f88',
  faint: '#a8aca3',
  sageDeep: '#3f5a4b',
  grid: '#ece7da',
  grid0: '#cfd3c9',
  tint: '#eef4ef',
  baseLine: '#b3a884',
  baseText: '#8a7d5e',
  amber: '#bd7a1c',
  amberText: '#9a6a12',
  white: '#ffffff'
};

function esc(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function modalityKey(m?: TreatmentModality): string {
  switch (m) {
    case 'baclofen_pump':
      return 'modality_baclofen_pump';
    case 'surgery':
      return 'modality_surgery';
    case 'other':
      return 'modality_other';
    default:
      return 'modality_botulinum_toxin';
  }
}

function gasLevelLabel(v: number, t: ExportTranslator): string {
  switch (v) {
    case 2:
      return t('gasLevelMuchBetter');
    case 1:
      return t('gasLevelBetter');
    case 0:
      return t('gasLevelAsExpected');
    case -1:
      return t('gasLevelWorse');
    default:
      return t('gasLevelMuchWorse');
  }
}

interface TextLine {
  x: number;
  y: number;
  s: string;
  size: number;
  fill: string;
  weight?: number;
  anchor?: 'start' | 'middle' | 'end';
}

/** Build the complete chart SVG markup for one goal. */
function buildSvg(input: GoalChartInput): string {
  const { t, locale } = input;
  const isBont = !input.header.modality || input.header.modality === 'botulinum_toxin';
  const isNrs = input.kind === 'nrs';
  const plotL = isNrs ? NRS_PLOT_L : GAS_PLOT_L;
  const plotW = PLOT_R - plotL;

  const gasReports = input.points
    .filter((p) => typeof p.gas === 'number')
    .sort((a, b) => a.week - b.week) as { week: number; gas: number; nrs: number | null }[];
  const nrsPts = input.points
    .filter((p) => typeof p.nrs === 'number')
    .sort((a, b) => a.week - b.week) as { week: number; nrs: number }[];

  // Plot series depends on goal kind (NRS plots raw 0–10; otherwise GAS bands).
  const plotNrs = isNrs && nrsPts.length > 0;
  const series: { week: number; v: number }[] = plotNrs
    ? nrsPts.map((p) => ({ week: p.week, v: p.nrs }))
    : gasReports.map((p) => ({ week: p.week, v: p.gas }));

  const svg: string[] = [];
  const text: TextLine[] = [];
  const push = (s: string) => svg.push(s);

  // White card background.
  push(`<rect x="0" y="0" width="${W}" height="${H}" fill="${C.white}"/>`);

  // --- Heading block -----------------------------------------------------
  text.push({ x: 24, y: 34, s: input.goalText, size: 17, fill: C.ink, weight: 600 });

  // Subtitle.
  let subtitle = '';
  if (isNrs) {
    const scale = input.nrsDirection === 'lowerIsBetter' ? t('nrsScaleWorst') : t('nrsScaleBest');
    subtitle =
      input.nrsBaseline != null && input.nrsTarget != null
        ? t('nrsBaselineTarget', {
            baseline: input.nrsBaseline,
            target: input.nrsTarget,
            scale
          })
        : `NRS · ${scale}`;
  } else {
    subtitle = `GAS · ${t('chartGasScale')}`;
  }
  text.push({ x: 24, y: 55, s: subtitle, size: 12, fill: C.soft });

  // Cycle header.
  const headerVals = {
    modality: t(modalityKey(input.header.modality)),
    cycle: input.header.cycleNumber,
    date: formatLongDate(input.header.startDate, locale)
  };
  text.push({
    x: 24,
    y: 74,
    s: isBont ? t('headerInjected', headerVals) : t('header', headerVals),
    size: 11,
    fill: C.sageDeep
  });

  // --- Compute response (GAS-normalised) for caption + wearing marker ----
  let wearWeek: number | null = null;
  const captionLines: string[] = [];
  if (gasReports.length > 0) {
    const peak = gasReports.reduce((m, r) => Math.max(m, r.gas), -Infinity);
    const peakReport = gasReports.find((r) => r.gas === peak)!;
    const initial = gasReports[0].gas;
    const endReport = gasReports[gasReports.length - 1];
    const postPeak = gasReports.filter((r) => r.week > peakReport.week);
    const clear = postPeak.find(
      (r) => peak - r.gas >= 2 || (peak > initial && r.gas <= initial)
    );
    const possible = postPeak.find((r) => peak - r.gas >= 1);
    wearWeek = clear ? clear.week : possible ? possible.week : null;
    const wearing =
      wearWeek != null ? t('wearingOffFrom', { week: wearWeek }) : t('benefitSustained');

    if (plotNrs) {
      const lower = input.nrsDirection === 'lowerIsBetter';
      const best = nrsPts.reduce((m, r) => (lower ? (r.nrs < m.nrs ? r : m) : r.nrs > m.nrs ? r : m));
      const end = nrsPts[nrsPts.length - 1];
      captionLines.push(
        t('nrsBestEnd', {
          best: best.nrs,
          bestWeek: best.week,
          wearing,
          end: end.nrs,
          endWeek: end.week
        })
      );
    } else {
      captionLines.push(
        t('gasPeakLine', { week: peakReport.week, level: gasLevelLabel(peak, t), anchor: '' })
      );
      captionLines.push(
        t('gasEndLine', { week: endReport.week, level: gasLevelLabel(endReport.gas, t), wearing })
      );
    }
  } else {
    captionLines.push(t('noRatings'));
  }

  // --- Axes + grid -------------------------------------------------------
  const weeks = series.map((s) => s.week);
  const wMin = weeks.length ? Math.min(...weeks) : 1;
  const wMax = weeks.length ? Math.max(...weeks) : 1;
  const xFor = (w: number) =>
    wMax === wMin ? plotL + plotW / 2 : plotL + ((w - wMin) / (wMax - wMin)) * plotW;

  if (isNrs) {
    // 0–10 grid.
    for (let v = 0; v <= 10; v += 2) {
      const y = PLOT_BOTTOM - (v / 10) * PLOT_H;
      push(`<line x1="${plotL}" y1="${y}" x2="${PLOT_R}" y2="${y}" stroke="${C.grid}"/>`);
      text.push({ x: plotL - 8, y: y + 3.5, s: String(v), size: 10, fill: C.faint, anchor: 'end' });
    }
    const yForNrs = (v: number) => PLOT_BOTTOM - (v / 10) * PLOT_H;
    if (input.nrsBaseline != null) {
      const y = yForNrs(input.nrsBaseline);
      push(
        `<line x1="${plotL}" y1="${y}" x2="${PLOT_R}" y2="${y}" stroke="${C.baseLine}" stroke-width="1.2" stroke-dasharray="5 4"/>`
      );
      text.push({
        x: PLOT_R,
        y: y - 4,
        s: `${t('chartBaseline')} ${input.nrsBaseline}`,
        size: 10,
        fill: C.baseText,
        anchor: 'end'
      });
    }
    if (input.nrsTarget != null) {
      const y = yForNrs(input.nrsTarget);
      push(
        `<line x1="${plotL}" y1="${y}" x2="${PLOT_R}" y2="${y}" stroke="${C.sageDeep}" stroke-width="1.2" stroke-dasharray="5 4"/>`
      );
      text.push({
        x: PLOT_R,
        y: y - 4,
        s: `${t('chartTarget')} ${input.nrsTarget}`,
        size: 10,
        fill: C.sageDeep,
        anchor: 'end'
      });
    }
  } else {
    // GAS 5 bands (+2 top … −2 bottom). Faint tint for ≥0.
    const yForGas = (v: number) => PLOT_TOP + ((2 - v) / 4) * PLOT_H;
    push(
      `<rect x="${plotL}" y="${PLOT_TOP}" width="${plotW}" height="${yForGas(0) - PLOT_TOP}" fill="${C.tint}"/>`
    );
    const bands: [number, string][] = [
      [2, t('chartGasMuchBetter')],
      [1, t('chartGasBetter')],
      [0, t('chartGasExpected')],
      [-1, t('chartGasWorse')],
      [-2, t('chartGasMuchWorse')]
    ];
    for (const [v, label] of bands) {
      const y = yForGas(v);
      push(
        `<line x1="${plotL}" y1="${y}" x2="${PLOT_R}" y2="${y}" stroke="${v === 0 ? C.grid0 : C.grid}"/>`
      );
      text.push({
        x: plotL - 8,
        y: y + 3.5,
        s: label,
        size: 11,
        fill: v === 0 ? C.sageDeep : C.soft,
        anchor: 'end'
      });
    }
  }

  // --- Wearing-off marker ------------------------------------------------
  if (wearWeek != null && weeks.includes(wearWeek)) {
    const x = xFor(wearWeek);
    push(
      `<line x1="${x}" y1="${PLOT_TOP}" x2="${x}" y2="${PLOT_BOTTOM}" stroke="${C.amber}" stroke-width="1" stroke-dasharray="3 3"/>`
    );
  }

  // --- Series line (break on a week gap) + dots --------------------------
  const yForVal = (v: number) =>
    isNrs
      ? PLOT_BOTTOM - (v / 10) * PLOT_H
      : PLOT_TOP + ((2 - v) / 4) * PLOT_H;
  let seg: string[] = [];
  const flush = () => {
    if (seg.length >= 2)
      push(`<polyline points="${seg.join(' ')}" fill="none" stroke="${C.sageDeep}" stroke-width="2"/>`);
    seg = [];
  };
  let prevWeek: number | null = null;
  for (const p of series) {
    if (prevWeek !== null && p.week !== prevWeek + 1) flush();
    seg.push(`${xFor(p.week).toFixed(1)},${yForVal(p.v).toFixed(1)}`);
    prevWeek = p.week;
  }
  flush();
  for (const p of series)
    push(`<circle cx="${xFor(p.week).toFixed(1)}" cy="${yForVal(p.v).toFixed(1)}" r="3" fill="${C.sageDeep}"/>`);

  // --- Comparison series: physiotherapist + clinic video ------------------
  // Same axis as the patient (NRS goals plot .nrs, GAS goals plot .gas),
  // drawn dimmer so the patient's own line stays primary.
  const axisVal = (p: GoalChartPoint): number | null => (isNrs ? p.nrs : p.gas);
  const toSeries = (pts: GoalChartPoint[] | undefined) =>
    (pts ?? [])
      .map((p) => ({ week: p.week, v: axisVal(p) }))
      .filter((p): p is { week: number; v: number } => typeof p.v === 'number')
      .sort((a, b) => a.week - b.week);
  const physioSeries = toSeries(input.physioPoints);
  const clinicSeries = toSeries(input.clinicPoints);
  const drawSeries = (
    pts: { week: number; v: number }[],
    color: string,
    marker: 'diamond' | 'square',
    dash: string
  ) => {
    let s2: string[] = [];
    let prev: number | null = null;
    const flush2 = () => {
      if (s2.length >= 2)
        push(
          `<polyline points="${s2.join(' ')}" fill="none" stroke="${color}" stroke-width="1.5" stroke-dasharray="${dash}"/>`
        );
      s2 = [];
    };
    for (const p of pts) {
      if (prev !== null && p.week !== prev + 1) flush2();
      s2.push(`${xFor(p.week).toFixed(1)},${yForVal(p.v).toFixed(1)}`);
      prev = p.week;
    }
    flush2();
    for (const p of pts) {
      const cx = xFor(p.week);
      const cy = yForVal(p.v);
      if (marker === 'square')
        push(`<rect x="${(cx - 3).toFixed(1)}" y="${(cy - 3).toFixed(1)}" width="6" height="6" fill="${color}"/>`);
      else
        push(
          `<path d="M${cx.toFixed(1)} ${(cy - 4).toFixed(1)} L${(cx + 4).toFixed(1)} ${cy.toFixed(1)} L${cx.toFixed(1)} ${(cy + 4).toFixed(1)} L${(cx - 4).toFixed(1)} ${cy.toFixed(1)} Z" fill="${color}"/>`
        );
    }
  };
  drawSeries(physioSeries, C.amber, 'diamond', '3 2.5');
  drawSeries(clinicSeries, C.muted, 'square', '1 3');

  // --- Legend (only the series that actually have data) -------------------
  if (input.legend) {
    const L = input.legend;
    const legendItems: { label: string; color: string; dash: string }[] = [
      { label: L.patient, color: C.sageDeep, dash: '' }
    ];
    if (physioSeries.length > 0)
      legendItems.push({ label: L.physio, color: C.amber, dash: '3 2.5' });
    if (clinicSeries.length > 0)
      legendItems.push({ label: L.clinic, color: C.muted, dash: '1 3' });
    legendItems.forEach((it, i) => {
      const lx = 24 + i * 205;
      push(
        `<line x1="${lx}" y1="356" x2="${lx + 20}" y2="356" stroke="${it.color}" stroke-width="2"` +
          (it.dash ? ` stroke-dasharray="${it.dash}"` : '') +
          `/>`
      );
      text.push({ x: lx + 26, y: 360, s: it.label, size: 11, fill: C.soft });
    });
  }

  // --- X-axis week labels ------------------------------------------------
  const labelEvery = weeks.length > 12 ? 2 : 1;
  series.forEach((p, i) => {
    if (i % labelEvery !== 0 && i !== series.length - 1) return;
    text.push({ x: xFor(p.week), y: 280, s: String(p.week), size: 10, fill: C.faint, anchor: 'middle' });
  });
  text.push({
    x: (plotL + PLOT_R) / 2,
    y: 296,
    s: t('chartWeek'),
    size: 10,
    fill: C.muted,
    anchor: 'middle'
  });

  // --- Caption -----------------------------------------------------------
  captionLines.slice(0, 2).forEach((line, i) => {
    text.push({ x: 24, y: 320 + i * 16, s: line, size: 12, fill: C.soft });
  });

  // Emit text last so it sits above fills/lines.
  for (const tl of text) {
    push(
      `<text x="${tl.x}" y="${tl.y}" font-family="${FONT}" font-size="${tl.size}" fill="${tl.fill}"` +
        (tl.weight ? ` font-weight="${tl.weight}"` : '') +
        (tl.anchor ? ` text-anchor="${tl.anchor}"` : '') +
        `>${esc(tl.s)}</text>`
    );
  }

  return (
    `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">` +
    svg.join('') +
    `</svg>`
  );
}

function slug(s: string): string {
  return (
    s
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 40) || 'goal'
  );
}

/**
 * Build the goal's chart PNG and trigger a download. Resolves when the
 * download has been kicked off; rejects on a rasterisation failure so the
 * caller can surface a toast.
 */
export function downloadGoalChartPng(input: GoalChartInput): Promise<void> {
  const svgStr = buildSvg(input);
  const blob = new Blob([svgStr], { type: 'image/svg+xml;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const scale = 2;

  return new Promise<void>((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      try {
        const canvas = document.createElement('canvas');
        canvas.width = W * scale;
        canvas.height = H * scale;
        const ctx = canvas.getContext('2d');
        if (!ctx) {
          URL.revokeObjectURL(url);
          reject(new Error('no canvas context'));
          return;
        }
        ctx.setTransform(scale, 0, 0, scale, 0, 0);
        ctx.fillStyle = C.white;
        ctx.fillRect(0, 0, W, H);
        ctx.drawImage(img, 0, 0, W, H);
        URL.revokeObjectURL(url);
        canvas.toBlob((png) => {
          if (!png) {
            reject(new Error('toBlob failed'));
            return;
          }
          const a = document.createElement('a');
          const href = URL.createObjectURL(png);
          a.href = href;
          a.download = `goal-${slug(input.goalText)}.png`;
          document.body.appendChild(a);
          a.click();
          a.remove();
          URL.revokeObjectURL(href);
          resolve();
        }, 'image/png');
      } catch (err) {
        URL.revokeObjectURL(url);
        reject(err instanceof Error ? err : new Error('render failed'));
      }
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('image load failed'));
    };
    img.src = url;
  });
}

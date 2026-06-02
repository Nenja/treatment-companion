'use client';

/**
 * FaceMap — tap-to-place facial injection mapping.
 *
 * A controlled component: the parent owns the list of marks and the
 * display mode. Each mark is a located muscle injection — muscle + side +
 * dose plus a normalised position (0..1) on the base face image. The
 * muscle name is REQUIRED (a mark cannot be saved without it).
 *
 * Coordinates: internally the SVG works in image space (146 x 228, the
 * base image's own pixels, midline at x=73). Stored positions are
 * NORMALISED to 0..1 so they survive re-rendering and any base-image
 * change. We convert on the way in (posX*146) and out (x/146).
 *
 * Side is auto-detected from horizontal position (patient perspective:
 * patient-left = viewer-right = larger x), and is overridable.
 *
 * Ported from the standalone prototype (face-freeplace-prototype.html).
 * It does NOT suggest doses or flag muscles — it only records what the
 * clinician chose to inject.
 */

import { useRef, useState } from 'react';
import { useTranslations } from 'next-intl';
import type { FaceMarkInput, FaceDisplayMode } from '@/lib/supabase/clinicianPatient';

// Base image is 146 x 228; viewBox adds margins for the R/L side labels.
const IMG_W = 146;
const IMG_H = 228;

// Two base-face images to A/B during the pilot. Both are cropped to the
// same 146×228 frame, so a mark's normalised position lands on the same
// place regardless of which is shown. 'line' is the original line
// drawing; 'anatomical' is the muscle render. This is a local UI
// preference only — not persisted; we just want to learn which clinicians
// prefer.
type FaceModel = 'line' | 'anatomical';
const FACE_MODEL_SRC: Record<FaceModel, string> = {
  line: '/face-base.png',
  anatomical: '/face-base-anatomical.png'
};
const VIEW = { x: -26, y: -4, w: 198, h: 236 };
const MIDLINE = 73; // image-space x of the facial midline
const DEAD = 7; // dead-zone half-width around the midline → bilateral

const QUICK = [2.5, 5, 7.5, 10, 15];
const DOSE_LABELS = ['2.5 U', '5 U', '7.5 U', '10 U', '> 10 U'];
const DOSE_COLORS = ['#a9c2b3', '#6f9482', '#3f5a4b', '#2a3f33', '#16201a'];
const SYMBOL_INK = '#243029';

const MUSCLE_NAMES = [
  'Frontalis', 'Procerus', 'Corrugator supercilii',
  'Orbicularis oculi (upper lid, medial)', 'Orbicularis oculi (upper lid, lateral)',
  'Orbicularis oculi (lateral)', 'Orbicularis oculi (lower lid, medial)',
  'Orbicularis oculi (lower lid, lateral)', 'Nasalis',
  'Levator labii sup. alaeque nasi', 'Levator labii superioris',
  'Zygomaticus major', 'Zygomaticus minor', 'Risorius', 'Buccinator',
  'Orbicularis oris (upper)', 'Orbicularis oris (lower)',
  'Depressor anguli oris', 'Depressor labii inferioris', 'Mentalis', 'Platysma'
];

type Side = 'left' | 'right' | 'bilateral';

function bandIndex(d: number): number {
  if (d <= 2.5) return 0;
  if (d <= 5) return 1;
  if (d <= 7.5) return 2;
  if (d <= 10) return 3;
  return 4;
}
function fmt(n: number): string {
  return n % 1 === 0 ? String(n) : n.toFixed(1);
}
// patient-left = viewer-right = larger x
function sideFromX(x: number): Side {
  if (x < MIDLINE - DEAD) return 'right';
  if (x > MIDLINE + DEAD) return 'left';
  return 'bilateral';
}

// --- PNG export helpers ----------------------------------------------------
// These build SVG-string markup (not JSX) for the downloadable image. The
// shapes/sizes/colours mirror the on-screen rendering so the exported picture
// matches what the clinician placed. Ported from the prototype.
function escapeXml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function symbolSvgString(idx: number, x: number, y: number): string {
  const s = 3;
  if (idx === 0)
    return `<circle cx="${x}" cy="${y}" r="${s}" fill="none" stroke="${SYMBOL_INK}" stroke-width="1.4"/>`;
  if (idx === 1)
    return `<polygon points="${x},${y - s} ${x - s},${y + s} ${x + s},${y + s}" fill="${SYMBOL_INK}"/>`;
  if (idx === 2)
    return `<rect x="${x - s}" y="${y - s}" width="${s * 2}" height="${s * 2}" fill="${SYMBOL_INK}"/>`;
  if (idx === 3)
    return `<polygon points="${x},${y - s} ${x + s},${y} ${x},${y + s} ${x - s},${y}" fill="${SYMBOL_INK}"/>`;
  return (
    `<line x1="${x - s}" y1="${y - s}" x2="${x + s}" y2="${y + s}" stroke="${SYMBOL_INK}" stroke-width="1.6" stroke-linecap="round"/>` +
    `<line x1="${x - s}" y1="${y + s}" x2="${x + s}" y2="${y - s}" stroke="${SYMBOL_INK}" stroke-width="1.6" stroke-linecap="round"/>`
  );
}

function markSvgString(m: FaceMarkInput, mode: FaceDisplayMode): string {
  const x = m.posX * IMG_W;
  const y = m.posY * IMG_H;
  const idx = bandIndex(m.doseUnits);
  if (mode === 'color') {
    return (
      `<circle cx="${x}" cy="${y}" r="3.8" fill="#ffffff" stroke="#1f2421" stroke-width="0.7"/>` +
      `<circle cx="${x}" cy="${y}" r="3" fill="${DOSE_COLORS[idx]}" stroke="#ffffff" stroke-width="0.8"/>`
    );
  }
  return (
    `<circle cx="${x}" cy="${y}" r="4.2" fill="#ffffff" fill-opacity="0.75"/>` +
    symbolSvgString(idx, x, y)
  );
}

interface EditorState {
  index: number | null; // null = new mark
  xImg: number;
  yImg: number;
  dose: number | null;
  muscle: string;
  side: Side;
}

interface FaceMapProps {
  marks: FaceMarkInput[];
  onChange: (marks: FaceMarkInput[]) => void;
  displayMode: FaceDisplayMode;
  onDisplayModeChange: (mode: FaceDisplayMode) => void;
}

export function FaceMap({ marks, onChange, displayMode, onDisplayModeChange }: FaceMapProps) {
  const t = useTranslations('clinician.faceMap');
  const svgRef = useRef<SVGSVGElement | null>(null);
  const shellRef = useRef<HTMLDivElement | null>(null);
  const [editor, setEditor] = useState<EditorState | null>(null);
  const [downloading, setDownloading] = useState(false);
  // Which base-face image is shown (local A/B preference; see FaceModel).
  const [faceModel, setFaceModel] = useState<FaceModel>('line');

  const sideShort: Record<Side, string> = {
    right: t('sideRightShort'),
    left: t('sideLeftShort'),
    bilateral: t('sideMidShort')
  };

  // Convert a click to image-space coords via the SVG CTM.
  function eventToImg(evt: React.MouseEvent): { x: number; y: number } | null {
    const svg = svgRef.current;
    if (!svg) return null;
    const pt = svg.createSVGPoint();
    pt.x = evt.clientX;
    pt.y = evt.clientY;
    const ctm = svg.getScreenCTM();
    if (!ctm) return null;
    const p = pt.matrixTransform(ctm.inverse());
    return { x: p.x, y: p.y };
  }

  function openNewMark(evt: React.MouseEvent) {
    if (editor) return; // a click that closes the editor shouldn't also place
    const p = eventToImg(evt);
    if (!p) return;
    if (p.x < 0 || p.x > IMG_W || p.y < 0 || p.y > IMG_H) return;
    setEditor({ index: null, xImg: p.x, yImg: p.y, dose: null, muscle: '', side: sideFromX(p.x) });
  }

  function openEditMark(i: number) {
    const m = marks[i];
    setEditor({
      index: i,
      xImg: m.posX * IMG_W,
      yImg: m.posY * IMG_H,
      dose: m.doseUnits,
      muscle: m.muscle,
      side: m.side
    });
  }

  function closeEditor() {
    setEditor(null);
  }

  function saveEditor() {
    if (!editor || editor.dose == null || !editor.muscle.trim()) return;
    const mark: FaceMarkInput = {
      muscle: editor.muscle.trim(),
      side: editor.side,
      doseUnits: editor.dose,
      posX: editor.xImg / IMG_W,
      posY: editor.yImg / IMG_H
    };
    if (editor.index == null) {
      onChange([...marks, mark]);
    } else {
      const next = marks.slice();
      next[editor.index] = mark;
      onChange(next);
    }
    setEditor(null);
  }

  function deleteMark() {
    if (!editor || editor.index == null) {
      setEditor(null);
      return;
    }
    onChange(marks.filter((_, i) => i !== editor.index));
    setEditor(null);
  }

  // Copy one side's marks to the other: mirror across the midline
  // (posX -> 1 - posX, which is exact since the midline x=73 is half of
  // IMG_W=146) and flip the side. Originals are kept; the mirrored marks
  // are appended. Center / bilateral marks are NOT copied — they're not
  // on either side. A no-op if the source side has no marks.
  function copySide(from: 'left' | 'right') {
    const to: 'left' | 'right' = from === 'left' ? 'right' : 'left';
    const mirrored = marks
      .filter((m) => m.side === from)
      .map((m) => ({
        ...m,
        side: to,
        posX: 1 - m.posX
      }));
    if (mirrored.length === 0) return;
    onChange([...marks, ...mirrored]);
  }

  // Build a self-contained SVG string (base image inlined as a data URI,
  // title + R/L + dose legend baked in, marks generated from the live list)
  // for the PNG export. Mirrors the prototype's buildExportSVG.
  const buildExportSvg = (imgHref: string): string => {
    const padTop = 26;
    const padBottom = displayMode === 'color' ? 34 : 40;
    const outW = VIEW.w;
    const outH = VIEW.h + padTop + padBottom;
    const vy = VIEW.y - padTop;
    const ly = VIEW.y + VIEW.h + 16;
    const lx0 = VIEW.x + 4;

    const title = `<text x="${VIEW.x + VIEW.w / 2}" y="${VIEW.y - 10}" text-anchor="middle" font-family="Georgia,serif" font-size="11" font-weight="700" fill="#1f2421">${escapeXml(t('exportTitle'))}</text>`;
    const sideR = `<text x="${VIEW.x + 6}" y="${VIEW.y - 10}" font-family="sans-serif" font-size="7" font-weight="700" fill="#9a7c64">${escapeXml(t('sideRightShort'))}</text>`;
    const sideL = `<text x="${VIEW.x + VIEW.w - 6}" y="${VIEW.y - 10}" text-anchor="end" font-family="sans-serif" font-size="7" font-weight="700" fill="#9a7c64">${escapeXml(t('sideLeftShort'))}</text>`;

    let legX = lx0;
    const legParts: string[] = [
      `<text x="${legX}" y="${ly + 3}" font-family="sans-serif" font-size="8" font-weight="700" fill="#4b5450">${escapeXml(t('exportDose'))}</text>`
    ];
    legX += 26;
    DOSE_LABELS.forEach((lab, i) => {
      if (displayMode === 'color') {
        legParts.push(
          `<circle cx="${legX + 3}" cy="${ly}" r="3.4" fill="${DOSE_COLORS[i]}" stroke="#1f2421" stroke-width="0.5"/>`
        );
      } else {
        legParts.push(symbolSvgString(i, legX + 3, ly));
      }
      legParts.push(
        `<text x="${legX + 9}" y="${ly + 3}" font-family="sans-serif" font-size="7.5" fill="#4b5450">${escapeXml(lab)}</text>`
      );
      legX += 9 + lab.length * 4.0 + 7;
    });
    const legend = legParts.join('');
    const marksMarkup = marks.map((m) => markSvgString(m, displayMode)).join('');

    return (
      `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${VIEW.x} ${vy} ${outW} ${outH}" width="${outW}" height="${outH}">` +
      `<rect x="${VIEW.x}" y="${vy}" width="${outW}" height="${outH}" fill="#fbf8f2"/>` +
      `${title}${sideR}${sideL}` +
      `<image href="${imgHref}" x="0" y="0" width="${IMG_W}" height="${IMG_H}"/>` +
      `${marksMarkup}${legend}</svg>`
    );
  };

  // Rasterise the export SVG to a PNG and trigger a download. The base
  // image is fetched and inlined as a data URI first, so the canvas isn't
  // tainted by an external resource.
  const downloadPng = async () => {
    if (marks.length === 0 || downloading) return;
    setDownloading(true);
    try {
      const resp = await fetch(FACE_MODEL_SRC[faceModel]);
      const blob = await resp.blob();
      const imgHref = await new Promise<string>((resolve, reject) => {
        const fr = new FileReader();
        fr.onload = () => resolve(fr.result as string);
        fr.onerror = () => reject(new Error('read failed'));
        fr.readAsDataURL(blob);
      });
      const svgStr = buildExportSvg(imgHref);
      const svgBlob = new Blob([svgStr], {
        type: 'image/svg+xml;charset=utf-8'
      });
      const url = URL.createObjectURL(svgBlob);
      await new Promise<void>((resolve, reject) => {
        const img = new Image();
        img.onload = () => {
          const scale = 3; // crisp output
          const canvas = document.createElement('canvas');
          canvas.width = img.width * scale;
          canvas.height = img.height * scale;
          const ctx = canvas.getContext('2d');
          if (!ctx) {
            URL.revokeObjectURL(url);
            reject(new Error('no canvas context'));
            return;
          }
          ctx.scale(scale, scale);
          ctx.drawImage(img, 0, 0);
          URL.revokeObjectURL(url);
          canvas.toBlob((b) => {
            if (!b) {
              reject(new Error('toBlob failed'));
              return;
            }
            const a = document.createElement('a');
            a.href = URL.createObjectURL(b);
            a.download = 'face-dosing.png';
            document.body.appendChild(a);
            a.click();
            a.remove();
            setTimeout(() => URL.revokeObjectURL(a.href), 1000);
            resolve();
          }, 'image/png');
        };
        img.onerror = () => {
          URL.revokeObjectURL(url);
          reject(new Error('image load failed'));
        };
        img.src = url;
      });
    } catch {
      // If anything fails the button simply does nothing; nothing is
      // saved half-formed.
    } finally {
      setDownloading(false);
    }
  };

  // Editor popover screen position (mapped from image coords).
  function editorStyle(): React.CSSProperties {
    const svg = svgRef.current;
    const shell = shellRef.current;
    if (!svg || !shell || !editor) return {};
    const ctm = svg.getScreenCTM();
    if (!ctm) return {};
    const pt = svg.createSVGPoint();
    pt.x = editor.xImg;
    pt.y = editor.yImg;
    const sc = pt.matrixTransform(ctm);
    const shr = shell.getBoundingClientRect();
    let left = sc.x - shr.left + 14;
    let top = sc.y - shr.top - 8;
    if (left + 236 > shr.width) left = sc.x - shr.left - 246;
    if (left < 0) left = 4;
    top = Math.max(4, Math.min(top, shr.height - 250));
    return { left: `${left}px`, top: `${top}px` };
  }

  function renderSymbol(idx: number, x: number, y: number) {
    const s = 3;
    if (idx === 0) {
      return <circle cx={x} cy={y} r={s} fill="none" stroke={SYMBOL_INK} strokeWidth={1.4} />;
    }
    if (idx === 1) {
      return <polygon points={`${x},${y - s} ${x - s},${y + s} ${x + s},${y + s}`} fill={SYMBOL_INK} />;
    }
    if (idx === 2) {
      return <rect x={x - s} y={y - s} width={s * 2} height={s * 2} fill={SYMBOL_INK} />;
    }
    if (idx === 3) {
      return <polygon points={`${x},${y - s} ${x + s},${y} ${x},${y + s} ${x - s},${y}`} fill={SYMBOL_INK} />;
    }
    return (
      <g>
        <line x1={x - s} y1={y - s} x2={x + s} y2={y + s} stroke={SYMBOL_INK} strokeWidth={1.6} strokeLinecap="round" />
        <line x1={x - s} y1={y + s} x2={x + s} y2={y - s} stroke={SYMBOL_INK} strokeWidth={1.6} strokeLinecap="round" />
      </g>
    );
  }

  const total = marks.reduce((s, m) => s + m.doseUnits, 0);
  const left = marks.filter((m) => m.side === 'left').reduce((s, m) => s + m.doseUnits, 0);
  const right = marks.filter((m) => m.side === 'right').reduce((s, m) => s + m.doseUnits, 0);
  const leftCount = marks.filter((m) => m.side === 'left').length;
  const rightCount = marks.filter((m) => m.side === 'right').length;

  const editorValid = !!editor && editor.dose != null && editor.muscle.trim().length > 0;

  return (
    <div>
      {/* mode toggle */}
      <div className="mb-2.5 flex items-center gap-2">
        <span className="text-[13px] text-ink-muted">{t('marksLabel')}</span>
        <button
          type="button"
          onClick={() => onDisplayModeChange('color')}
          className={`rounded-[var(--radius-button)] border px-3 py-1.5 text-[13px] ${
            displayMode === 'color'
              ? 'border-sage-deep bg-sage-deep font-bold text-on-accent'
              : 'border-stone bg-cream text-ink-soft hover:bg-stone-soft'
          }`}
        >
          {t('modeColor')}
        </button>
        <button
          type="button"
          onClick={() => onDisplayModeChange('symbol')}
          className={`rounded-[var(--radius-button)] border px-3 py-1.5 text-[13px] ${
            displayMode === 'symbol'
              ? 'border-sage-deep bg-sage-deep font-bold text-on-accent'
              : 'border-stone bg-cream text-ink-soft hover:bg-stone-soft'
          }`}
        >
          {t('modeSymbol')}
        </button>
      </div>

      {/* face-model toggle (pilot A/B: line drawing vs muscle render) */}
      <div className="mb-2.5 flex items-center gap-2">
        <span className="text-[13px] text-ink-muted">{t('modelLabel')}</span>
        <button
          type="button"
          onClick={() => setFaceModel('line')}
          aria-pressed={faceModel === 'line'}
          className={`rounded-[var(--radius-button)] border px-3 py-1.5 text-[13px] ${
            faceModel === 'line'
              ? 'border-sage-deep bg-sage-deep font-bold text-on-accent'
              : 'border-stone bg-cream text-ink-soft hover:bg-stone-soft'
          }`}
        >
          {t('modelLine')}
        </button>
        <button
          type="button"
          onClick={() => setFaceModel('anatomical')}
          aria-pressed={faceModel === 'anatomical'}
          className={`rounded-[var(--radius-button)] border px-3 py-1.5 text-[13px] ${
            faceModel === 'anatomical'
              ? 'border-sage-deep bg-sage-deep font-bold text-on-accent'
              : 'border-stone bg-cream text-ink-soft hover:bg-stone-soft'
          }`}
        >
          {t('modelAnatomical')}
        </button>
      </div>

      {/* dose legend above the picture */}
      <div className="mb-3 rounded-[var(--radius-button)] border border-stone bg-stone-soft px-2.5 py-2 text-[13px] font-semibold text-ink-soft">
        <span className="mr-1">{displayMode === 'color' ? t('doseByColour') : t('doseBySymbol')}</span>
        {DOSE_LABELS.map((lab, i) => (
          <span key={lab} className="ml-3 inline-flex items-center gap-1.5 first:ml-2">
            {displayMode === 'color' ? (
              <span
                className="inline-block h-3 w-3 rounded-full align-middle"
                style={{ background: DOSE_COLORS[i] }}
              />
            ) : (
              <svg width={15} height={15} viewBox="0 0 16 16" className="align-middle">
                {renderSymbol(i, 8, 8)}
              </svg>
            )}
            {lab}
          </span>
        ))}
      </div>

      {/* the face + marks */}
      <div ref={shellRef} className="relative">
        <svg
          ref={svgRef}
          viewBox={`${VIEW.x} ${VIEW.y} ${VIEW.w} ${VIEW.h}`}
          className="block w-full cursor-crosshair touch-manipulation select-none"
          onClick={openNewMark}
          aria-label={t('canvasAria')}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <image href={FACE_MODEL_SRC[faceModel]} x={0} y={0} width={IMG_W} height={IMG_H} />
          <text x={-12} y={118} textAnchor="middle" fill="#9a7c64" fontSize={8} fontWeight={700} letterSpacing="0.06em">
            {t('sideRightShort')}
          </text>
          <text x={158} y={118} textAnchor="middle" fill="#9a7c64" fontSize={8} fontWeight={700} letterSpacing="0.06em">
            {t('sideLeftShort')}
          </text>

          {marks.map((m, i) => {
            const x = m.posX * IMG_W;
            const y = m.posY * IMG_H;
            const idx = bandIndex(m.doseUnits);
            const aria = `${m.muscle}, ${sideShort[m.side]}, ${fmt(m.doseUnits)} units. ${t('editHint')}`;
            return (
              <g
                key={i}
                role="button"
                tabIndex={0}
                aria-label={aria}
                className="cursor-pointer"
                onClick={(e) => {
                  e.stopPropagation();
                  openEditMark(i);
                }}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    openEditMark(i);
                  }
                }}
              >
                <circle cx={x} cy={y} r={9} fill="transparent" />
                {displayMode === 'color' ? (
                  <>
                    <circle cx={x} cy={y} r={3.8} fill="#ffffff" stroke="#1f2421" strokeWidth={0.7} />
                    <circle cx={x} cy={y} r={3} fill={DOSE_COLORS[idx]} stroke="#ffffff" strokeWidth={0.8} />
                  </>
                ) : (
                  <>
                    <circle cx={x} cy={y} r={4.2} fill="#ffffff" fillOpacity={0.75} />
                    {renderSymbol(idx, x, y)}
                  </>
                )}
              </g>
            );
          })}
        </svg>

        {/* editor popover */}
        {editor && (
          <div
            className="absolute z-30 w-[236px] rounded-[var(--radius-button)] border border-ink-muted bg-cream-soft p-3 shadow-xl"
            style={editorStyle()}
          >
            <h3 className="mb-2 font-display text-[14px] text-ink">
              {editor.index == null ? t('newMark') : t('editMark')}
            </h3>

            <label className="mb-0.5 block text-[11px] uppercase tracking-wide text-ink-muted">{t('doseField')}</label>
            <div className="mb-2 flex flex-wrap gap-1.5">
              {QUICK.map((q) => (
                <button
                  key={q}
                  type="button"
                  onClick={() => setEditor({ ...editor, dose: q })}
                  className={`rounded-[var(--radius-button)] border px-2.5 py-1.5 text-[13px] ${
                    editor.dose === q
                      ? 'border-sage-deep bg-sage font-bold text-on-accent'
                      : 'border-stone bg-cream text-ink-soft hover:bg-stone-soft'
                  }`}
                >
                  {q}
                </button>
              ))}
            </div>
            <input
              type="number"
              step="0.5"
              min="0"
              placeholder={t('customDose')}
              value={editor.dose != null && !QUICK.includes(editor.dose) ? editor.dose : ''}
              onChange={(e) => {
                const v = parseFloat(e.target.value);
                setEditor({ ...editor, dose: !isNaN(v) && v > 0 ? v : null });
              }}
              className="mb-2 block w-full rounded-[var(--radius-button)] border border-stone bg-cream px-2 py-1.5 text-[14px] text-ink"
            />

            <label className="mb-0.5 block text-[11px] uppercase tracking-wide text-ink-muted">{t('muscleRequired')}</label>
            <input
              type="text"
              list="face-muscle-names"
              placeholder={t('musclePlaceholder')}
              value={editor.muscle}
              onChange={(e) => setEditor({ ...editor, muscle: e.target.value })}
              className="mb-2 block w-full rounded-[var(--radius-button)] border border-stone bg-cream px-2 py-1.5 text-[14px] text-ink"
            />
            <datalist id="face-muscle-names">
              {MUSCLE_NAMES.map((n) => (
                <option key={n} value={n} />
              ))}
            </datalist>

            <label className="mb-0.5 block text-[11px] uppercase tracking-wide text-ink-muted">{t('sideField')}</label>
            <div className="mb-2 flex gap-1.5">
              {(['right', 'bilateral', 'left'] as Side[]).map((s) => (
                <button
                  key={s}
                  type="button"
                  onClick={() => setEditor({ ...editor, side: s })}
                  className={`flex-1 rounded-[var(--radius-button)] border px-1 py-1.5 text-[12px] ${
                    editor.side === s
                      ? 'border-sage-deep bg-sage-deep font-bold text-on-accent'
                      : 'border-stone bg-cream text-ink-soft hover:bg-stone-soft'
                  }`}
                >
                  {sideShort[s]}
                </button>
              ))}
            </div>

            {!editorValid && <p className="mb-1.5 text-[11px] text-amber-deep">{t('needDoseAndMuscle')}</p>}

            <div className="mt-1 flex justify-between gap-1.5">
              <button
                type="button"
                onClick={deleteMark}
                style={{ color: '#9a3b3b' }}
                className="rounded-[var(--radius-button)] border border-[#d8b9b9] bg-cream px-3 py-1.5 text-[13px] hover:bg-stone-soft"
              >
                {editor.index == null ? t('cancel') : t('remove')}
              </button>
              <button
                type="button"
                onClick={saveEditor}
                disabled={!editorValid}
                className="rounded-[var(--radius-button)] border border-sage-deep bg-sage-deep px-3 py-1.5 text-[13px] font-bold text-on-accent disabled:cursor-not-allowed disabled:border-stone disabled:bg-stone disabled:text-ink-muted"
              >
                {editor.index == null ? t('addMark') : t('save')}
              </button>
            </div>
          </div>
        )}
      </div>

      {/* compact running summary */}
      <div className="mt-3 flex gap-2">
        <SummaryBox n={fmt(total)} label={t('totalU')} />
        <SummaryBox n={fmt(left)} label={t('leftU')} />
        <SummaryBox n={fmt(right)} label={t('rightU')} />
        <SummaryBox n={String(marks.length)} label={t('marksCount')} />
      </div>
      {/* copy one side's marks to the other (mirror across the midline) */}
      <div className="mt-2 flex gap-2">
        <button
          type="button"
          onClick={() => copySide('right')}
          disabled={rightCount === 0}
          className="flex-1 rounded-[var(--radius-button)] border border-stone bg-cream-soft px-2 py-2 text-[13px] font-semibold text-sage-deep hover:bg-sage-soft disabled:cursor-not-allowed disabled:text-ink-muted disabled:hover:bg-cream-soft"
        >
          {t('copyRightToLeft')}
        </button>
        <button
          type="button"
          onClick={() => copySide('left')}
          disabled={leftCount === 0}
          className="flex-1 rounded-[var(--radius-button)] border border-stone bg-cream-soft px-2 py-2 text-[13px] font-semibold text-sage-deep hover:bg-sage-soft disabled:cursor-not-allowed disabled:text-ink-muted disabled:hover:bg-cream-soft"
        >
          {t('copyLeftToRight')}
        </button>
      </div>
      <button
        type="button"
        onClick={downloadPng}
        disabled={marks.length === 0 || downloading}
        className="mt-2 flex h-10 w-full items-center justify-center rounded-[var(--radius-button)] border border-stone bg-cream-soft text-[14px] font-semibold text-ink-soft hover:bg-stone-soft disabled:cursor-not-allowed disabled:text-ink-muted disabled:hover:bg-cream-soft"
      >
        {downloading ? '…' : t('download')}
      </button>
      {marks.length === 0 && (
        <p className="mt-2 text-[13px] text-ink-muted">{t('emptyHint')}</p>
      )}
    </div>
  );
}

function SummaryBox({ n, label }: { n: string; label: string }) {
  return (
    <div className="flex-1 rounded-[var(--radius-button)] border border-stone bg-stone-soft px-1.5 py-2.5 text-center">
      <div className="font-display text-[20px] font-semibold text-sage-deep">{n}</div>
      <div className="text-[11px] uppercase tracking-wide text-ink-muted">{label}</div>
    </div>
  );
}

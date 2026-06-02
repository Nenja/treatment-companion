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

import { useEffect, useRef, useState } from 'react';
import { useTranslations } from 'next-intl';
import { useToast } from '@/components/feedback/Toast';
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
// Dose-band colours. Re-spaced for monotonic LUMINANCE (light → dark) so
// the bands are as distinguishable as 5 steps allow (~2:1 between
// neighbours — 3:1 across five bands is geometrically impossible within
// black↔white) and so they degrade sensibly in greyscale and for
// colour-blind users. Colour is a quick visual cue only; the exact dose
// is also printed on every mark, so reading dose never depends on telling
// these greens apart.
const DOSE_COLORS = ['#eef3ee', '#a7c3ad', '#5f8369', '#324839', '#11180f'];
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
  const doseLabel =
    `<text x="${x}" y="${y + 8.5}" text-anchor="middle" font-family="sans-serif" ` +
    `font-size="5" font-weight="700" fill="#1f2421" stroke="#fbf8f2" stroke-width="1.1" ` +
    `paint-order="stroke">${fmt(m.doseUnits)}</text>`;
  if (mode === 'color') {
    return (
      `<circle cx="${x}" cy="${y}" r="3.8" fill="#ffffff" stroke="#1f2421" stroke-width="0.7"/>` +
      `<circle cx="${x}" cy="${y}" r="3" fill="${DOSE_COLORS[idx]}" stroke="#ffffff" stroke-width="0.8"/>` +
      doseLabel
    );
  }
  return (
    `<circle cx="${x}" cy="${y}" r="4.2" fill="#ffffff" fill-opacity="0.85" stroke="#1f2421" stroke-width="0.6"/>` +
    symbolSvgString(idx, x, y) +
    doseLabel
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
  /** Optional label (e.g. patient name) folded into the export filename
   *  so downloaded images don't all collide as "face-dosing.png". */
  exportLabel?: string;
}

export function FaceMap({ marks, onChange, displayMode, onDisplayModeChange, exportLabel }: FaceMapProps) {
  const t = useTranslations('clinician.faceMap');
  const svgRef = useRef<SVGSVGElement | null>(null);
  const shellRef = useRef<HTMLDivElement | null>(null);
  const popoverRef = useRef<HTMLDivElement | null>(null);
  const lastFocusedRef = useRef<HTMLElement | null>(null);
  const [editor, setEditor] = useState<EditorState | null>(null);
  const [downloading, setDownloading] = useState(false);
  const toast = useToast();
  // Copy-to-other-side is allowed once (a second copy would just stack
  // duplicates). Reset when the map is cleared.
  const [copied, setCopied] = useState(false);
  // Two-step confirm for the destructive "clear marks" action.
  const [confirmClear, setConfirmClear] = useState(false);
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

  // Non-spatial way to start a mark (keyboard / switch users, who can't
  // tap a position). Opens the editor at the midline, mid-face; the
  // clinician sets muscle/dose/side and can re-place by tapping later.
  function addMarkManually() {
    if (editor) return;
    setEditor({
      index: null,
      xImg: MIDLINE,
      yImg: IMG_H / 2,
      dose: null,
      muscle: '',
      side: sideFromX(MIDLINE)
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
    setCopied(true);
  }

  // Remove every mark and reset the per-session copy lock.
  function clearMarks() {
    onChange([]);
    setCopied(false);
    setConfirmClear(false);
    setEditor(null);
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

    const title = `<text x="${VIEW.x + VIEW.w / 2}" y="${VIEW.y - 12}" text-anchor="middle" font-family="Georgia,serif" font-size="11" font-weight="700" fill="#1f2421">${escapeXml(t('exportTitle'))}</text>`;
    // Date stamps the image itself (not just the filename) so a pasted /
    // printed copy stays self-identifying. Generation date (ISO).
    const dateStr = new Date().toISOString().slice(0, 10);
    const dateText = `<text x="${VIEW.x + VIEW.w / 2}" y="${VIEW.y - 3}" text-anchor="middle" font-family="sans-serif" font-size="6.5" fill="#686d69">${escapeXml(dateStr)}</text>`;
    const sideR = `<text x="${VIEW.x + 6}" y="${VIEW.y - 12}" font-family="sans-serif" font-size="7" font-weight="700" fill="#4b5450">${escapeXml(t('sideRightShort'))}</text>`;
    const sideL = `<text x="${VIEW.x + VIEW.w - 6}" y="${VIEW.y - 12}" text-anchor="end" font-family="sans-serif" font-size="7" font-weight="700" fill="#4b5450">${escapeXml(t('sideLeftShort'))}</text>`;

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
      `${title}${dateText}${sideR}${sideL}` +
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
            const stamp = new Date().toISOString().slice(0, 10);
            const base =
              (exportLabel ?? '')
                .toLowerCase()
                .replace(/[^a-z0-9]+/g, '-')
                .replace(/^-+|-+$/g, '') || 'face-dosing';
            a.download = `${base}-${stamp}.png`;
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
      toast.success(t('downloadDone'));
    } catch {
      // If anything fails, surface it rather than silently doing nothing;
      // nothing is saved half-formed.
      toast.error(t('downloadError'));
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

  // Per-side mark counts gate the copy buttons (nothing to copy from an
  // empty side). The dose totals that used to feed the on-map summary
  // were removed with that summary; the parent computes the cycle total.
  const leftCount = marks.filter((m) => m.side === 'left').length;
  const rightCount = marks.filter((m) => m.side === 'right').length;

  const editorValid = !!editor && editor.dose != null && editor.muscle.trim().length > 0;
  const editorOpen = editor != null;

  // Dialog focus management: when the editor opens, remember what was
  // focused and move focus into the popover (so screen readers announce
  // it and keyboard users land inside); restore focus to the trigger on
  // close. Keyed on open/close only, not on every field edit.
  useEffect(() => {
    if (editorOpen) {
      lastFocusedRef.current = (document.activeElement as HTMLElement) ?? null;
      const id = requestAnimationFrame(() => popoverRef.current?.focus());
      return () => cancelAnimationFrame(id);
    }
    lastFocusedRef.current?.focus?.();
  }, [editorOpen]);

  return (
    <div>
      {/* mode toggle */}
      <div className="mb-2.5 flex items-center gap-2">
        <span className="text-[13px] text-ink-muted">{t('marksLabel')}</span>
        <button
          type="button"
          onClick={() => onDisplayModeChange('color')}
          aria-pressed={displayMode === 'color'}
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
          aria-pressed={displayMode === 'symbol'}
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
          <text x={-12} y={118} textAnchor="middle" fill="#4b5450" fontSize={8} fontWeight={700} letterSpacing="0.06em">
            {t('sideRightShort')}
          </text>
          <text x={158} y={118} textAnchor="middle" fill="#4b5450" fontSize={8} fontWeight={700} letterSpacing="0.06em">
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
                    <circle cx={x} cy={y} r={4.2} fill="#ffffff" fillOpacity={0.85} stroke="#1f2421" strokeWidth={0.6} />
                    {renderSymbol(idx, x, y)}
                  </>
                )}
                {/* exact dose printed below the mark, with a light halo so
                    it reads on any background — so dose never depends on
                    telling the band colours/shapes apart. */}
                <text
                  x={x}
                  y={y + 8.5}
                  textAnchor="middle"
                  fontSize={5}
                  fontWeight={700}
                  fill="#1f2421"
                  stroke="#fbf8f2"
                  strokeWidth={1.1}
                  style={{ paintOrder: 'stroke' }}
                >
                  {fmt(m.doseUnits)}
                </text>
              </g>
            );
          })}
        </svg>

        {/* editor popover */}
        {editor && (
          <div
            ref={popoverRef}
            role="dialog"
            aria-modal="true"
            aria-label={editor.index == null ? t('newMark') : t('editMark')}
            tabIndex={-1}
            onKeyDown={(e) => {
              if (e.key === 'Escape') {
                e.preventDefault();
                e.stopPropagation();
                closeEditor();
              }
            }}
            className="absolute z-30 w-[236px] rounded-[var(--radius-button)] border border-ink-muted bg-cream-soft p-3 shadow-xl focus:outline-none"
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
                  aria-pressed={editor.dose === q}
                  className={`rounded-[var(--radius-button)] border px-2.5 py-1.5 text-[13px] ${
                    editor.dose === q
                      ? 'border-sage-deep bg-sage-deep font-bold text-on-accent'
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
              className="mb-2 block w-full rounded-[var(--radius-button)] border border-[#8f897c] bg-cream px-2 py-1.5 text-[14px] text-ink"
            />

            <label className="mb-0.5 block text-[11px] uppercase tracking-wide text-ink-muted">{t('muscleRequired')}</label>
            <input
              type="text"
              list="face-muscle-names"
              placeholder={t('musclePlaceholder')}
              value={editor.muscle}
              onChange={(e) => setEditor({ ...editor, muscle: e.target.value })}
              className="mb-2 block w-full rounded-[var(--radius-button)] border border-[#8f897c] bg-cream px-2 py-1.5 text-[14px] text-ink"
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
                  aria-pressed={editor.side === s}
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
                style={editor.index == null ? undefined : { color: '#9a3b3b' }}
                className={
                  editor.index == null
                    ? 'rounded-[var(--radius-button)] border border-stone bg-cream px-3 py-1.5 text-[13px] text-ink-soft hover:bg-stone-soft'
                    : 'rounded-[var(--radius-button)] border border-[#d8b9b9] bg-cream px-3 py-1.5 text-[13px] hover:bg-stone-soft'
                }
              >
                {editor.index == null ? t('cancel') : t('remove')}
              </button>
              <button
                type="button"
                onClick={saveEditor}
                disabled={!editorValid}
                className="rounded-[var(--radius-button)] border border-sage-deep bg-sage-deep px-3 py-1.5 text-[13px] font-bold text-on-accent disabled:cursor-not-allowed disabled:border-stone disabled:bg-stone disabled:text-ink-soft"
              >
                {editor.index == null ? t('addMark') : t('save')}
              </button>
            </div>
          </div>
        )}
      </div>

      {/* persistent instruction — always visible, so the core action is
          discoverable after the first mark too (not just on an empty map). */}
      <p className="mt-2 text-[12px] leading-snug text-ink-muted">{t('tapHint')}</p>

      {/* non-spatial add, for keyboard/switch users who can't tap a point */}
      <button
        type="button"
        onClick={addMarkManually}
        disabled={editorOpen}
        className="mt-2 rounded-[var(--radius-button)] border border-stone bg-cream-soft px-3 py-1.5 text-[13px] font-semibold text-sage-deep hover:bg-sage-soft disabled:cursor-not-allowed disabled:text-ink-muted"
      >
        {t('addManual')}
      </button>

      {/* finishing / management actions — copy, clear, export — kept
          visually separate from the add flow above so the map + add reads
          as the primary task and these read as "once you're done". */}
      <div className="mt-4 border-t border-stone/60 pt-3">
        {/* copy one side's marks to the other (mirror across the midline) */}
        <div className="flex gap-2">
        <button
          type="button"
          onClick={() => copySide('right')}
          disabled={copied || rightCount === 0}
          className="flex-1 rounded-[var(--radius-button)] border border-stone bg-cream-soft px-2 py-2 text-[13px] font-semibold text-sage-deep hover:bg-sage-soft disabled:cursor-not-allowed disabled:text-ink-muted disabled:hover:bg-cream-soft"
        >
          {t('copyRightToLeft')}
        </button>
        <button
          type="button"
          onClick={() => copySide('left')}
          disabled={copied || leftCount === 0}
          className="flex-1 rounded-[var(--radius-button)] border border-stone bg-cream-soft px-2 py-2 text-[13px] font-semibold text-sage-deep hover:bg-sage-soft disabled:cursor-not-allowed disabled:text-ink-muted disabled:hover:bg-cream-soft"
        >
          {t('copyLeftToRight')}
        </button>
      </div>
      {copied && (
        <p className="mt-1 text-[12px] text-ink-muted">{t('copiedNote')}</p>
      )}
      {/* clear all marks — destructive, so a two-step confirm guards it */}
      {marks.length > 0 &&
        (confirmClear ? (
          <div className="mt-2 flex items-center gap-2">
            <span className="text-[13px] text-ink-soft">{t('clearConfirm')}</span>
            <button
              type="button"
              onClick={clearMarks}
              style={{ color: '#9a3b3b' }}
              className="rounded-[var(--radius-button)] border border-[#d8b9b9] bg-cream px-3 py-1.5 text-[13px] font-semibold hover:bg-stone-soft"
            >
              {t('clearAll')}
            </button>
            <button
              type="button"
              onClick={() => setConfirmClear(false)}
              className="rounded-[var(--radius-button)] border border-stone bg-cream px-3 py-1.5 text-[13px] text-ink-soft hover:bg-stone-soft"
            >
              {t('cancel')}
            </button>
          </div>
        ) : (
          <button
            type="button"
            onClick={() => setConfirmClear(true)}
            style={{ color: '#9a3b3b' }}
            className="mt-2 w-full rounded-[var(--radius-button)] border border-[#d8b9b9] bg-cream-soft px-2 py-2 text-[13px] font-semibold hover:bg-stone-soft"
          >
            {t('clearMarks')}
          </button>
        ))}
        <button
          type="button"
          onClick={downloadPng}
          disabled={marks.length === 0 || downloading}
          className="mt-2 flex h-10 w-full items-center justify-center rounded-[var(--radius-button)] border border-stone bg-cream-soft text-[14px] font-semibold text-ink-soft hover:bg-stone-soft disabled:cursor-not-allowed disabled:text-ink-muted disabled:hover:bg-cream-soft"
        >
          {downloading ? '…' : t('download')}
        </button>
        <p className="mt-1 text-[12px] leading-snug text-ink-muted">
          {t('downloadHelper')}
        </p>
      </div>
    </div>
  );
}

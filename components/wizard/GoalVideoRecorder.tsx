'use client';

import { useEffect, useRef, useState } from 'react';
import { useTranslations } from 'next-intl';

const MAX_SECONDS = 30;

export interface RecordedVideo {
  blob: Blob;
  ext: 'mp4' | 'webm';
}

interface GoalVideoRecorderProps {
  /** The currently kept recording for this goal (if any). */
  value: RecordedVideo | null;
  /** Called when the patient keeps a clip (RecordedVideo) or removes it (null). */
  onChange: (v: RecordedVideo | null) => void;
}

type Phase = 'intro' | 'consent' | 'live' | 'recording' | 'preview' | 'kept' | 'error';

/** Pick the best-supported recording container; iOS Safari yields mp4,
 *  Chrome/Firefox yield webm. */
function pickMime(): { mimeType?: string; ext: 'mp4' | 'webm' } {
  if (typeof MediaRecorder === 'undefined') return { ext: 'webm' };
  const candidates = [
    'video/mp4',
    'video/webm;codecs=vp9,opus',
    'video/webm;codecs=vp8,opus',
    'video/webm'
  ];
  for (const m of candidates) {
    try {
      if (MediaRecorder.isTypeSupported(m)) {
        return { mimeType: m, ext: m.startsWith('video/mp4') ? 'mp4' : 'webm' };
      }
    } catch {
      /* isTypeSupported can throw on some engines; keep trying */
    }
  }
  return { ext: 'webm' };
}

/**
 * Optional short (≤30s) video for a goal at check-in. Flow: intro →
 * explicit consent → live camera → record → preview → keep / re-record.
 * The kept clip is handed to the parent via onChange; the parent uploads
 * it to Storage on submit. Recording is unsupported on very old browsers,
 * in which case we say so rather than offering a broken control.
 */
export function GoalVideoRecorder({ value, onChange }: GoalVideoRecorderProps) {
  const t = useTranslations('goalVideo');
  const supported =
    typeof navigator !== 'undefined' &&
    !!navigator.mediaDevices?.getUserMedia &&
    typeof MediaRecorder !== 'undefined';

  const [phase, setPhase] = useState<Phase>(value ? 'kept' : 'intro');
  const [elapsed, setElapsed] = useState(0);
  const [errorMsg, setErrorMsg] = useState('');

  const liveRef = useRef<HTMLVideoElement | null>(null);
  const previewRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const timerRef = useRef<number | null>(null);
  const previewUrlRef = useRef<string | null>(null);

  function stopStream() {
    streamRef.current?.getTracks().forEach((tr) => tr.stop());
    streamRef.current = null;
  }
  function clearTimer() {
    if (timerRef.current != null) {
      window.clearInterval(timerRef.current);
      timerRef.current = null;
    }
  }
  function revokePreview() {
    if (previewUrlRef.current) {
      URL.revokeObjectURL(previewUrlRef.current);
      previewUrlRef.current = null;
    }
  }

  // Tear everything down on unmount.
  useEffect(() => {
    return () => {
      clearTimer();
      stopStream();
      revokePreview();
      try {
        recorderRef.current?.stop();
      } catch {
        /* already stopped */
      }
    };
  }, []);

  async function startCamera() {
    setErrorMsg('');
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'user' },
        audio: true
      });
      streamRef.current = stream;
      setPhase('live');
      // Attach after the <video> is in the DOM.
      requestAnimationFrame(() => {
        if (liveRef.current) {
          liveRef.current.srcObject = stream;
          liveRef.current.muted = true;
          void liveRef.current.play().catch(() => {});
        }
      });
    } catch {
      setErrorMsg(t('cameraError'));
      setPhase('error');
    }
  }

  function startRecording() {
    const stream = streamRef.current;
    if (!stream) return;
    const { mimeType } = pickMime();
    chunksRef.current = [];
    let recorder: MediaRecorder;
    try {
      recorder = mimeType
        ? new MediaRecorder(stream, { mimeType })
        : new MediaRecorder(stream);
    } catch {
      setErrorMsg(t('notSupported'));
      setPhase('error');
      return;
    }
    recorderRef.current = recorder;
    recorder.ondataavailable = (e) => {
      if (e.data && e.data.size > 0) chunksRef.current.push(e.data);
    };
    recorder.onstop = () => {
      clearTimer();
      const type = recorderRef.current?.mimeType || chunksRef.current[0]?.type || '';
      const blob = new Blob(chunksRef.current, { type: type || undefined });
      revokePreview();
      const url = URL.createObjectURL(blob);
      previewUrlRef.current = url;
      setPhase('preview');
      requestAnimationFrame(() => {
        if (previewRef.current) {
          previewRef.current.src = url;
        }
      });
    };
    recorder.start();
    setElapsed(0);
    setPhase('recording');
    timerRef.current = window.setInterval(() => {
      setElapsed((s) => {
        const next = s + 1;
        if (next >= MAX_SECONDS) stopRecording();
        return next;
      });
    }, 1000);
  }

  function stopRecording() {
    clearTimer();
    try {
      if (recorderRef.current && recorderRef.current.state !== 'inactive') {
        recorderRef.current.stop();
      }
    } catch {
      /* ignore */
    }
  }

  function keepVideo() {
    const type = recorderRef.current?.mimeType || chunksRef.current[0]?.type || '';
    const ext: 'mp4' | 'webm' = type.includes('mp4') ? 'mp4' : 'webm';
    const blob = new Blob(chunksRef.current, { type: type || undefined });
    stopStream(); // turn the camera off once we've got the clip
    onChange({ blob, ext });
    setPhase('kept');
  }

  function reRecord() {
    revokePreview();
    chunksRef.current = [];
    setElapsed(0);
    // Camera may already be off (after keep); re-acquire if needed.
    if (streamRef.current) {
      setPhase('live');
      requestAnimationFrame(() => {
        if (liveRef.current) {
          liveRef.current.srcObject = streamRef.current;
          void liveRef.current.play().catch(() => {});
        }
      });
    } else {
      void startCamera();
    }
  }

  function removeVideo() {
    revokePreview();
    stopStream();
    chunksRef.current = [];
    onChange(null);
    setPhase('intro');
  }

  function cancelToIntro() {
    stopStream();
    revokePreview();
    chunksRef.current = [];
    setElapsed(0);
    setPhase(value ? 'kept' : 'intro');
  }

  if (!supported) {
    return (
      <div className="mt-3 rounded-[var(--radius-button)] border border-stone bg-stone-soft px-3 py-2 text-[13px] text-ink-soft">
        {t('notSupported')}
      </div>
    );
  }

  const box =
    'mt-3 rounded-[var(--radius-card)] border border-stone bg-cream-soft p-3';
  const btn =
    'rounded-[var(--radius-button)] px-3 py-2 text-[14px] font-semibold';
  const btnPrimary = `${btn} bg-sage-deep text-on-accent hover:bg-ink-soft`;
  const btnNeutral = `${btn} border border-stone bg-cream text-ink-soft hover:bg-stone-soft`;
  const btnDanger = `${btn} border border-[#d8b9b9] bg-cream text-[#9a3b3b] hover:bg-stone-soft`;

  return (
    <div className={box}>
      {phase === 'intro' && (
        <div>
          <p className="text-[14px] font-semibold text-ink">{t('introTitle')}</p>
          <p className="mt-1 text-[13px] text-ink-soft">{t('introHelp')}</p>
          <button
            type="button"
            onClick={() => setPhase('consent')}
            className={`${btnNeutral} mt-3`}
          >
            {t('recordCta')}
          </button>
        </div>
      )}

      {phase === 'consent' && (
        <div>
          <p className="text-[14px] font-semibold text-ink">{t('consentTitle')}</p>
          <p className="mt-1 text-[13px] leading-relaxed text-ink-soft">
            {t('consentBody')}
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            <button type="button" onClick={startCamera} className={btnPrimary}>
              {t('consentAgree')}
            </button>
            <button type="button" onClick={cancelToIntro} className={btnNeutral}>
              {t('consentCancel')}
            </button>
          </div>
        </div>
      )}

      {(phase === 'live' || phase === 'recording') && (
        <div>
          <div className="overflow-hidden rounded-[var(--radius-button)] bg-ink">
            <video
              ref={liveRef}
              className="aspect-video w-full object-cover"
              playsInline
              muted
            />
          </div>
          <div className="mt-2 flex items-center justify-between">
            <span className="text-[13px] font-semibold text-ink-soft">
              {phase === 'recording'
                ? t('secondsLeft', { n: Math.max(0, MAX_SECONDS - elapsed) })
                : t('readyToRecord')}
            </span>
            {phase === 'live' ? (
              <div className="flex gap-2">
                <button type="button" onClick={startRecording} className={btnPrimary}>
                  {t('record')}
                </button>
                <button type="button" onClick={cancelToIntro} className={btnNeutral}>
                  {t('consentCancel')}
                </button>
              </div>
            ) : (
              <button type="button" onClick={stopRecording} className={btnDanger}>
                {t('stop')}
              </button>
            )}
          </div>
        </div>
      )}

      {phase === 'preview' && (
        <div>
          <div className="overflow-hidden rounded-[var(--radius-button)] bg-ink">
            <video
              ref={previewRef}
              className="aspect-video w-full object-cover"
              controls
              playsInline
            />
          </div>
          <div className="mt-2 flex flex-wrap gap-2">
            <button type="button" onClick={keepVideo} className={btnPrimary}>
              {t('useVideo')}
            </button>
            <button type="button" onClick={reRecord} className={btnNeutral}>
              {t('reRecord')}
            </button>
            <button type="button" onClick={removeVideo} className={btnDanger}>
              {t('discard')}
            </button>
          </div>
        </div>
      )}

      {phase === 'kept' && (
        <div className="flex items-center justify-between gap-2">
          <span className="flex items-center gap-1.5 text-[14px] font-semibold text-sage-deep">
            <svg aria-hidden width="16" height="16" viewBox="0 0 16 16">
              <path
                d="M3 8.5 L6.5 12 L13 4.5"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
            {t('ready')}
          </span>
          <div className="flex gap-2">
            <button type="button" onClick={reRecord} className={btnNeutral}>
              {t('reRecord')}
            </button>
            <button type="button" onClick={removeVideo} className={btnDanger}>
              {t('remove')}
            </button>
          </div>
        </div>
      )}

      {phase === 'error' && (
        <div>
          <p className="text-[13px] text-[#9a3b3b]">{errorMsg || t('cameraError')}</p>
          <button
            type="button"
            onClick={cancelToIntro}
            className={`${btnNeutral} mt-3`}
          >
            {t('back')}
          </button>
        </div>
      )}
    </div>
  );
}

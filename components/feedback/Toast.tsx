'use client';

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode
} from 'react';

type ToastKind = 'success' | 'error';

interface Toast {
  id: number;
  kind: ToastKind;
  message: string;
}

interface ToastContextValue {
  show: (kind: ToastKind, message: string) => void;
  success: (message: string) => void;
  error: (message: string) => void;
}

const ToastContext = createContext<ToastContextValue | null>(null);

/**
 * Single global toast queue. Toasts auto-dismiss after a few seconds
 * (success: 3s, error: 6s — errors get longer because they're more
 * important). Manual dismiss via the × button. New toasts append to a
 * stack so a flurry of events doesn't lose any. Stack is bounded so we
 * don't pile up dozens during a bug; oldest gets dropped.
 *
 * Positioned bottom-center with safe-area inset so iOS home indicator
 * doesn't overlap. The toast itself is wide-but-short and reads as a
 * pill so it doesn't feel like a modal.
 *
 * No animation library; just a CSS transition on opacity + translateY.
 */
export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const nextId = useRef(1);

  const dismiss = useCallback((id: number) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const show = useCallback(
    (kind: ToastKind, message: string) => {
      const id = nextId.current++;
      setToasts((prev) => {
        const next = [...prev, { id, kind, message }];
        // Keep at most 3 visible.
        return next.slice(-3);
      });
      const timeoutMs = kind === 'error' ? 10000 : 5000;
      setTimeout(() => dismiss(id), timeoutMs);
    },
    [dismiss]
  );

  const value: ToastContextValue = {
    show,
    success: (msg) => show('success', msg),
    error: (msg) => show('error', msg)
  };

  return (
    <ToastContext.Provider value={value}>
      {children}
      <ToastViewport toasts={toasts} onDismiss={dismiss} />
    </ToastContext.Provider>
  );
}

export function useToast(): ToastContextValue {
  const ctx = useContext(ToastContext);
  if (!ctx) {
    // Hook called outside the provider — surface clearly so it's
    // caught in dev. In production, fall back to console as a
    // last-resort signal.
    if (process.env.NODE_ENV !== 'production') {
      throw new Error('useToast must be used within a ToastProvider');
    }
    return {
      show: (kind, msg) => console[kind === 'error' ? 'error' : 'log'](msg),
      success: (msg) => console.log(msg),
      error: (msg) => console.error(msg)
    };
  }
  return ctx;
}

function ToastViewport({
  toasts,
  onDismiss
}: {
  toasts: Toast[];
  onDismiss: (id: number) => void;
}) {
  return (
    <div
      aria-live="polite"
      aria-atomic="false"
      className="pointer-events-none fixed inset-x-0 bottom-0 z-[100] flex flex-col items-center gap-2 px-4 pb-[max(1rem,env(safe-area-inset-bottom))]"
    >
      {toasts.map((t) => (
        <ToastItem key={t.id} toast={t} onDismiss={() => onDismiss(t.id)} />
      ))}
    </div>
  );
}

function ToastItem({
  toast,
  onDismiss
}: {
  toast: Toast;
  onDismiss: () => void;
}) {
  // Slide-in via class transition: mounts in `entering` then flips to
  // `entered` on next frame. Standard "css transitions need a layout
  // pass" pattern.
  const [entered, setEntered] = useState(false);
  useEffect(() => {
    const id = requestAnimationFrame(() => setEntered(true));
    return () => cancelAnimationFrame(id);
  }, []);

  const baseClasses =
    'pointer-events-auto flex max-w-[440px] items-start gap-3 rounded-[var(--radius-card)] border px-4 py-3 text-[14px] leading-relaxed shadow-lg transition-all duration-200';
  const tonal =
    toast.kind === 'error'
      ? 'border-amber-deep/40 bg-amber-soft text-ink'
      : 'border-sage/40 bg-sage-soft text-ink';

  const visibility = entered
    ? 'translate-y-0 opacity-100'
    : 'translate-y-2 opacity-0';

  return (
    <div role="status" className={`${baseClasses} ${tonal} ${visibility}`}>
      <span aria-hidden className="mt-0.5 text-[16px]">
        {toast.kind === 'error' ? '⚠' : '✓'}
      </span>
      <p className="flex-1">{toast.message}</p>
      <button
        type="button"
        onClick={onDismiss}
        aria-label="Dismiss"
        className="-mr-1 -mt-1 flex h-11 w-11 shrink-0 items-center justify-center rounded-md text-[18px] leading-none text-ink-muted hover:bg-stone-soft hover:text-ink"
      >
        ×
      </button>
    </div>
  );
}

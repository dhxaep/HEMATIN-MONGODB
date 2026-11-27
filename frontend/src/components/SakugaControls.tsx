'use client';

import React, { useEffect, useRef } from 'react';

type SakugaButtonEl = HTMLElement & {
  done?: () => void;
  disabled?: boolean;
};

type SakugaToggleEl = HTMLElement & {
  checked?: boolean;
};

type SakugaTabsEl = HTMLElement & {
  selected?: number;
};

type SakugaProgressEl = HTMLElement & {
  set?: (n: number, immediate?: boolean) => void;
  reset?: () => void;
};

type SakugaToastEl = HTMLElement & {
  show?: (msg: string) => void;
  hide?: () => void;
};

let globalToastEl: SakugaToastEl | null = null;

export function showSakugaToast(message: string) {
  if (globalToastEl?.show) {
    globalToastEl.show(message);
  }
}

export function SakugaToastHost() {
  const ref = useRef<SakugaToastEl | null>(null);

  useEffect(() => {
    globalToastEl = ref.current;
    return () => {
      if (globalToastEl === ref.current) globalToastEl = null;
    };
  }, []);

  return (
    <div
      style={{
        position: 'fixed',
        top: 18,
        left: '50%',
        transform: 'translateX(-50%)',
        zIndex: 99999,
        pointerEvents: 'none',
      }}
    >
      {React.createElement('sakuga-toast', { ref, duration: '3.2' })}
    </div>
  );
}

export function SakugaButton({
  children,
  variant,
  size,
  full = false,
  disabled,
  onClick,
  doneOnClick = false,
  className,
  style,
  title,
}: {
  children: React.ReactNode;
  variant?: 'secondary';
  size?: 'sm';
  full?: boolean;
  disabled?: boolean;
  onClick?: () => void | Promise<void>;
  doneOnClick?: boolean;
  className?: string;
  style?: React.CSSProperties;
  title?: string;
}) {
  const ref = useRef<SakugaButtonEl | null>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const handler = async () => {
      if (disabled) return;
      await onClick?.();
      if (doneOnClick) {
        setTimeout(() => el.done?.(), 120);
      }
    };
    el.addEventListener('click', handler);
    return () => el.removeEventListener('click', handler);
  }, [onClick, disabled, doneOnClick]);

  return React.createElement(
    'sakuga-button',
    {
      ref,
      variant,
      size,
      full: full ? '' : undefined,
      disabled: disabled ? '' : undefined,
      class: className,
      style,
      title,
    },
    children
  );
}

export function SakugaToggle({
  checked,
  label,
  onChange,
}: {
  checked: boolean;
  label: string;
  onChange: (next: boolean) => void;
}) {
  const ref = useRef<SakugaToggleEl | null>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (el.checked !== checked) {
      el.checked = checked;
    }
  }, [checked]);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const handler = () => {
      onChange(Boolean(el.checked));
    };
    el.addEventListener('change', handler);
    return () => el.removeEventListener('change', handler);
  }, [onChange]);

  return (
    <div
      style={{
        width: 72,
        height: 36,
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'flex-end',
        flexShrink: 0,
      }}
    >
      <div style={{ transform: 'scale(0.66)', transformOrigin: 'right center' }}>
        {React.createElement('sakuga-toggle', {
          ref,
          label,
          checked: checked ? '' : undefined,
        })}
      </div>
    </div>
  );
}

export function SakugaTabs({
  options,
  value,
  label,
  full = false,
  onChange,
  style,
}: {
  options: { value: string; label: string }[];
  value: string;
  label: string;
  full?: boolean;
  onChange: (val: string) => void;
  style?: React.CSSProperties;
}) {
  const ref = useRef<SakugaTabsEl | null>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const idx = options.findIndex((o) => o.value === value);
    if (idx >= 0 && el.selected !== idx) {
      el.selected = idx;
    }
  }, [value, options]);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const handler = (e: Event) => {
      const detail = (e as CustomEvent<{ index?: number; value?: string }>).detail;
      if (detail?.value) {
        onChange(detail.value);
      } else if (typeof detail?.index === 'number' && options[detail.index]) {
        onChange(options[detail.index].value);
      }
    };
    el.addEventListener('change', handler);
    return () => el.removeEventListener('change', handler);
  }, [onChange, options]);

  return React.createElement(
    'sakuga-tabs',
    { ref, label, full: full ? '' : undefined, style },
    options.map((opt) =>
      React.createElement(
        'option',
        {
          key: opt.value,
          value: opt.value,
          selected: opt.value === value ? true : undefined,
        },
        opt.label
      )
    )
  );
}

export function SakugaProgress({
  value,
  label,
  width = '100%',
  loading = false,
}: {
  value: number; // 0 to 1
  label: string;
  width?: string;
  loading?: boolean;
}) {
  const ref = useRef<SakugaProgressEl | null>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    const applyValue = (v: number, immediate = false) => {
      const clamped = Math.max(0, Math.min(1, v));
      if (typeof el.set === 'function') {
        el.set(clamped, immediate);
      } else if (typeof window !== 'undefined' && 'customElements' in window) {
        window.customElements.whenDefined('sakuga-progress').then(() => {
          el.set?.(clamped, immediate);
        });
      }
    };

    if (!loading) {
      applyValue(value);
      return;
    }

    // Authentic Sakuga animated loading progression (ramps up smoothly with anime bursts)
    let current = Math.max(0.12, value);
    applyValue(current, false);
    const id = setInterval(() => {
      current = Math.min(0.92, current + (0.94 - current) * 0.22);
      applyValue(current, false);
    }, 320);

    return () => clearInterval(id);
  }, [value, loading]);

  return React.createElement('sakuga-progress', {
    ref,
    label,
    style: { '--sk-progress-width': width, display: 'block', width: '100%' } as React.CSSProperties,
  });
}

export function SakugaTooltip({
  text,
  label = 'Info',
  align,
  children,
}: {
  text: string;
  label?: string;
  align?: 'right';
  children?: React.ReactNode;
}) {
  return React.createElement('sakuga-tooltip', { text, label, align }, children);
}

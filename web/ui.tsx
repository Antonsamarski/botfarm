import { type ReactNode, useEffect, useRef, useState } from "react";
import { WA, inTelegram, haptic, useTheme } from "./lib";

/** Главная кнопка Telegram (внизу экрана). Вне Telegram рисуем свою. */
export function MainButton(props: {
  text: string;
  onClick: () => void | Promise<void>;
  disabled?: boolean;
  color?: string;
}) {
  const [busy, setBusy] = useState(false);
  // в палитре баннера кнопка контрастная (белая/тёмная), иначе — цвет акцента бизнеса
  const theme = useTheme();
  const bg = theme ? theme.btn : props.color;
  const fg = theme ? theme.btnText : "#ffffff";
  const ref = useRef(props.onClick);
  ref.current = props.onClick;

  const run = async () => {
    if (busy || props.disabled) return;
    setBusy(true);
    try {
      await ref.current();
    } finally {
      setBusy(false);
    }
  };
  const runRef = useRef(run);
  runRef.current = run;

  useEffect(() => {
    if (!inTelegram) return;
    const mb = WA.MainButton;
    const handler = () => runRef.current();
    mb.onClick(handler);
    return () => {
      mb.offClick(handler);
      mb.hide();
    };
  }, []);

  useEffect(() => {
    if (!inTelegram) return;
    const mb = WA.MainButton;
    mb.setParams({
      text: props.text,
      is_visible: true,
      is_active: !props.disabled,
      ...(bg ? { color: bg, text_color: fg } : {}),
    });
    if (busy) mb.showProgress(false);
    else mb.hideProgress();
  }, [props.text, props.disabled, bg, fg, busy]);

  if (inTelegram) return null;
  return (
    <div className="mainbtn-wrap">
      <button
        className="btn btn-primary btn-block"
        style={bg ? { background: bg, color: fg } : undefined}
        disabled={props.disabled || busy}
        onClick={run}
      >
        {busy ? "…" : props.text}
      </button>
    </div>
  );
}

/** Кнопка «Назад» в шапке Telegram. */
export function useBackButton(onBack: (() => void) | null) {
  const ref = useRef(onBack);
  ref.current = onBack;
  useEffect(() => {
    if (!inTelegram) return;
    const bb = WA.BackButton;
    if (!onBack) {
      bb.hide();
      return;
    }
    const h = () => ref.current?.();
    bb.onClick(h);
    bb.show();
    return () => {
      bb.offClick(h);
    };
  }, [Boolean(onBack)]);
}

export function BackLink({ onBack }: { onBack: (() => void) | null }) {
  useBackButton(onBack);
  if (inTelegram || !onBack) return null;
  return (
    <button className="backlink" onClick={onBack}>
      ← Назад
    </button>
  );
}

export const Section = (p: { title?: ReactNode; footer?: ReactNode; children: ReactNode; className?: string }) => (
  <section className={`section ${p.className ?? ""}`}>
    {p.title && <div className="section-title">{p.title}</div>}
    <div className="section-body">{p.children}</div>
    {p.footer && <div className="section-footer">{p.footer}</div>}
  </section>
);

export function Cell(p: {
  title: ReactNode;
  subtitle?: ReactNode;
  after?: ReactNode;
  before?: ReactNode;
  onClick?: () => void;
  chevron?: boolean;
  danger?: boolean;
}) {
  const Tag = p.onClick ? "button" : "div";
  return (
    <Tag
      className={`cell ${p.onClick ? "cell-tap" : ""} ${p.danger ? "cell-danger" : ""}`}
      onClick={
        p.onClick
          ? () => {
              haptic();
              p.onClick!();
            }
          : undefined
      }
    >
      {p.before && <div className="cell-before">{p.before}</div>}
      <div className="cell-main">
        <div className="cell-title">{p.title}</div>
        {p.subtitle && <div className="cell-sub">{p.subtitle}</div>}
      </div>
      {p.after && <div className="cell-after">{p.after}</div>}
      {p.chevron && <div className="cell-chevron">›</div>}
    </Tag>
  );
}

export function Field(p: {
  label: string;
  value: string | number;
  onChange: (v: string) => void;
  placeholder?: string;
  type?: string;
  multiline?: boolean;
  hint?: string;
  inputMode?: "numeric" | "tel" | "text" | "decimal" | "url";
  required?: boolean;
}) {
  return (
    <label className="field">
      <span className="field-label">
        {p.label}
        {p.required && <span className="req"> *</span>}
      </span>
      {p.multiline ? (
        <textarea value={p.value} placeholder={p.placeholder} onChange={(e) => p.onChange(e.target.value)} rows={3} />
      ) : (
        <input
          type={p.type ?? "text"}
          value={p.value}
          placeholder={p.placeholder}
          inputMode={p.inputMode}
          onChange={(e) => p.onChange(e.target.value)}
        />
      )}
      {p.hint && <span className="field-hint">{p.hint}</span>}
    </label>
  );
}

export function Toggle(p: { label: string; checked: boolean; onChange: (v: boolean) => void; hint?: string }) {
  return (
    <label className="toggle">
      <div className="cell-main">
        <div className="cell-title">{p.label}</div>
        {p.hint && <div className="cell-sub">{p.hint}</div>}
      </div>
      <input type="checkbox" checked={p.checked} onChange={(e) => p.onChange(e.target.checked)} />
      <span className="switch" />
    </label>
  );
}

export function Select(p: { label: string; value: string; options: [string, string][]; onChange: (v: string) => void }) {
  return (
    <label className="field">
      <span className="field-label">{p.label}</span>
      <select value={p.value} onChange={(e) => p.onChange(e.target.value)}>
        {p.options.map(([v, t]) => (
          <option key={v} value={v}>
            {t}
          </option>
        ))}
      </select>
    </label>
  );
}

export const Spinner = () => (
  <div className="center">
    <div className="spinner" />
  </div>
);

export const Empty = (p: { icon?: ReactNode; title: string; text?: string; children?: ReactNode }) => (
  <div className="empty">
    {p.icon && <div className="empty-icon">{p.icon}</div>}
    <div className="empty-title">{p.title}</div>
    {p.text && <div className="empty-text">{p.text}</div>}
    {p.children}
  </div>
);

export function Tabs<T extends string>(p: { value: T; items: [T, string][]; onChange: (v: T) => void }) {
  return (
    <div className="tabs">
      {p.items.map(([v, t]) => (
        <button
          key={v}
          className={`tab ${p.value === v ? "tab-on" : ""}`}
          onClick={() => {
            haptic();
            p.onChange(v);
          }}
        >
          {t}
        </button>
      ))}
    </div>
  );
}

/** Загрузка данных с повтором. */
export function useLoad<T>(fn: () => Promise<T>, deps: unknown[]) {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [tick, setTick] = useState(0);
  useEffect(() => {
    let alive = true;
    setError(null);
    fn()
      .then((d) => alive && setData(d))
      .catch((e) => alive && setError(e.message));
    return () => {
      alive = false;
    };
  }, [...deps, tick]);
  return { data, error, reload: () => setTick((t) => t + 1), setData };
}

export const ErrorBox = (p: { error: string; onRetry?: () => void }) => (
  <Empty icon={<Icon name="alert" size={40} />} title="Не получилось загрузить" text={p.error}>
    {p.onRetry && (
      <button className="btn btn-secondary" onClick={p.onRetry}>
        Повторить
      </button>
    )}
  </Empty>
);

export function Toast({ text }: { text: string | null }) {
  if (!text) return null;
  return <div className="toast">{text}</div>;
}

export function useToast(): [string | null, (t: string) => void] {
  const [t, setT] = useState<string | null>(null);
  const timer = useRef<number | undefined>(undefined);
  return [
    t,
    (text: string) => {
      setT(text);
      window.clearTimeout(timer.current);
      timer.current = window.setTimeout(() => setT(null), 2200);
    },
  ];
}

const TIMES = Array.from({ length: 24 * 4 + 1 }, (_, i) => {
  const m = i * 15;
  return `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;
});

/** Выбор времени 24ч с шагом 15 минут — одинаково выглядит на любом телефоне. */
export function TimeSelect(p: { value: string; onChange: (v: string) => void; allowEmpty?: boolean; className?: string }) {
  const opts = TIMES.includes(p.value) || !p.value ? TIMES : [p.value, ...TIMES];
  return (
    <select className={`time-select ${p.className ?? ""}`} value={p.value} onChange={(e) => p.onChange(e.target.value)}>
      {p.allowEmpty && <option value="">—</option>}
      {opts.map((t) => (
        <option key={t} value={t}>
          {t === "24:00" ? "24:00" : t}
        </option>
      ))}
    </select>
  );
}

/** Однотонные иконки вместо эмодзи (цвет — currentColor). */
const ICONS: Record<string, string> = {
  pin: "M12 21s-7-6.1-7-11.5A7 7 0 0 1 19 9.5C19 14.9 12 21 12 21Zm0-9a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5Z",
  phone: "M6.6 10.8a15.1 15.1 0 0 0 6.6 6.6l2.2-2.2a1 1 0 0 1 1-.25 11.4 11.4 0 0 0 3.6.57 1 1 0 0 1 1 1V20a1 1 0 0 1-1 1A17 17 0 0 1 3 4a1 1 0 0 1 1-1h3.5a1 1 0 0 1 1 1c0 1.25.2 2.45.57 3.57a1 1 0 0 1-.25 1L6.6 10.8Z",
  link: "M10 14a4.5 4.5 0 0 0 6.4 0l3-3a4.5 4.5 0 0 0-6.4-6.4l-1 1m1.9 4.4a4.5 4.5 0 0 0-6.4 0l-3 3a4.5 4.5 0 0 0 6.4 6.4l1-1",
  photo: "M4 5h16v14H4zM4 15l4.5-4.5 4 4 2.5-2.5L20 17M15.5 9.5h.01",
  calendar: "M5 5h14v15H5zM5 10h14M9 3v4M15 3v4",
  arrow: "M9 6l6 6-6 6",
  sliders: "M4 7h9M17 7h3M15 5v4M4 17h3M11 17h9M9 15v4",
  users: "M9 11a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7ZM3 20a6 6 0 0 1 12 0M16 4.6a3.5 3.5 0 0 1 0 6.3M18 14.6a6 6 0 0 1 3 5.4",
  user: "M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8ZM5 20a7 7 0 0 1 14 0",
  contacts: "M6 3h12v18H6zM9.5 3v18M13 8h2.5M13 12h2.5",
  megaphone: "M4 10v4h3l8 4.5v-13L7 10H4ZM18.5 9a4 4 0 0 1 0 6",
  shield: "M12 3l7 3v5c0 4.5-3 8.5-7 10-4-1.5-7-5.5-7-10V6l7-3Z",
  crown: "M4 19h16M5 16 3.5 7.5l5 3.5L12 5l3.5 6 5-3.5L19 16H5Z",
  eye: "M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12ZM12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6Z",
  message: "M4 5h16v11H9l-5 4V5Z",
  check: "M5 12.5l4.5 4.5L19 7.5",
  checkCircle: "M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18ZM8 12.5l2.8 2.8L16.5 9.5",
  lock: "M6 11h12v9H6zM8.5 11V8a3.5 3.5 0 0 1 7 0v3",
  close: "M6 6l12 12M18 6 6 18",
  alert: "M12 3.5 2.5 20h19L12 3.5ZM12 10v4.5M12 17.5h.01",
  clock: "M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18ZM12 7v5l3 2",
  send: "M21 3 10 14M21 3l-7 18-4-7-7-4 18-7Z",
  sparkle: "M12 3v4M12 17v4M3 12h4M17 12h4M6 6l2.5 2.5M15.5 15.5 18 18M18 6l-2.5 2.5M8.5 15.5 6 18",
  mail: "M3 5h18v14H3zM3 6l9 7 9-7",
};
export function Icon({ name, size = 18 }: { name: keyof typeof ICONS | string; size?: number }) {
  const filled = name === "pin" || name === "phone";
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden className="icon"
      fill={filled ? "currentColor" : "none"} stroke={filled ? "none" : "currentColor"}
      strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
      <path d={ICONS[name]} />
    </svg>
  );
}

import { type ReactNode, useEffect, useRef, useState } from "react";
import { WA, inTelegram, haptic } from "./lib";

/** Главная кнопка Telegram (внизу экрана). Вне Telegram рисуем свою. */
export function MainButton(props: {
  text: string;
  onClick: () => void | Promise<void>;
  disabled?: boolean;
  color?: string;
}) {
  const [busy, setBusy] = useState(false);
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
      ...(props.color ? { color: props.color, text_color: "#ffffff" } : {}),
    });
    if (busy) mb.showProgress(false);
    else mb.hideProgress();
  }, [props.text, props.disabled, props.color, busy]);

  if (inTelegram) return null;
  return (
    <div className="mainbtn-wrap">
      <button
        className="btn btn-primary btn-block"
        style={props.color ? { background: props.color } : undefined}
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

export const Empty = (p: { icon?: string; title: string; text?: string; children?: ReactNode }) => (
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
  <Empty icon="⚠️" title="Не получилось загрузить" text={p.error}>
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

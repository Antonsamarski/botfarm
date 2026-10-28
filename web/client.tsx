import { useEffect, useMemo, useState } from "react";
import {
  alertMsg,
  api,
  bannerUrl,
  confirmMsg,
  dominantColor,
  isLight,
  WA,
  dateOnly,
  duration,
  ensureWriteAccess,
  fmtDay,
  fmtDayShort,
  fmtTime,
  fmtWeekday,
  haptic,
  openLink,
  photoUrl,
  rub,
} from "./lib";
import type { Boot, Booking, Service, Slot } from "./types";
import { BackLink, Cell, Empty, ErrorBox, Field, Icon, MainButton, Section, Spinner, useLoad } from "./ui";

type Biz = NonNullable<Boot["business"]>;

export function BusinessHome(p: {
  boot: Boot;
  onBook: (serviceId?: number) => void;
  onMy: () => void;
  onPortfolio: () => void;
  onAdmin?: () => void;
}) {
  const b = p.boot.business!;
  const s = b.settings;
  const banner = bannerUrl(b.id, s.bannerFileId);
  // цвет фона главной = преобладающий цвет баннера (считается при загрузке; для старых баннеров — здесь)
  const [picked, setPicked] = useState<string>("");
  const tone = banner ? s.bannerColor || picked : "";
  const light = tone ? isLight(tone) : false;

  useEffect(() => {
    if (!tone) return;
    try {
      WA?.setBackgroundColor?.(tone);
      WA?.setHeaderColor?.(tone);
    } catch {}
    const prev = document.body.style.background;
    document.body.style.background = tone;
    return () => {
      document.body.style.background = prev;
      try {
        WA?.setBackgroundColor?.("secondary_bg_color");
        WA?.setHeaderColor?.("secondary_bg_color");
      } catch {}
    };
  }, [tone]);

  const themed = tone
    ? ({
        "--bg": tone,
        "--text": light ? "#16181c" : "#ffffff",
        "--sub": light ? "rgba(0,0,0,.62)" : "rgba(255,255,255,.78)",
        "--tile": light ? "rgba(255,255,255,.55)" : "rgba(255,255,255,.14)",
        "--tile-press": light ? "rgba(255,255,255,.75)" : "rgba(255,255,255,.24)",
        "--cta-bg": light ? "#16181c" : "#ffffff",
        "--cta-text": light ? "#ffffff" : tone,
        background: tone,
        color: light ? "#16181c" : "#ffffff",
      } as any)
    : ({ "--cta-bg": s.accent, "--cta-text": "#fff" } as any);

  return (
    <div className={`page page-cover ${tone ? "page-toned" : ""}`} style={{ ["--accent" as any]: s.accent, ...themed }}>
      <header className={`hero hero-cover ${banner ? "has-banner" : ""}`}>
        <div className="cover" aria-hidden>
          {banner && (
            <>
              <img
                className="cover-img"
                src={banner}
                alt=""
                onLoad={(e) => {
                  if (!s.bannerColor) {
                    try {
                      setPicked(dominantColor(e.currentTarget));
                    } catch {}
                  }
                }}
              />
              <img className="cover-blur" src={banner} alt="" />
            </>
          )}
        </div>
        <h1>{b.name}</h1>
        {s.description && <p className="hero-text">{s.description}</p>}
        <div className="hero-actions">
          {s.address && (
            <span className="chip">
              <Icon name="pin" size={15} /> {s.address}
            </span>
          )}
          {s.contactPhone && (
            <a className="chip" href={`tel:${s.contactPhone.replace(/[^\d+]/g, "")}`}>
              <Icon name="phone" size={15} /> {s.contactPhone}
            </a>
          )}
          {s.links.map((l) => (
            <button key={l.url} className="chip" onClick={() => openLink(l.url)}>
              <Icon name="link" size={15} /> {l.title}
            </button>
          ))}
        </div>
      </header>

      <div className="home-actions">
        <button
          className="btn btn-block btn-big btn-cta"
          disabled={!b.services.length}
          onClick={() => {
            haptic();
            p.onBook();
          }}
        >
          <Icon name="calendar" size={20} />
          {b.services.length ? "Записаться" : "Скоро здесь появится запись"}
        </button>
        <div className="home-row">
          {b.portfolio.length > 0 && (
            <button className="home-tile" onClick={p.onPortfolio}>
              <Icon name="photo" size={22} />
              <span className="home-tile-title">Портфолио</span>
              <span className="home-tile-sub">{b.portfolio.length} фото</span>
            </button>
          )}
          <button className={`home-tile ${p.boot.next ? "home-tile-on" : ""}`} onClick={p.onMy}>
            <Icon name="calendar" size={22} />
            <span className="home-tile-title">Мои записи</span>
            <span className="home-tile-sub">
              {p.boot.next ? `${fmtDay(p.boot.next.starts_at, b.timezone)}, ${fmtTime(p.boot.next.starts_at, b.timezone)}` : "Отменить или посмотреть"}
            </span>
          </button>
        </div>
      </div>

      {p.onAdmin && (
        <button className="admin-banner" onClick={p.onAdmin}>
          Вы управляете этим бизнесом — открыть панель
        </button>
      )}
    </div>
  );
}

/** Портфолио на весь экран: сетка, по тапу — фото крупно, листание стрелками/свайпом. */
export function PortfolioScreen(p: { boot: Boot; onBack: () => void; onBook: () => void }) {
  const b = p.boot.business!;
  const photos = b.portfolio;
  const [open, setOpen] = useState<number | null>(null);
  const [touchX, setTouchX] = useState<number | null>(null);
  const go = (d: number) => setOpen((i) => (i === null ? i : (i + d + photos.length) % photos.length));
  return (
    <div className="page">
      <BackLink onBack={p.onBack} />
      <h2 className="page-title">Портфолио</h2>
      {!photos.length && <Empty title="Фото пока нет" />}
      <div className="gallery gallery-grid">
        {photos.map((ph, i) => (
          <button key={ph.id} className="gallery-item" onClick={() => setOpen(i)}>
            <img src={photoUrl(ph.id)} alt={ph.caption} loading="lazy" />
          </button>
        ))}
      </div>
      {open !== null && (
        <div
          className="lightbox"
          onClick={() => setOpen(null)}
          onTouchStart={(e) => setTouchX(e.touches[0].clientX)}
          onTouchEnd={(e) => {
            if (touchX === null) return;
            const dx = e.changedTouches[0].clientX - touchX;
            if (Math.abs(dx) > 40) {
              e.stopPropagation();
              go(dx < 0 ? 1 : -1);
            }
            setTouchX(null);
          }}
        >
          <img src={photoUrl(photos[open].id)} alt={photos[open].caption} onClick={(e) => e.stopPropagation()} />
          {photos.length > 1 && (
            <>
              <button className="lb-nav lb-prev" onClick={(e) => (e.stopPropagation(), go(-1))}>‹</button>
              <button className="lb-nav lb-next" onClick={(e) => (e.stopPropagation(), go(1))}>›</button>
              <div className="lb-count">
                {open + 1} / {photos.length}
              </div>
            </>
          )}
        </div>
      )}
      <MainButton text="Записаться" color={b.settings.accent} onClick={p.onBook} disabled={!b.services.length} />
    </div>
  );
}

type Step = "service" | "staff" | "time" | "details" | "done";

export function BookFlow(p: { boot: Boot; serviceId?: number; onBack: () => void; onMy: () => void }) {
  const b = p.boot.business!;
  const s = b.settings;
  const tz = b.timezone;
  const multiStaff = s.chooseStaff && b.staff.length > 1;

  const [service, setService] = useState<Service | null>(b.services.find((x) => x.id === p.serviceId) ?? null);
  const [staffId, setStaffId] = useState<number | null>(multiStaff ? null : null);
  const [staffChosen, setStaffChosen] = useState(!multiStaff);
  const [day, setDay] = useState<string | null>(null);
  const [slot, setSlot] = useState<Slot | null>(null);
  const [name, setName] = useState(p.boot.client?.name || p.boot.me.name || "");
  const [phone, setPhone] = useState(p.boot.client?.phone || "");
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [comment, setComment] = useState("");
  const [done, setDone] = useState<{ starts_at: string } | null>(null);

  const step: Step = done ? "done" : !service ? "service" : !staffChosen ? "staff" : !slot ? "time" : "details";

  const back = () => {
    if (step === "details") setSlot(null);
    else if (step === "time" && multiStaff) {
      setStaffChosen(false);
      setDay(null);
    } else if ((step === "time" || step === "staff") && !p.serviceId) {
      setService(null);
      setDay(null);
    } else p.onBack();
  };

  if (step === "done") {
    return (
      <div className="page">
        <Empty icon="🎉" title="Вы записаны!" text={`${service!.title}\n${fmtDay(done!.starts_at, tz)}, ${fmtTime(done!.starts_at, tz)}`}>
          {s.afterBookingText && <p className="muted pre">{s.afterBookingText}</p>}
          {s.address && <p className="muted">📍 {s.address}</p>}
          <p className="muted">Подтверждение и напоминание придут в чат с ботом.</p>
        </Empty>
        <MainButton text="Мои записи" color={s.accent} onClick={p.onMy} />
      </div>
    );
  }

  return (
    <div className="page">
      <BackLink onBack={back} />
      <Steps step={step} multiStaff={multiStaff} />

      {step === "service" && (
        <Section title={`Выберите: ${s.labels.service.toLowerCase()}`}>
          {b.services.map((svc) => (
            <Cell
              key={svc.id}
              title={svc.title}
              subtitle={duration(svc.duration_min)}
              after={<span className="price">{rub(svc.price, svc.price_from)}</span>}
              onClick={() => setService(svc)}
              chevron
            />
          ))}
        </Section>
      )}

      {step === "staff" && (
        <Section title={`${s.labels.staff}`}>
          <Cell
            title="Любой свободный"
            subtitle="Покажем больше вариантов времени"
            before="✨"
            onClick={() => {
              setStaffId(null);
              setStaffChosen(true);
            }}
            chevron
          />
          {b.staff.map((st) => (
            <Cell
              key={st.id}
              title={st.name}
              subtitle={st.description}
              before="👤"
              onClick={() => {
                setStaffId(st.id);
                setStaffChosen(true);
              }}
              chevron
            />
          ))}
        </Section>
      )}

      {step === "time" && service && (
        <TimePicker
          businessId={b.id}
          serviceId={service.id}
          staffId={staffId}
          tz={tz}
          day={day}
          setDay={setDay}
          onPick={(sl) => {
            haptic();
            setSlot(sl);
          }}
          header={`${service.title} · ${duration(service.duration_min)}${
            multiStaff ? ` · ${staffId ? b.staff.find((x) => x.id === staffId)?.name : "любой мастер"}` : ""
          }`}
        />
      )}

      {step === "details" && service && slot && (
        <>
          <Section title="Ваша запись">
            <Cell title={service.title} subtitle={duration(service.duration_min)} after={rub(service.price, service.price_from)} />
            <Cell title={`${fmtDay(slot.start, tz)}, ${slot.label}`} subtitle="Нажмите, чтобы выбрать другое время" onClick={() => setSlot(null)} />
          </Section>
          <Section title="Контакты">
            <div className="form">
              <Field label="Имя" value={name} onChange={setName} required />
              <Field
                label="Телефон"
                value={phone}
                onChange={setPhone}
                type="tel"
                inputMode="tel"
                placeholder="+7 900 000-00-00"
                required={s.requirePhone}
              />
              {s.fields.map((f) => (
                <Field
                  key={f.key}
                  label={f.label}
                  value={answers[f.key] ?? ""}
                  placeholder={f.placeholder}
                  required={f.required}
                  onChange={(v) => setAnswers((a) => ({ ...a, [f.key]: v }))}
                />
              ))}
              <Field label="Комментарий" value={comment} onChange={setComment} multiline placeholder="Необязательно" />
            </div>
          </Section>
          <MainButton
            text={`Записаться на ${slot.label}`}
            color={s.accent}
            onClick={async () => {
              await ensureWriteAccess();
              try {
                const res = await api("book", {
                  businessId: b.id,
                  serviceId: service.id,
                  staffId,
                  start: slot.start,
                  name,
                  phone,
                  answers,
                  comment,
                });
                haptic("success");
                setDone(res);
              } catch (e: any) {
                haptic("error");
                await alertMsg(e.message);
                if (/заняли/.test(e.message)) {
                  setSlot(null);
                  setDay(null);
                }
              }
            }}
          />
        </>
      )}
    </div>
  );
}

function Steps({ step, multiStaff }: { step: Step; multiStaff: boolean }) {
  const order: Step[] = multiStaff ? ["service", "staff", "time", "details"] : ["service", "time", "details"];
  const i = order.indexOf(step);
  return (
    <div className="steps">
      {order.map((st, j) => (
        <div key={st} className={`step ${j <= i ? "step-on" : ""}`} />
      ))}
    </div>
  );
}

function TimePicker(p: {
  businessId: number;
  serviceId: number;
  staffId: number | null;
  tz: string;
  day: string | null;
  setDay: (d: string) => void;
  onPick: (s: Slot) => void;
  header: string;
}) {
  const { data, error, reload } = useLoad<Record<string, Slot[]>>(
    () => api("availability", { businessId: p.businessId, serviceId: p.serviceId, staffId: p.staffId, days: 21 }),
    [p.serviceId, p.staffId],
  );
  const days = useMemo(() => Object.keys(data ?? {}), [data]);
  useEffect(() => {
    if (days.length && (!p.day || !days.includes(p.day))) p.setDay(days[0]);
  }, [days]);

  if (error) return <ErrorBox error={error} onRetry={reload} />;
  if (!data) return <Spinner />;
  if (!days.length) return <Empty icon="🗓" title="Свободного времени пока нет" text="Загляните позже или выберите другую услугу." />;

  const slots = data[p.day ?? days[0]] ?? [];
  const groups: [string, Slot[]][] = [
    ["Утро", slots.filter((s) => s.label < "12:00")],
    ["День", slots.filter((s) => s.label >= "12:00" && s.label < "17:00")],
    ["Вечер", slots.filter((s) => s.label >= "17:00")],
  ];
  return (
    <>
      <div className="muted small pad">{p.header}</div>
      <div className="days">
        {days.map((d) => (
          <button key={d} className={`day ${d === p.day ? "day-on" : ""}`} onClick={() => p.setDay(d)}>
            <span className="day-wd">{fmtWeekday(dateOnly(d), "UTC")}</span>
            <span className="day-n">{fmtDayShort(dateOnly(d), "UTC")}</span>
          </button>
        ))}
      </div>
      {groups
        .filter(([, list]) => list.length)
        .map(([title, list]) => (
          <Section key={title} title={title}>
            <div className="slots">
              {list.map((sl) => (
                <button key={sl.start} className="slot" onClick={() => p.onPick(sl)}>
                  {sl.label}
                </button>
              ))}
            </div>
          </Section>
        ))}
    </>
  );
}

export function MyBookings(p: { boot: Boot; onBack: () => void; onBook: () => void }) {
  const b = p.boot.business!;
  const tz = b.timezone;
  const { data, error, reload } = useLoad<Booking[]>(() => api("myBookings", { businessId: b.id }), []);
  const now = Date.now();
  const upcoming = (data ?? []).filter((x) => x.status === "confirmed" && new Date(x.starts_at).getTime() > now).reverse();
  const past = (data ?? []).filter((x) => !(x.status === "confirmed" && new Date(x.starts_at).getTime() > now));

  const cancel = async (bk: Booking) => {
    if (!(await confirmMsg(`Отменить запись на ${fmtDay(bk.starts_at, tz)}, ${fmtTime(bk.starts_at, tz)}?`))) return;
    try {
      await api("cancelMy", { businessId: b.id, bookingId: bk.id });
      haptic("success");
      reload();
    } catch (e: any) {
      await alertMsg(e.message);
    }
  };

  return (
    <div className="page">
      <BackLink onBack={p.onBack} />
      <h2 className="page-title">Мои записи</h2>
      {error && <ErrorBox error={error} onRetry={reload} />}
      {!data && !error && <Spinner />}
      {data && !upcoming.length && <Empty icon="🗓" title="Активных записей нет" text={`${b.settings.emoji} ${b.name}`} />}
      {upcoming.length > 0 && (
        <Section title="Предстоящие" footer={`Отменить онлайн можно не позже чем за ${b.settings.cancelHours} ч.`}>
          {upcoming.map((bk) => (
            <Cell
              key={bk.id}
              title={`${fmtDay(bk.starts_at, tz)}, ${fmtTime(bk.starts_at, tz)}`}
              subtitle={`${bk.service_title}${bk.price ? ` · ${rub(bk.price)}` : ""}`}
              after={
                <button className="btn btn-small btn-danger" onClick={() => cancel(bk)}>
                  Отменить
                </button>
              }
            />
          ))}
        </Section>
      )}
      {past.length > 0 && (
        <Section title="История">
          {past.map((bk) => (
            <Cell
              key={bk.id}
              title={`${fmtDay(bk.starts_at, tz)}, ${fmtTime(bk.starts_at, tz)}`}
              subtitle={bk.service_title}
              after={<StatusBadge status={bk.status} by={bk.cancelled_by} />}
            />
          ))}
        </Section>
      )}
      <MainButton text="📅 Записаться" color={b.settings.accent} onClick={p.onBook} />
    </div>
  );
}

export function StatusBadge({ status, by }: { status: Booking["status"]; by?: Booking["cancelled_by"] }) {
  const map: Record<Booking["status"], [string, string]> = {
    confirmed: ["Записан", "badge-blue"],
    done: ["Был(а)", "badge-green"],
    no_show: ["Не пришёл", "badge-gray"],
    cancelled: [by === "admin" ? "Отменено мастером" : "Отменено", "badge-red"],
  };
  const [t, c] = map[status];
  return <span className={`badge ${c}`}>{t}</span>;
}

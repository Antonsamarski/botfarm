import { useState } from "react";
import { alertMsg, api, copy, haptic, shareLink } from "./lib";
import type { Boot } from "./types";
import { BackLink, Cell, Empty, ErrorBox, Field, Icon, MainButton, Section, Select, Spinner, Toast, useLoad, useToast } from "./ui";

/** Экран без выбранного бизнеса. */
export function Landing(p: { boot: Boot; onAdmin: (id: number) => void; onSuper: () => void }) {
  return (
    <div className="page">
      <header className="hero hero-plain">
        <h1>Онлайн-запись в Telegram</h1>
        <p className="hero-text">
          {p.boot.blocked
            ? "Запись в этот бизнес временно недоступна."
            : "Клиенты попадают сюда по ссылке своего мастера. Если у вас есть ссылка — откройте её ещё раз."}
        </p>
      </header>
      {p.boot.me.isSuper && (
        <Section>
          <Cell before={<Icon name="crown" size={20} />} title="Панель платформы" onClick={p.onSuper} chevron />
        </Section>
      )}
      {p.boot.adminOf.length > 0 && (
        <Section title="Мои бизнесы">
          {p.boot.adminOf.map((b) => (
            <Cell key={b.slug} before={<Icon name="sliders" size={20} />} title={b.name} subtitle={b.role === "owner" ? "владелец" : "администратор"} onClick={() => p.onAdmin(b.id)} chevron />
          ))}
        </Section>
      )}
    </div>
  );
}

function outreachText(name: string, client: string, invite: string) {
  return [
    `Здравствуйте! Сделали для «${name}» бесплатного бота онлайн-записи в Telegram 🙌`,
    "",
    "Клиенты сами выбирают услугу и время, бот напоминает им о визите, вы видите все записи в телефоне. Никаких оплат и подписок.",
    "",
    `Как это видят клиенты: ${client}`,
    `Забрать бота себе (вы станете владельцем, всё можно поменять): ${invite}`,
  ].join("\n");
}

export function SuperPanel(p: { boot: Boot; onBack: (() => void) | null; onAdmin: (id: number) => void }) {
  const { data, error, reload } = useLoad<any>(() => api("super.list"), []);
  const [creating, setCreating] = useState(false);
  const [form, setForm] = useState({ templateId: p.boot.templates[0].id, name: "", slug: "" });
  const [created, setCreated] = useState<any>(null);
  const [q, setQ] = useState("");
  const [toast, showToast] = useToast();

  if (error) return <ErrorBox error={error} onRetry={reload} />;
  if (!data) return <Spinner />;

  if (created) {
    const text = outreachText(created.business.name, created.links.client, created.ownerInvite);
    return (
      <div className="page">
        <BackLink onBack={() => setCreated(null)} />
        <Empty icon={<Icon name="checkCircle" size={48} />} title={`Создан: ${created.business.name}`} />
        <Section title="Текст для холодной рассылки">
          <div className="pad">
            <div className="linkbox pre">{text}</div>
            <button className="btn btn-primary btn-block" onClick={async () => (await copy(text)) && showToast("Скопировано")}>
              Скопировать сообщение
            </button>
          </div>
        </Section>
        <Section>
          <Cell title="Ссылка для клиентов" subtitle={created.links.client} onClick={async () => (await copy(created.links.client)) && showToast("Скопировано")} />
          <Cell
            title="Ссылка на панель мастера"
            subtitle={`${created.links.admin}\nработает только после того, как мастер примет приглашение`}
            onClick={async () => (await copy(created.links.admin)) && showToast("Скопировано")}
          />
          <Cell title="Приглашение владельца" subtitle={created.ownerInvite} onClick={async () => (await copy(created.ownerInvite)) && showToast("Скопировано")} />
          <Cell before={<Icon name="sliders" size={20} />} title="Настроить перед отправкой" onClick={() => p.onAdmin(created.business.id)} chevron />
        </Section>
        <Toast text={toast} />
      </div>
    );
  }

  if (creating) {
    return (
      <div className="page">
        <BackLink onBack={() => setCreating(false)} />
        <h2 className="page-title">Новый бизнес</h2>
        <Section footer="Создадим из шаблона и дадим ссылку-приглашение: кто откроет её первым, станет владельцем.">
          <div className="form">
            <Select
              label="Шаблон"
              value={form.templateId}
              onChange={(v) => setForm({ ...form, templateId: v })}
              options={p.boot.templates.map((t) => [t.id, t.title])}
            />
            <Field label="Название" value={form.name} onChange={(v) => setForm({ ...form, name: v })} placeholder="Барбершоп Борода" required />
            <Field label="Ссылка (необязательно)" value={form.slug} onChange={(v) => setForm({ ...form, slug: v })} placeholder="boroda-samara" hint="латиница, цифры и дефис" />
          </div>
        </Section>
        <MainButton
          text="Создать"
          disabled={form.name.trim().length < 2}
          onClick={async () => {
            try {
              setCreated(await api("super.create", form));
              haptic("success");
              setForm({ ...form, name: "", slug: "" });
              reload();
            } catch (e: any) {
              await alertMsg(e.message);
            }
          }}
        />
      </div>
    );
  }

  const list = (data.businesses as any[]).filter((b) => !q || `${b.name} ${b.slug}`.toLowerCase().includes(q.toLowerCase()));
  return (
    <div className="page">
      <BackLink onBack={p.onBack} />
      <h2 className="page-title">Платформа</h2>
      <div className="stats">
        <div className="stat"><div className="stat-n">{data.stats.businesses}</div><div className="stat-l">бизнесов</div></div>
        <div className="stat"><div className="stat-n">{data.stats.users}</div><div className="stat-l">пользователей</div></div>
        <div className="stat"><div className="stat-n">{data.stats.active_30d}</div><div className="stat-l">активны 30 дн.</div></div>
        <div className="stat"><div className="stat-n">{data.stats.bookings}</div><div className="stat-l">записей</div></div>
      </div>
      <div className="pad">
        <input className="search" placeholder="Поиск" value={q} onChange={(e) => setQ(e.target.value)} />
      </div>
      <Section title={`Бизнесы · ${data.businesses.length}`}>
        {list.map((b) => (
          <BizRow key={b.id} b={b} templates={p.boot.templates} onAdmin={() => p.onAdmin(b.id)} reload={reload} toast={showToast} />
        ))}
      </Section>
      <MainButton text="＋ Создать бизнес из шаблона" onClick={() => setCreating(true)} />
      <Toast text={toast} />
    </div>
  );
}

function BizRow({ b, templates, onAdmin, reload, toast }: any) {
  const [open, setOpen] = useState(false);
  const t = templates.find((x: any) => x.id === b.template);
  return (
    <>
      <Cell
        title={
          <>
            {b.name} {b.status === "blocked" && <span className="badge badge-red">блок</span>}
            {!b.owners && <span className="badge badge-gray">без владельца</span>}
          </>
        }
        subtitle={`${b.slug} · ${b.clients} клиентов · ${b.bookings} записей`}
        onClick={() => setOpen(!open)}
        chevron
      />
      {open && (
        <div className="row-actions">
          <button className="btn btn-small btn-primary" onClick={onAdmin}>Управлять</button>
          <button className="btn btn-small btn-secondary" onClick={async () => (await copy(b.links.admin)) && toast("Ссылка на панель скопирована")}>
            <Icon name="sliders" size={14} /> Панель
          </button>
          <button className="btn btn-small btn-secondary" onClick={async () => (await copy(b.links.client)) && toast("Ссылка скопирована")}>
            <Icon name="link" size={14} /> Ссылка
          </button>
          <button
            className="btn btn-small btn-secondary"
            onClick={async () => {
              const r: any = await api("admin.invite", { businessId: b.id, role: "owner" });
              const text = outreachText(b.name, b.links.client, r.link);
              if (await copy(text)) toast("Текст с приглашением скопирован");
              else shareLink(r.link, text);
            }}
          >
            <Icon name="mail" size={14} /> Приглашение
          </button>
          <button
            className="btn btn-small btn-danger"
            onClick={async () => {
              await api("super.setStatus", { businessId: b.id, status: b.status === "blocked" ? "active" : "blocked" });
              reload();
            }}
          >
            {b.status === "blocked" ? "Разблокировать" : "Заблокировать"}
          </button>
        </div>
      )}
    </>
  );
}

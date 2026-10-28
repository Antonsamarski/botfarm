import { Bot, type Context, InlineKeyboard } from "grammy";
import type { UserFromGetMe } from "grammy/types";
import { adminLink, clientLink, config, webAppUrl } from "./config.js";
import { db } from "./db.js";
import { esc } from "./format.js";
import { checkPhone } from "./phone.js";
import * as store from "./store.js";
import { UserError } from "./store.js";

let bot: Bot | null = null;

/** Бот без запроса getMe на холодном старте: id берём из токена, username — из env. */
export function getBot(): Bot {
  if (bot) return bot;
  const botInfo = {
    id: Number(config.botToken.split(":")[0]),
    is_bot: true,
    first_name: config.botUsername,
    username: config.botUsername,
    can_join_groups: false,
    can_read_all_group_messages: false,
    supports_inline_queries: false,
    can_connect_to_business: false,
    has_main_web_app: Boolean(config.botAppName),
  } as UserFromGetMe;
  bot = new Bot(config.botToken, { botInfo });
  register(bot);
  return bot;
}

const isSuper = (id: number) => config.superadmins.includes(id);

async function showBusiness(ctx: Context, b: store.Business) {
  const s = b.settings;
  const kb = new InlineKeyboard()
    .webApp("Записаться онлайн", webAppUrl({ b: b.slug }))
    .row()
    .webApp("Мои записи", webAppUrl({ b: b.slug, view: "my" }));
  const lines = [`<b>${esc(b.name)}</b>`, "", esc(s.welcome)];
  const info = [
    s.address && `<i>Адрес:</i> ${esc(s.address)}`,
    s.contactPhone && `<i>Телефон:</i> <code>${esc(s.contactPhone)}</code>`,
  ].filter(Boolean);
  if (info.length) lines.push("", ...(info as string[]));
  await ctx.reply(lines.join("\n"), { parse_mode: "HTML", reply_markup: kb, link_preview_options: { is_disabled: true } });
  await ctx.api
    .setChatMenuButton({ chat_id: ctx.chat!.id, menu_button: { type: "web_app", text: "Записаться", web_app: { url: webAppUrl({ b: b.slug }) } } })
    .catch(() => {});
}

async function showPlatform(ctx: Context) {
  const uid = ctx.from!.id;
  const adminOf = await store.businessesOfAdmin(db(), uid);
  const kb = new InlineKeyboard();
  for (const b of adminOf.slice(0, 5)) kb.webApp(`Панель: ${b.name}`, webAppUrl({ b: b.slug, view: "admin" })).row();
  if (isSuper(uid)) kb.webApp("Панель платформы", webAppUrl({ view: "super" })).row();
  const text = adminOf.length || isSuper(uid)
    ? "Выберите, что открыть:"
    : [
        "<b>Онлайн-запись</b>",
        "",
        "Чтобы записаться, откройте ссылку вашего мастера — и здесь появится запись к нему.",
      ].join("\n");
  await ctx.reply(text, { parse_mode: "HTML", reply_markup: adminOf.length || isSuper(uid) ? kb : undefined });
}

function register(b: Bot) {
  b.use(async (ctx, next) => {
    if (ctx.from && !ctx.from.is_bot) await store.upsertUser(db(), ctx.from);
    await next();
  });

  b.command("start", async (ctx) => {
    const payload = (ctx.match ?? "").trim();
    const uid = ctx.from!.id;

    if (payload.startsWith("inv_")) {
      try {
        const { business, role } = await store.claimInvite(db(), payload.slice(4), uid);
        await store.setLastBusiness(db(), uid, business.id);
        const kb = new InlineKeyboard().webApp("Открыть панель управления", webAppUrl({ b: business.slug, view: "admin" }));
        await ctx.reply(
          [
            `<b>Готово.</b> Вы ${role === "owner" ? "владелец" : "администратор"} «${esc(business.name)}».`,
            "",
            "В панели можно поменять услуги, цены, график и тексты.",
            "",
            "<b>Ссылка для клиентов</b>",
            "<i>Поставьте её в шапку канала, Instagram и в ответы клиентам:</i>",
            `<code>${esc(clientLink(business.slug))}</code>`,
            "",
            "<b>Ваша ссылка на панель управления</b>",
            "<i>Сохраните её. У других людей она откроет обычную запись.</i>",
            `<code>${esc(adminLink(business.slug))}</code>`,
          ].join("\n"),
          { parse_mode: "HTML", reply_markup: kb, link_preview_options: { is_disabled: true } },
        );
        if (role === "owner") {
          const { notifySuperadmins } = await import("./notify.js");
          await notifySuperadmins(
            `<b>Приглашение принято:</b> «${esc(business.name)}» → <a href="tg://user?id=${uid}">${esc(ctx.from!.first_name)}</a>`,
          );
        }
      } catch (e) {
        await ctx.reply(e instanceof UserError ? e.message : "Не удалось принять приглашение");
      }
      return;
    }

    // постоянная ссылка на панель: открывает управление только тем, у кого есть роль
    if (payload.startsWith("adm_")) {
      const business = await store.getBusiness(db(), payload.slice(4));
      if (!business) return showPlatform(ctx);
      const role = await store.roleFor(db(), uid, business.id, config.superadmins);
      await store.setLastBusiness(db(), uid, business.id);
      if (!role) {
        await store.touchClient(db(), business.id, ctx.from!);
        return showBusiness(ctx, business);
      }
      const kb = new InlineKeyboard()
        .webApp("Открыть панель управления", webAppUrl({ b: business.slug, view: "admin" }))
        .row()
        .webApp("Как видят клиенты", webAppUrl({ b: business.slug }));
      return ctx.reply(`<b>Панель управления</b> · ${esc(business.name)}`, { parse_mode: "HTML", reply_markup: kb });
    }

    if (payload) {
      const business = await store.getBusiness(db(), payload);
      if (business && business.status === "active") {
        await store.setLastBusiness(db(), uid, business.id);
        const role = await store.roleFor(db(), uid, business.id, config.superadmins);
        if (!role) await store.touchClient(db(), business.id, ctx.from!);
        return showBusiness(ctx, business);
      }
      if (business) return ctx.reply("Запись в этот бизнес временно недоступна.");
    }

    const [u] = await db().query(`select last_business_id from users where tg_id = $1`, [uid]);
    if (u?.last_business_id && !payload) {
      const business = await store.getBusiness(db(), Number(u.last_business_id));
      if (business?.status === "active") return showBusiness(ctx, business);
    }
    return showPlatform(ctx);
  });

  b.command("admin", (ctx) => showPlatform(ctx));

  b.command("help", (ctx) =>
    ctx.reply(
      "Запись, отмена и перенос — в приложении (кнопка «Записаться» внизу).\n/start — главное меню\n/admin — панель для владельцев бизнеса",
    ),
  );

  // Номер, которым клиент поделился из формы записи («Взять номер из Telegram»): сохраняем молча
  b.on("message:contact", async (ctx) => {
    const c = ctx.message.contact;
    if (c.user_id !== ctx.from.id) return;
    const pc = checkPhone(c.phone_number.startsWith("+") ? c.phone_number : `+${c.phone_number}`);
    if (!pc.ok) return;
    const [u] = await db().query(`select last_business_id from users where tg_id = $1`, [ctx.from.id]);
    if (u?.last_business_id) {
      await db().query(`update clients set phone = $3 where business_id = $1 and tg_id = $2`, [u.last_business_id, ctx.from.id, pc.phone]);
    }
  });

  // Любое другое сообщение: подсказываем контакты бизнеса и кнопку записи
  b.on("message", async (ctx) => {
    const [u] = await db().query(`select last_business_id from users where tg_id = $1`, [ctx.from.id]);
    const business = u?.last_business_id ? await store.getBusiness(db(), Number(u.last_business_id)) : null;
    if (!business) return showPlatform(ctx);
    const s = business.settings;
    const contacts = [s.contactPhone && `<i>Телефон:</i> <code>${esc(s.contactPhone)}</code>`, ...s.links.map((l) => `<a href="${esc(l.url)}">${esc(l.title)}</a>`)]
      .filter(Boolean)
      .join("\n");
    await ctx.reply(
      `Я бот онлайн-записи «${esc(business.name)}» и не читаю переписку.${contacts ? `\n\n<b>Связаться напрямую</b>\n${contacts}` : ""}`,
      {
        parse_mode: "HTML",
        reply_markup: new InlineKeyboard().webApp("Записаться", webAppUrl({ b: business.slug })),
        link_preview_options: { is_disabled: true },
      },
    );
  });

  b.on("my_chat_member", async (ctx) => {
    if (ctx.myChatMember.new_chat_member.status === "kicked") {
      await db().query(`update clients set blocked_bot = true where tg_id = $1`, [ctx.from.id]);
    }
  });

  b.catch((err) => console.error("bot error", err.error));
}

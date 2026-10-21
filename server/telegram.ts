import { Api } from "grammy";
import { config } from "./config.js";

export interface Sender {
  sendMessage(chatId: number, html: string, extra?: Record<string, unknown>): Promise<unknown>;
  sendPhoto(chatId: number, photo: Uint8Array, caption?: string): Promise<{ file_id: string }>;
  setChatMenuButton(chatId: number, text: string, url: string): Promise<unknown>;
}

let override: Sender | null = null;
let api: Api | null = null;

/** Для тестов и локального запуска: перехват отправки сообщений. */
export function setSender(s: Sender | null) {
  override = s;
}

export function rawApi(): Api {
  api ??= new Api(config.botToken);
  return api;
}

export function tg(): Sender {
  if (override) return override;
  const a = rawApi();
  return {
    sendMessage: (chatId, html, extra) =>
      a.sendMessage(chatId, html, { parse_mode: "HTML", link_preview_options: { is_disabled: true }, ...extra }),
    sendPhoto: async (chatId, photo, caption) => {
      const { InputFile } = await import("grammy");
      const msg = await a.sendPhoto(chatId, new InputFile(photo), { caption });
      const sizes = msg.photo ?? [];
      return { file_id: sizes[sizes.length - 1].file_id };
    },
    setChatMenuButton: (chatId, text, url) =>
      a.setChatMenuButton({ chat_id: chatId, menu_button: { type: "web_app", text, web_app: { url } } }),
  };
}

/** Ошибка «пользователь заблокировал бота / не начинал диалог». */
export function isBlockedError(e: unknown): boolean {
  const err = e as { error_code?: number; description?: string };
  return err?.error_code === 403 || /blocked|chat not found|deactivated/i.test(err?.description ?? "");
}

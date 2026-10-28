import type { WorkHours } from "./slots.js";

export interface Field {
  key: string;
  label: string;
  placeholder?: string;
  required: boolean;
}

export interface BusinessSettings {
  emoji: string;
  accent: string;
  description: string;
  address: string;
  contactPhone: string;
  links: { title: string; url: string }[];
  welcome: string;
  afterBookingText: string;
  labels: { staff: string; staffPlural: string; service: string };
  stepMin: number;
  minLeadMin: number;
  maxDaysAhead: number;
  cancelHours: number;
  chooseStaff: boolean;
  requirePhone: boolean;
  remind2h: boolean;
  fields: Field[];
  /** Баннер главной страницы: file_id фото в Telegram ("" — нет баннера) */
  bannerFileId: string;
  /** Преобладающий цвет баннера (#rrggbb) — в него переходит размытие и фон главной */
  bannerColor: string;
}

export interface Template {
  id: string;
  title: string;
  emoji: string;
  pitch: string;
  settings: BusinessSettings;
  staff: { name: string; description?: string; work_hours: WorkHours }[];
  services: { title: string; price: number; price_from?: boolean; duration_min: number; description?: string }[];
}

const weekdays = (from: string, to: string, days = [1, 2, 3, 4, 5]): WorkHours =>
  Object.fromEntries(days.map((d) => [String(d), [[from, to]] as [string, string][]]));

const baseSettings = (over: Partial<BusinessSettings>): BusinessSettings => ({
  emoji: "✨",
  accent: "#2481cc",
  description: "",
  address: "",
  contactPhone: "",
  links: [],
  welcome: "Здравствуйте! Здесь можно записаться онлайн в пару касаний.",
  afterBookingText: "",
  labels: { staff: "Мастер", staffPlural: "Мастера", service: "Услуга" },
  stepMin: 30,
  minLeadMin: 60,
  maxDaysAhead: 30,
  cancelHours: 3,
  chooseStaff: false,
  requirePhone: true,
  remind2h: true,
  fields: [],
  bannerFileId: "",
  bannerColor: "",
  ...over,
});

export const TEMPLATES: Template[] = [
  {
    id: "beauty",
    title: "Бьюти-мастер",
    emoji: "💅",
    pitch: "Маникюр, педикюр, брови, ресницы. Один мастер, портфолио, напоминания.",
    settings: baseSettings({
      emoji: "💅",
      accent: "#d6457b",
      description: "Маникюр, педикюр и брови. Запись онлайн 24/7 — выберите услугу и свободное окошко.",
      welcome: "Привет! Я мастер ногтевого сервиса. Выберите услугу и удобное время — я пришлю напоминание накануне.",
      afterBookingText: "Если планы изменятся — отмените запись в «Мои записи», чтобы окошко досталось другому.",
      fields: [{ key: "wish", label: "Пожелания по дизайну", placeholder: "Например: нюд, короткая длина", required: false }],
    }),
    staff: [{ name: "Мастер", work_hours: weekdays("10:00", "20:00", [1, 2, 3, 4, 5, 6]) }],
    services: [
      { title: "Маникюр с покрытием гель-лак", price: 1800, duration_min: 120 },
      { title: "Маникюр без покрытия", price: 900, duration_min: 60 },
      { title: "Наращивание ногтей", price: 2800, price_from: true, duration_min: 180 },
      { title: "Педикюр с покрытием", price: 2200, duration_min: 120 },
      { title: "Коррекция и окрашивание бровей", price: 1200, duration_min: 60 },
      { title: "Снятие покрытия", price: 400, duration_min: 30 },
    ],
  },
  {
    id: "barber",
    title: "Барбершоп / парикмахер",
    emoji: "💈",
    pitch: "Несколько мастеров, выбор мастера или «любой свободный».",
    settings: baseSettings({
      emoji: "💈",
      accent: "#b7791f",
      description: "Мужские стрижки и оформление бороды. Выберите мастера и удобное время.",
      welcome: "Добро пожаловать! Выберите услугу, мастера и время — без звонков и ожидания.",
      chooseStaff: true,
      stepMin: 15,
      minLeadMin: 30,
      maxDaysAhead: 21,
      cancelHours: 2,
    }),
    staff: [
      { name: "Алексей", description: "Топ-барбер", work_hours: weekdays("10:00", "21:00", [1, 2, 3, 4, 5, 6, 7]) },
      { name: "Дмитрий", description: "Барбер", work_hours: weekdays("12:00", "21:00", [2, 3, 4, 5, 6]) },
    ],
    services: [
      { title: "Мужская стрижка", price: 1200, duration_min: 45 },
      { title: "Стрижка машинкой", price: 700, duration_min: 30 },
      { title: "Оформление бороды", price: 800, duration_min: 30 },
      { title: "Стрижка + борода", price: 1800, duration_min: 75 },
      { title: "Детская стрижка", price: 900, duration_min: 30 },
    ],
  },
  {
    id: "tutor",
    title: "Репетитор / психолог / консультант",
    emoji: "🎓",
    pitch: "Занятия и консультации онлайн или очно, анкета с целью.",
    settings: baseSettings({
      emoji: "🎓",
      accent: "#4f46e5",
      description: "Индивидуальные занятия онлайн и очно. Первое пробное занятие — бесплатно.",
      welcome: "Здравствуйте! Выберите формат занятия и удобное время. Ссылку на созвон пришлю перед началом.",
      afterBookingText: "Занятие проходит онлайн. Ссылку на созвон пришлю в этот чат перед началом.",
      labels: { staff: "Преподаватель", staffPlural: "Преподаватели", service: "Занятие" },
      stepMin: 60,
      minLeadMin: 180,
      cancelHours: 12,
      fields: [
        { key: "goal", label: "Класс / цель занятий", placeholder: "Например: 9 класс, ОГЭ по математике", required: true },
      ],
    }),
    staff: [{ name: "Преподаватель", work_hours: weekdays("15:00", "21:00") }],
    services: [
      { title: "Пробное занятие", price: 0, duration_min: 30 },
      { title: "Индивидуальное занятие", price: 1500, duration_min: 60 },
      { title: "Подготовка к экзамену", price: 2000, duration_min: 90 },
      { title: "Пакет 4 занятия", price: 5400, duration_min: 60, description: "Оплата за месяц вперёд" },
    ],
  },
  {
    id: "wellness",
    title: "Массаж / тренер / SPA",
    emoji: "🧘",
    pitch: "Сеансы 60/90 минут, пожелания клиента, напоминания.",
    settings: baseSettings({
      emoji: "🧘",
      accent: "#0f9d76",
      description: "Массаж и персональные тренировки. Выберите сеанс и удобное время.",
      welcome: "Здравствуйте! Запишитесь на сеанс в удобное время — напомню накануне.",
      labels: { staff: "Специалист", staffPlural: "Специалисты", service: "Сеанс" },
      cancelHours: 6,
      fields: [{ key: "wish", label: "Пожелания или зоны внимания", placeholder: "Например: шея и плечи", required: false }],
    }),
    staff: [{ name: "Специалист", work_hours: weekdays("09:00", "21:00", [1, 2, 3, 4, 5, 6]) }],
    services: [
      { title: "Классический массаж", price: 2500, duration_min: 60 },
      { title: "Массаж спины и шеи", price: 1500, duration_min: 30 },
      { title: "Антицеллюлитный массаж", price: 2800, duration_min: 60 },
      { title: "Персональная тренировка", price: 2000, duration_min: 60 },
      { title: "SPA-программа", price: 4500, duration_min: 90 },
    ],
  },
  {
    id: "auto",
    title: "Авто: детейлинг / шиномонтаж / сервис",
    emoji: "🚗",
    pitch: "Длинные работы, данные авто в анкете, несколько боксов.",
    settings: baseSettings({
      emoji: "🚗",
      accent: "#e8590c",
      description: "Шиномонтаж, мойка, детейлинг и обслуживание. Запись без очереди и звонков.",
      welcome: "Здравствуйте! Запишите авто на удобное время — без очереди и звонков.",
      labels: { staff: "Бокс", staffPlural: "Боксы", service: "Работа" },
      stepMin: 30,
      minLeadMin: 60,
      maxDaysAhead: 14,
      cancelHours: 2,
      remind2h: true,
      fields: [
        { key: "car", label: "Марка и модель авто", placeholder: "Например: Lada Granta", required: true },
        { key: "plate", label: "Госномер", placeholder: "А123ВС 163", required: false },
      ],
    }),
    staff: [{ name: "Бокс 1", work_hours: weekdays("09:00", "20:00", [1, 2, 3, 4, 5, 6, 7]) }],
    services: [
      { title: "Шиномонтаж R13–R16", price: 1600, duration_min: 45 },
      { title: "Шиномонтаж R17–R20", price: 2400, duration_min: 60 },
      { title: "Комплексная мойка", price: 900, duration_min: 45 },
      { title: "Полировка кузова", price: 8000, price_from: true, duration_min: 240 },
      { title: "Химчистка салона", price: 6000, price_from: true, duration_min: 240 },
      { title: "Замена масла", price: 700, duration_min: 30 },
    ],
  },
];

export const getTemplate = (id: string) => TEMPLATES.find((t) => t.id === id);

/** Нормализует настройки из БД: недостающие поля берутся из шаблона по умолчанию. */
export function withDefaults(templateId: string, settings: Partial<BusinessSettings> | null): BusinessSettings {
  const tpl = getTemplate(templateId) ?? TEMPLATES[0];
  return { ...tpl.settings, ...(settings ?? {}), labels: { ...tpl.settings.labels, ...(settings?.labels ?? {}) } };
}

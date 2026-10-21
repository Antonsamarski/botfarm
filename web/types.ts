export interface Field {
  key: string;
  label: string;
  placeholder?: string;
  required: boolean;
}

export interface Settings {
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
}

export interface Service {
  id: number;
  title: string;
  description: string;
  price: number;
  price_from: boolean;
  duration_min: number;
  active?: boolean;
  sort?: number;
}

export interface Staff {
  id: number;
  name: string;
  description: string;
  tg_id?: number | null;
  work_hours?: Record<string, [string, string][]>;
  active?: boolean;
  sort?: number;
}

export interface PublicBusiness {
  id: number;
  slug: string;
  name: string;
  template: string;
  status: "active" | "blocked";
  timezone: string;
  settings: Settings;
}

export interface Boot {
  me: { id: number; name: string; isSuper: boolean };
  business: (PublicBusiness & { services: Service[]; staff: Staff[]; portfolio: { id: number; caption: string }[] }) | null;
  role: "super" | "owner" | "admin" | null;
  client: { name: string; phone: string } | null;
  blocked?: boolean;
  adminOf: { id: number; slug: string; name: string; role: string; emoji: string }[];
  templates: { id: string; title: string; emoji: string; pitch: string }[];
}

export interface Slot {
  start: string;
  end: string;
  label: string;
  staffIds: number[];
}

export interface Booking {
  id: number;
  service_title: string;
  price: number;
  starts_at: string;
  ends_at: string;
  status: "confirmed" | "cancelled" | "done" | "no_show";
  cancelled_by: "client" | "admin" | null;
  client_name?: string;
  client_phone?: string;
  client_tg_id?: number;
  staff_name?: string;
  answers?: Record<string, string>;
  comment?: string;
}

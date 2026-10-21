import { StrictMode, useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import { AdminPanel } from "./admin";
import { BookFlow, BusinessHome, MyBookings } from "./client";
import { api, ensureDevAuth, inTelegram, urlParams, WA } from "./lib";
import { Landing, Onboard, SuperPanel } from "./platform";
import type { Boot } from "./types";
import { ErrorBox, Spinner } from "./ui";
import "./styles.css";

type Route =
  | { name: "home" }
  | { name: "book"; serviceId?: number }
  | { name: "my" }
  | { name: "admin"; businessId: number }
  | { name: "super" }
  | { name: "onboard" };

function initialRoute(boot: Boot): Route {
  const view = urlParams.get("view");
  if (view === "super" && boot.me.isSuper) return { name: "super" };
  if (view === "onboard") return { name: "onboard" };
  if (view === "admin" && boot.business && boot.role) return { name: "admin", businessId: boot.business.id };
  if (view === "my" && boot.business) return { name: "my" };
  return { name: "home" };
}

function App() {
  const [boot, setBoot] = useState<Boot | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [stack, setStack] = useState<Route[]>([]);

  const load = async (opts: { slug?: string; businessId?: number } = {}) => {
    setError(null);
    try {
      await ensureDevAuth();
      const b = await api<Boot>("boot", { slug: opts.slug ?? urlParams.get("b") ?? undefined, businessId: opts.businessId });
      setBoot(b);
      return b;
    } catch (e: any) {
      setError(e.message);
      return null;
    }
  };

  useEffect(() => {
    WA?.ready();
    WA?.expand();
    try {
      WA?.setHeaderColor?.("secondary_bg_color");
      WA?.setBackgroundColor?.("secondary_bg_color");
    } catch {}
    load().then((b) => b && setStack([initialRoute(b)]));
  }, []);

  if (error) return <ErrorBox error={error} onRetry={() => load().then((b) => b && setStack([initialRoute(b)]))} />;
  if (!boot || !stack.length) return <Spinner />;

  const route = stack[stack.length - 1];
  document.documentElement.style.setProperty("--accent", boot.business?.settings.accent ?? "var(--btn)");
  const push = (r: Route) => {
    window.scrollTo(0, 0);
    setStack((s) => [...s, r]);
  };
  const pop = stack.length > 1 ? () => setStack((s) => s.slice(0, -1)) : null;
  const home = () => setStack([{ name: "home" }]);
  const biz = boot.business;

  switch (route.name) {
    case "super":
      return <SuperPanel boot={boot} onBack={pop} onAdmin={(id) => push({ name: "admin", businessId: id })} />;
    case "onboard":
      return (
        <Onboard
          boot={boot}
          onBack={pop ?? home}
          onCreated={async (slug) => {
            const b = await load({ slug });
            if (b?.business) setStack([{ name: "home" }, { name: "admin", businessId: b.business.id }]);
          }}
        />
      );
    case "admin":
      return (
        <AdminPanel
          key={route.businessId}
          businessId={route.businessId}
          onBack={pop}
          onPreview={async () => {
            const b = await load({ businessId: route.businessId });
            if (b?.business) push({ name: "home" });
          }}
        />
      );
    case "book":
      if (!biz) return null;
      return <BookFlow key={JSON.stringify(route)} boot={boot} serviceId={route.serviceId} onBack={pop ?? home} onMy={() => setStack([{ name: "home" }, { name: "my" }])} />;
    case "my":
      if (!biz) return null;
      return <MyBookings boot={boot} onBack={pop ?? home} onBook={() => push({ name: "book" })} />;
    case "home":
    default:
      if (!biz) {
        return (
          <Landing
            boot={boot}
            onOnboard={() => push({ name: "onboard" })}
            onAdmin={(id) => push({ name: "admin", businessId: id })}
            onSuper={() => push({ name: "super" })}
          />
        );
      }
      return (
        <BusinessHome
          boot={boot}
          onBook={(serviceId) => push({ name: "book", serviceId })}
          onMy={() => push({ name: "my" })}
          onAdmin={boot.role ? () => push({ name: "admin", businessId: biz.id }) : undefined}
        />
      );
  }
}

if (inTelegram) document.documentElement.classList.add("tg");

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);

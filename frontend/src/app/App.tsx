import { useEffect, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { BrowserRouter, Link, NavLink, useLocation, useNavigate } from "react-router-dom";

import { PlayerSearch } from "@/features/search/PlayerSearch";
import { AppRoutes } from "@/routes/AppRoutes";
import { auth, isGuest } from "@/shared/api";
import { LangToggle, tr, useT } from "@/shared/i18n";
import { ThemeToggle } from "@/shared/theme";
import "./styles.css";

// ================================================================================================
// ================================================================================================
/**
 *
 *
 */
const STEAM_ID_FALLBACK = /^(steam_)?\d{15,}$/;
const displayName = (username: string | null | undefined) =>
  username && !STEAM_ID_FALLBACK.test(username) ? username : tr("บัญชี Steam");

function useCloseOnOutside<E extends HTMLElement>(open: boolean, onClose: () => void) {
  const ref = useRef<E>(null);
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose();
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open, onClose]);
  return ref;
}

/**
 */
export function UserMenu() {
  const qc = useQueryClient();
  const navigate = useNavigate();
  const { pathname, search } = useLocation();
  const { t } = useT();
  const me = useQuery({ queryKey: ["me"], queryFn: auth.me, retry: false, staleTime: 5 * 60_000 });
  const [open, setOpen] = useState(false);
  const ref = useCloseOnOutside<HTMLDivElement>(open, () => setOpen(false));
  if (!me.data) return null;
  const user = me.data.user;
  const guest = isGuest(user);
  const name = displayName(user.username);

  async function leave() {
    setOpen(false);
    await auth.logout().catch(() => undefined); // ลบคุกกี้ไม่สำเร็จก็ยังล้างฝั่งหน้าเว็บ
    qc.clear();
    navigate("/", { replace: true });
  }

  return (
    <div className="usermenu" data-testid="user-menu" data-viewer={guest ? "guest" : "steam"} ref={ref}>
      <button
        type="button"
        className="um-trigger"
        onClick={() => setOpen((o) => !o)}
        aria-haspopup="menu"
        aria-expanded={open}
      >
        {guest ? (
          <span className="pill pill-guest">{t("โหมดเยี่ยมชม")}</span>
        ) : user.avatar ? (
          <img className="me-avatar" src={user.avatar} alt="" referrerPolicy="no-referrer" />
        ) : (
          <span className="me-avatar ph" aria-hidden="true">{name.slice(0, 1).toUpperCase()}</span>
        )}
        {!guest && <span className="me-name">{name}</span>}
        <span className="um-caret" aria-hidden="true">▾</span>
      </button>

      {open && (
        <div className="um-panel" role="menu">
          {guest ? (
            <>
              <p className="um-note">{t("โหมดอ่านอย่างเดียว — ดูได้เฉพาะเดโมตัวอย่างหนึ่งรายการ")}</p>
              <a
                className="um-item um-item-steam"
                role="menuitem"
                href={`/auth/steam/login?next=${encodeURIComponent(pathname + search)}`}
              >
                {t("ล็อกอินด้วย Steam")}
              </a>
              <button type="button" className="um-item" role="menuitem" onClick={leave}>
                {t("ออก")}
              </button>
            </>
          ) : (
            <>
              <button type="button" className="um-item" role="menuitem" onClick={leave}>
                {t("ออกจากระบบ")}
              </button>
            </>
          )}
        </div>
      )}
    </div>
  );
}

// ================================================================================================
// ================================================================================================
const NAV = [
  { to: "/player", label: "สถิติของฉัน", end: false, steamOnly: true },
  { to: "/matches", label: "แมตช์", end: false, steamOnly: false },
  { to: "/analysis", label: "เครื่องมือวิเคราะห์", end: false, steamOnly: false },
  { to: "/coach", label: "โค้ช", end: false, steamOnly: false },
];

function useViewerIsGuest() {
  const me = useQuery({ queryKey: ["me"], queryFn: auth.me, retry: false, staleTime: 5 * 60_000 });
  return isGuest(me.data?.user);
}

function Mark() {
  return (
    <svg width="30" height="30" viewBox="0 0 32 32" fill="none" aria-hidden="true">
      <path d="M3 10V3h7M22 3h7v7M29 22v7h-7M10 29H3v-7" stroke="#FF6B00" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
      <circle cx="16" cy="16" r="6.5" stroke="#00E5FF" strokeWidth="2" />
      <path d="M16 6.5v5M16 20.5v5M6.5 16h5M20.5 16h5" stroke="#00E5FF" strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}

function TopBar() {
  const { pathname } = useLocation();
  const guest = useViewerIsGuest();
  const { t } = useT();
  const navRef = useRef<HTMLElement>(null);
  useEffect(() => {
    const nav = navRef.current;
    const active = nav?.querySelector<HTMLElement>("a.active");
    if (nav && active) nav.scrollLeft = active.offsetLeft - nav.offsetLeft - (nav.clientWidth - active.clientWidth) / 2;
  }, [pathname, guest]);
  if (pathname === "/" || pathname === "/login") return null;
  return (
    <header className="topbar">
      <Link className="home-brand" to="/" aria-label="CS2 UNTITLED home">
        <Mark />
        <span>CS2 UNTITLED</span>
      </Link>
      <nav ref={navRef} aria-label={t("เมนูหลัก")}>
        {NAV.filter((n) => !(guest && n.steamOnly)).map((n) => (
          <NavLink key={n.to} to={n.to} end={n.end} className={({ isActive }) => (isActive ? "active" : "")}>
            {t(n.label)}
          </NavLink>
        ))}
      </nav>
      {!guest && <PlayerSearch />}
      <ThemeToggle />
      <LangToggle />
      <UserMenu />
    </header>
  );
}

export function App() {
  const { t } = useT();
  return (
    <BrowserRouter>
      <a className="skip-link" href="#main-content">{t("ข้ามไปยังเนื้อหาหลัก")}</a>
      <TopBar />
      <main className="page" id="main-content">
        <AppRoutes />
      </main>
    </BrowserRouter>
  );
}


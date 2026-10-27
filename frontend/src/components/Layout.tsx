import { useState, useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import { NavLink, Link, Outlet, useLocation } from "react-router-dom";
import {
  Home,
  LayoutGrid,
  Flame,
  Trophy,
  Layers3,
  ChartNoAxesCombined,
  Award,
  Wallet,
  HelpCircle,
  ArrowUpRight,
  Coins,
  Plus,
  Menu,
  X,
  Bell,
  ChevronDown,
  Settings,
  LogOut,
  ShieldCheck,
  Sparkles,
  PanelLeftClose,
  PanelLeftOpen,
} from "lucide-react";
import { Logo } from "./UI";
import ThemeToggle from "./ThemeToggle";
import { useAuth, number, readLocal, writeLocal } from "../lib/api";
import { company } from "../content/company";
import policyIndex from "../content/policy-index.json";
const links = [
  ["Discover", Home, "/"],
  ["All games", LayoutGrid, "/games"],
  ["Daily challenge", Flame, "/daily"],
  ["Leaderboards", Trophy, "/leaderboards"],
  ["Expansions", Layers3, "/expansions"],
] as const;
const personal = [
  ["My dashboard", ChartNoAxesCombined, "/dashboard"],
  ["Achievements", Award, "/achievements"],
  ["My wallet", Wallet, "/wallet"],
] as const;
export default function Layout() {
  const [open, setOpen] = useState(false),
    [menu, setMenu] = useState(false),
    [notifications, setNotifications] = useState(false);
  const [collapsed, setCollapsed] = useState(() =>
    readLocal("lexi-sidebar-collapsed", false),
  );
  const [animateSidebar, setAnimateSidebar] = useState(false);
  const [mobile, setMobile] = useState(
    () => window.matchMedia("(max-width: 760px)").matches,
  );
  const [tooltip, setTooltip] = useState<{ label: string; top: number } | null>(
    null,
  );
  const sidebar = useRef<HTMLElement>(null);
  const menuButton = useRef<HTMLButtonElement>(null);
  const compact = collapsed && !mobile;
  const { user, logout } = useAuth();
  const location = useLocation();
  useEffect(() => {
    const media = window.matchMedia("(max-width: 760px)");
    const change = () => {
      setMobile(media.matches);
      setAnimateSidebar(false);
      setOpen(false);
      setTooltip(null);
    };
    media.addEventListener("change", change);
    return () => media.removeEventListener("change", change);
  }, []);
  useEffect(() => {
    if (!open || !mobile) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    sidebar.current
      ?.querySelector<HTMLButtonElement>("button.mobile-only")
      ?.focus();
    const keyboard = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setOpen(false);
        menuButton.current?.focus();
      }
      if (event.key !== "Tab") return;
      const controls = [
        ...(sidebar.current?.querySelectorAll<HTMLElement>(
          "a[href], button:not([disabled])",
        ) || []),
      ].filter((el) => el.getClientRects().length);
      const first = controls[0],
        last = controls.at(-1);
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last?.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first?.focus();
      }
    };
    document.addEventListener("keydown", keyboard);
    return () => {
      document.body.style.overflow = previous;
      document.removeEventListener("keydown", keyboard);
      if (sidebar.current?.contains(document.activeElement))
        menuButton.current?.focus();
    };
  }, [open, mobile]);
  function showTooltip(target: EventTarget | null) {
    const link =
      target instanceof Element
        ? target.closest<HTMLElement>("[data-label]")
        : null;
    setTooltip(
      compact && link
        ? {
            label: link.dataset.label!,
            top: Math.min(
              window.innerHeight - 36,
              Math.max(12, link.getBoundingClientRect().top),
            ),
          }
        : null,
    );
  }
  useEffect(() => {
    setOpen(false);
    setMenu(false);
    setNotifications(false);
    setTooltip(null);
    window.scrollTo(0, 0);
    const title =
      location.pathname.split("/").filter(Boolean).at(-1) || "Discover";
    const policyTitle = policyIndex.find(
      (policy) => policy.path === location.pathname,
    )?.title;
    document.title = `${policyTitle || title.replaceAll("-", " ").replace(/\b\w/g, (l) => l.toUpperCase())} · LexiHive`;
  }, [location.pathname]);
  return (
    <div
      className={`app-layout ${compact ? "is-collapsed" : ""} ${animateSidebar ? "sidebar-animating" : ""}`}
    >
      <a className="skip-link" href="#main">
        Skip to content
      </a>
      <aside
        id="site-navigation"
        ref={sidebar}
        className={`sidebar ${open ? "is-open" : ""}`}
        role={mobile && open ? "dialog" : undefined}
        aria-modal={mobile && open ? true : undefined}
        aria-label="Site navigation"
        inert={mobile && !open}
        onMouseOver={(e) => showTooltip(e.target)}
        onMouseLeave={() => setTooltip(null)}
        onFocusCapture={(e) => showTooltip(e.target)}
        onBlurCapture={() => setTooltip(null)}
      >
        <div className="sidebar-brand">
          <Logo compact={compact} />
          <button
            className="icon-button sidebar-toggle"
            aria-label={compact ? "Expand sidebar" : "Collapse sidebar"}
            aria-expanded={!compact}
            aria-controls="site-navigation"
            onClick={() => {
              setAnimateSidebar(true);
              setCollapsed(!collapsed);
              writeLocal("lexi-sidebar-collapsed", !collapsed);
              setTooltip(null);
            }}
          >
            {compact ? (
              <PanelLeftOpen size={20} />
            ) : (
              <PanelLeftClose size={20} />
            )}
          </button>
          <button
            className="icon-button mobile-only"
            onClick={() => setOpen(false)}
            aria-label="Close navigation"
          >
            <X />
          </button>
        </div>
        <div className="nav-group-label">YOUR PLAYGROUND</div>
        <nav aria-label="Main navigation">
          {links.map(([label, Icon, to]) => (
            <NavLink
              end={to === "/"}
              key={to}
              to={to}
              aria-label={label}
              data-label={label}
              aria-describedby={
                tooltip?.label === label ? "sidebar-tooltip" : undefined
              }
            >
              <Icon size={18} />
              <span className="nav-label">{label}</span>
              {to === "/daily" && <span className="nav-dot" />}
              {to === "/expansions" && <span className="new-tag">NEW</span>}
            </NavLink>
          ))}
        </nav>
        <div className="nav-group-label personal-label">YOUR SPACE</div>
        <nav aria-label="Player navigation">
          {personal.map(([label, Icon, to]) => (
            <NavLink
              key={to}
              to={to}
              aria-label={label}
              data-label={label}
              aria-describedby={
                tooltip?.label === label ? "sidebar-tooltip" : undefined
              }
            >
              <Icon size={18} />
              <span className="nav-label">{label}</span>
            </NavLink>
          ))}
          {user?.role === "ADMIN" && (
            <NavLink
              to="/admin"
              aria-label="Administration"
              data-label="Administration"
            >
              <ShieldCheck size={18} />
              <span className="nav-label">Administration</span>
            </NavLink>
          )}
          <NavLink to="/settings" aria-label="Settings" data-label="Settings">
            <Settings size={18} />
            <span className="nav-label">Settings</span>
          </NavLink>
          {user && (
            <button
              className="sidebar-logout"
              onClick={logout}
              aria-label="Log out"
              data-label="Log out"
            >
              <LogOut size={18} />
              <span className="nav-label">Log out</span>
            </button>
          )}
        </nav>
        <div className="sidebar-bottom">
          <div className="sidebar-promo">
            <span className="mini-hex">✦</span>
            <h4>
              {user
                ? "A little play. A sharper you."
                : "Make every game count."}
            </h4>
            <p>
              {user
                ? "Your next personal best is waiting."
                : "Save your progress. Find your streak. Get a little sharper."}
            </p>
            <Link to={user ? "/dashboard" : "/signup"}>
              {user ? "Your progress" : "Join the hive"}
              <ArrowUpRight size={15} />
            </Link>
          </div>
          <Link
            className="help-link"
            to="/help"
            aria-label="Help & feedback"
            data-label="Help & feedback"
          >
            <HelpCircle size={17} />
            <span className="nav-label">Help & feedback</span>
            <ArrowUpRight size={14} />
          </Link>
          <span className="sidebar-copyright">A little better, every day.</span>
        </div>
      </aside>
      {open && (
        <button
          className="nav-scrim"
          tabIndex={-1}
          aria-label="Close navigation"
          onClick={() => setOpen(false)}
        />
      )}
      <div className="workspace" inert={mobile && open}>
        <header className="topbar">
          <div className="topbar-left">
            <button
              className="icon-button mobile-only"
              ref={menuButton}
              aria-label="Open navigation"
              aria-expanded={open}
              aria-controls="site-navigation"
              onClick={() => setOpen(true)}
            >
              <Menu />
            </button>
            <span className="topbar-section">
              Your daily dose of <strong>discovery.</strong>
              <Sparkles size={14} />
            </span>
            <span className="mobile-logo">
              lexihive<span>✦</span>
            </span>
          </div>
          <nav className="top-links" aria-label="Quick navigation">
            <NavLink to="/games">Games</NavLink>
            <NavLink to="/daily">Daily Challenges</NavLink>
            <NavLink to="/store">Coin Store</NavLink>
          </nav>
          <div className="topbar-actions">
            <Link
              className="wallet-pill"
              to={user ? "/wallet" : "/store"}
              aria-label={user ? "Open wallet" : "Coin store"}
            >
              <Coins size={17} />
              <span>{user ? number(user.wallet?.balance) : "Coin store"}</span>
              <span className="wallet-plus">
                <Plus size={12} />
              </span>
            </Link>
            <ThemeToggle />
            <div className="popover-wrap">
              <button
                className="icon-button notification-button"
                aria-label="Notifications"
                aria-expanded={notifications}
                onClick={() => {
                  setNotifications(!notifications);
                  setMenu(false);
                }}
              >
                <Bell size={18} />
                {user &&
                  user.emailVerificationRequired !== false &&
                  !user.verified && <i />}
              </button>
              {notifications && (
                <div className="popover">
                  <strong>Your little hive update</strong>
                  <p>
                    {user
                      ? user.verified ||
                        user.emailVerificationRequired === false
                        ? "You’re all caught up. Your next challenge awaits."
                        : "Verify your email to enable coin purchases and expansion unlocks."
                      : "Create an account to save achievements and see your updates here."}
                  </p>
                  <Link to={user ? "/settings" : "/signup"}>
                    {user ? "Account settings" : "Create account"}
                    <ArrowUpRight size={14} />
                  </Link>
                </div>
              )}
            </div>
            <span className="top-divider" />
            {user ? (
              <div className="popover-wrap">
                <button
                  className="avatar-button"
                  onClick={() => {
                    setMenu(!menu);
                    setNotifications(false);
                  }}
                  aria-label="Account menu"
                  aria-expanded={menu}
                >
                  <span className={`avatar ${user.profile?.avatar}`}>
                    {user.displayName.slice(0, 1)}
                  </span>
                  <ChevronDown size={14} />
                </button>
                {menu && (
                  <div className="popover account-popover">
                    <strong>{user.displayName}</strong>
                    <Link to="/profile">
                      <ChartNoAxesCombined size={15} />
                      My profile
                    </Link>
                    <Link to="/settings">
                      <Settings size={15} />
                      Settings
                    </Link>
                    <button onClick={logout}>
                      <LogOut size={15} />
                      Sign out
                    </button>
                  </div>
                )}
              </div>
            ) : (
              <Link className="signin-link" to="/login">
                Sign in
                <ArrowUpRight size={15} />
              </Link>
            )}
          </div>
        </header>
        <main id="main">
          <Outlet />
        </main>
        <footer className="site-footer">
          <div className="footer-company">
            <Logo />
            <p className="footer-tagline">Play a little. Grow a little.</p>
            <strong>{company.name}</strong>
            <p>
              Company No. {company.number}
              <br />
              Registered in {company.jurisdiction}
            </p>
            <address>{company.address}</address>
          </div>
          <nav className="footer-policies" aria-label="Footer policies">
            <h2>Policies</h2>
            {policyIndex.map((policy) => (
              <Link key={policy.path} to={policy.path}>
                {policy.title}
              </Link>
            ))}
            <Link className="footer-all-policies" to="/policies">
              View all policies
            </Link>
          </nav>
          <nav className="footer-contact" aria-label="Footer support">
            <h2>Here to help</h2>
            <Link to="/help">Help center</Link>
            <Link to="/contact">Contact us</Link>
            <a href={`mailto:${company.email}`}>{company.email}</a>
            <a href={company.phoneHref}>{company.phone}</a>
            <a href={company.websiteHref}>{company.website}</a>
          </nav>
          <div className="footer-bottom">
            <div className="footer-payments">
              <img
                src="/images/visa-mastercard.png"
                alt="Visa and Mastercard"
                width="1536"
                height="553"
                loading="lazy"
                decoding="async"
              />
            </div>
            <span className="footer-copyright">
              © {new Date().getFullYear()} LexiHive · {company.name}
            </span>
          </div>
        </footer>
      </div>
      {tooltip &&
        createPortal(
          <div
            id="sidebar-tooltip"
            role="tooltip"
            className="sidebar-tooltip"
            style={{ top: tooltip.top }}
          >
            {tooltip.label}
          </div>,
          document.body,
        )}
    </div>
  );
}

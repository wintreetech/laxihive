import { useState, useEffect } from "react";
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
} from "lucide-react";
import { Logo } from "./UI";
import { useAuth, number } from "../lib/api";
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
  const { user, logout } = useAuth();
  const location = useLocation();
  useEffect(() => {
    setOpen(false);
    setMenu(false);
    setNotifications(false);
    window.scrollTo(0, 0);
    const title =
      location.pathname.split("/").filter(Boolean).at(-1) || "Discover";
    document.title = `${title.replaceAll("-", " ").replace(/\b\w/g, (l) => l.toUpperCase())} · LexiHive`;
  }, [location.pathname]);
  return (
    <div className="app-layout">
      <a className="skip-link" href="#main">
        Skip to content
      </a>
      <aside className={`sidebar ${open ? "is-open" : ""}`}>
        <div className="sidebar-brand">
          <Logo />
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
            <NavLink end={to === "/"} key={to} to={to}>
              <Icon size={18} />
              {label}
              {to === "/daily" && <span className="nav-dot" />}
              {to === "/expansions" && <span className="new-tag">NEW</span>}
            </NavLink>
          ))}
        </nav>
        <div className="nav-group-label personal-label">YOUR SPACE</div>
        <nav aria-label="Player navigation">
          {personal.map(([label, Icon, to]) => (
            <NavLink key={to} to={to}>
              <Icon size={18} />
              {label}
            </NavLink>
          ))}
          {user?.role === "ADMIN" && (
            <NavLink to="/admin">
              <ShieldCheck size={18} />
              Administration
            </NavLink>
          )}
          <NavLink to="/settings">
            <Settings size={18} />
            Settings
          </NavLink>
          {user && (
            <button className="sidebar-logout" onClick={logout}>
              <LogOut size={18} />
              Log out
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
          <Link className="help-link" to="/help">
            <HelpCircle size={17} />
            Help & feedback
            <ArrowUpRight size={14} />
          </Link>
          <span className="sidebar-copyright">A little better, every day.</span>
        </div>
      </aside>
      {open && (
        <button
          className="nav-scrim"
          aria-label="Close navigation"
          onClick={() => setOpen(false)}
        />
      )}
      <div className="workspace">
        <header className="topbar">
          <div className="topbar-left">
            <button
              className="icon-button mobile-only"
              aria-label="Open navigation"
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
            <Link className="wallet-pill" to={user ? "/wallet" : "/store"}>
              <Coins size={17} />
              <span>{user ? number(user.wallet?.balance) : "Coin store"}</span>
              <span className="wallet-plus">
                <Plus size={12} />
              </span>
            </Link>
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
                {user && !user.verified && <i />}
              </button>
              {notifications && (
                <div className="popover">
                  <strong>Your little hive update</strong>
                  <p>
                    {user
                      ? user.verified
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
        <footer>
          <Logo />
          <p>Play a little. Grow a little.</p>
          <div>
            <Link to="/help">Help</Link>
            <Link to="/contact">Contact</Link>
            <Link to="/privacy">Privacy</Link>
            <Link to="/terms">Terms</Link>
            <Link to="/refund-policy">Refunds</Link>
            <Link to="/virtual-currency">Virtual currency</Link>
          </div>
          <span>© {new Date().getFullYear()} LexiHive</span>
        </footer>
      </div>
    </div>
  );
}

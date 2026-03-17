"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useSession, signIn, signOut } from "next-auth/react";

const navItems = [
  {
    href: "/",
    label: "대시보드",
    icon: (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
        <rect x="3" y="3" width="7" height="7" rx="1" />
        <rect x="14" y="3" width="7" height="7" rx="1" />
        <rect x="3" y="14" width="7" height="7" rx="1" />
        <rect x="14" y="14" width="7" height="7" rx="1" />
      </svg>
    ),
  },
  {
    href: "/profile",
    label: "내 프로필",
    icon: (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
        <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
        <circle cx="12" cy="7" r="4" />
      </svg>
    ),
  },
];

export function AppSidebar() {
  const pathname = usePathname();
  const { data: session, status } = useSession();

  function isActive(href: string) {
    if (href === "/") return pathname === "/";
    return pathname.startsWith(href);
  }

  return (
    <aside className="app-sidebar">
      {/* Logo */}
      <div className="sidebar-logo">
        <div className="sidebar-logo-icon">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="var(--accent)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M12 2L2 7l10 5 10-5-10-5z" />
            <path d="M2 17l10 5 10-5" />
            <path d="M2 12l10 5 10-5" />
          </svg>
        </div>
        <span className="sidebar-logo-text">MAI</span>
      </div>

      {/* Navigation */}
      <nav className="sidebar-nav">
        {navItems.map((item) => (
          <Link
            key={item.href}
            href={item.href}
            className={`sidebar-nav-item ${isActive(item.href) ? "sidebar-nav-item-active" : ""}`}
          >
            <span className="sidebar-nav-icon">{item.icon}</span>
            <span className="sidebar-nav-label">{item.label}</span>
          </Link>
        ))}
      </nav>

      {/* Tagline */}
      <p className="px-3 pb-3 text-[11px] leading-[1.6] text-[var(--text-tertiary)]">
        모두가 같은 페이지에 있는 회의.<br />
        역할별 브리핑, 실시간 Q&A, 맞춤 보조.
      </p>

      {/* User section at bottom */}
      <div className="sidebar-footer">
        {status === "authenticated" && session?.user ? (
          <div className="sidebar-user">
            {session.user.image ? (
              <img src={session.user.image} alt="" className="sidebar-avatar" />
            ) : (
              <div className="sidebar-avatar-placeholder">
                {session.user.name?.[0] ?? "U"}
              </div>
            )}
            <div className="sidebar-user-info">
              <span className="sidebar-user-name">{session.user.name}</span>
              <button
                type="button"
                className="sidebar-user-action"
                onClick={() => signOut()}
              >
                로그아웃
              </button>
            </div>
          </div>
        ) : status === "unauthenticated" ? (
          <button
            type="button"
            className="sidebar-login-btn"
            onClick={() => signIn("google")}
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
              <path d="M15 3h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4" />
              <polyline points="10 17 15 12 10 7" />
              <line x1="15" y1="12" x2="3" y2="12" />
            </svg>
            Google 로그인
          </button>
        ) : null}
      </div>
    </aside>
  );
}

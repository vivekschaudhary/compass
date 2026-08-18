"use client";

import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useState, useSyncExternalStore } from "react";
import type { ReactNode } from "react";

/**
 * The engagement's navigation.
 *
 * A rail rather than a top bar, collapsible to a strip of icons. The collapsed state is remembered
 * because a preference that resets on every navigation is not a preference — and it is read before
 * paint, from a class the layout already put on <html>, so the rail does not flash open and snap
 * shut on each load.
 *
 * "Working as" is a menu, not a row of chips. Eleven chips across the top said everything at once
 * and made the one that mattered — who you are right now — the hardest thing to find.
 */

export type NavRole = { code: string; label: string; holder: string | null; initials: string; tier: string };
export type NavEngagement = { id: string; name: string };

/**
 * The rail's collapsed state lives on <html>, set by an inline script before first paint so the
 * rail never renders open and snaps shut. That makes the DOM the source of truth, not React — so
 * it is subscribed to rather than mirrored into state. Reading it in an effect would be a
 * cascading render, which React 19 rejects, and it would be wrong for the same reason: an effect
 * runs after paint, which is the flash this exists to avoid.
 */
const RAIL_KEY = "compass-rail";
const listeners = new Set<() => void>();

const railStore = {
  subscribe(fn: () => void) {
    listeners.add(fn);
    return () => { listeners.delete(fn); };
  },
  get: () => document.documentElement.classList.contains("rail-collapsed"),
  // The server cannot know a browser preference, and guessing would mismatch on hydration.
  getServer: () => false,
  set(next: boolean) {
    document.documentElement.classList.toggle("rail-collapsed", next);
    try { localStorage.setItem(RAIL_KEY, next ? "collapsed" : "open"); } catch { /* private mode */ }
    listeners.forEach((fn) => fn());
  },
};

const NAV = [
  { href: "jobs", label: "Jobs to do", icon: <><rect x="4" y="4" width="16" height="16" rx="2.5" /><path d="M8.5 12l2.2 2.2 4.8-4.8" /></> },
  { href: "plan", label: "Plan & sprint", icon: <><path d="M3 6h18M3 12h18M3 18h18" /><circle cx="8" cy="6" r="1.6" fill="currentColor" stroke="none" /><circle cx="16" cy="12" r="1.6" fill="currentColor" stroke="none" /><circle cx="11" cy="18" r="1.6" fill="currentColor" stroke="none" /></> },
  { href: "content", label: "Shared content", icon: <><path d="M4 5.5A1.5 1.5 0 0 1 5.5 4H10l2 2.5h6.5A1.5 1.5 0 0 1 20 8v10.5a1.5 1.5 0 0 1-1.5 1.5h-13A1.5 1.5 0 0 1 4 18.5Z" /></> },
  { href: "setup", label: "Setup", icon: <><path d="M12 15.5a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7Z" /><path d="M19.4 15a1.7 1.7 0 0 0 .34 1.87l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.7 1.7 0 0 0-2.87 1.2V21a2 2 0 1 1-4 0v-.09A1.7 1.7 0 0 0 7 19.4a1.7 1.7 0 0 0-1.87.34l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06A1.7 1.7 0 0 0 3 15a1.7 1.7 0 0 0-1.51-1H1a2 2 0 1 1 0-4h.09A1.7 1.7 0 0 0 2.6 8" /></> },
] as const;

const Icon = ({ children }: { children: ReactNode }) => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor"
       strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">{children}</svg>
);

export function Sidebar({ engagement, engagementName, sprint, roles, fallbackRole, engagements, org }: {
  engagement: string; engagementName: string; sprint: string | null;
  roles: NavRole[];
  /** Used when the URL names no role — the same default the pages resolve to. */
  fallbackRole: string | null;
  engagements: NavEngagement[];
  org: string;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const params = useSearchParams();
  const activeCode = params.get("role") ?? fallbackRole;
  const activeRole = roles.find((r) => r.code === activeCode) ?? null;
  const collapsed = useSyncExternalStore(railStore.subscribe, railStore.get, railStore.getServer);
  const [menuOpen, setMenuOpen] = useState(false);
  const [projectsOpen, setProjectsOpen] = useState(false);


  function pickRole(code: string) {
    setMenuOpen(false);
    const q = new URLSearchParams(params.toString());
    q.set("role", code);
    router.push(`${pathname}?${q.toString()}`);
  }

  return (
    <aside className={collapsed ? "rail rail-narrow" : "rail"}>
      <div className="rail-brand">
        <div className="rail-project">
          <button
            className="rail-project-button" onClick={() => setProjectsOpen(!projectsOpen)}
            title={collapsed ? engagementName : undefined}
            aria-expanded={projectsOpen} aria-haspopup="menu"
          >
            <span className="rail-mark" aria-hidden>◈</span>
            {!collapsed && (
              <span className="rail-project-text">
                <span className="rail-project-name">{engagementName}</span>
                {sprint && <span className="rail-engagement">{sprint}</span>}
              </span>
            )}
            {!collapsed && <span className="rail-switch" aria-hidden>⌃⌄</span>}
          </button>

          {projectsOpen && (
            <div className="rail-menu rail-menu-down" role="menu">
              {engagements.map((e) => (
                <Link
                  key={e.id} role="menuitem" href={`/v2/e/${e.id}/jobs`}
                  className={e.id === engagement ? "rail-menu-item rail-menu-item-on" : "rail-menu-item"}
                  onClick={() => setProjectsOpen(false)}
                >
                  <span className="rail-menu-text"><span>{e.name}</span></span>
                </Link>
              ))}
              {/* Creating and browsing sit with the list, because both are what you came here for
                  when the list did not have what you wanted. */}
              <div className="rail-menu-rule">Organisation</div>
              <Link href="/v2/new" className="rail-menu-item" role="menuitem" onClick={() => setProjectsOpen(false)}>
                <span className="rail-menu-text"><span>+ New</span></span>
              </Link>
              <Link href="/v2/projects" className="rail-menu-item" role="menuitem" onClick={() => setProjectsOpen(false)}>
                <span className="rail-menu-text"><span>Manage projects</span></span>
              </Link>
            </div>
          )}
        </div>
        {/* Beside the brand rather than in the bottom corner — where every dev overlay and support
            widget in existence parks itself, and where this one was genuinely unclickable. */}
        <button
          className="rail-toggle" onClick={() => railStore.set(!collapsed)}
          title={collapsed ? "Expand" : "Collapse"}
          aria-label={collapsed ? "Expand navigation" : "Collapse navigation"}
        >
          {collapsed ? "»" : "«"}
        </button>
      </div>

      <nav className="rail-nav">
        {NAV.map((n) => {
          const href = `/v2/e/${engagement}/${n.href}`;
          const active = pathname.startsWith(href);
          return (
            <Link
              key={n.href} href={activeRole ? `${href}?role=${activeRole.code}` : href}
              className={active ? "rail-item rail-item-on" : "rail-item"}
              aria-current={active ? "page" : undefined}
              // The label when there is no room for the label. `title` and aria-label both, so it
              // works for a pointer and for a screen reader rather than only the first.
              title={collapsed ? n.label : undefined}
              aria-label={n.label}
            >
              <Icon>{n.icon}</Icon>
              {!collapsed && <span>{n.label}</span>}
              {collapsed && <span className="rail-tip">{n.label}</span>}
            </Link>
          );
        })}
      </nav>

      <div className="rail-foot">
        <div className="rail-role">
          <button
            className="rail-role-button" onClick={() => setMenuOpen(!menuOpen)}
            title={collapsed ? `Working as ${activeRole?.holder ?? activeRole?.label ?? "—"}` : undefined}
            aria-expanded={menuOpen} aria-haspopup="menu"
          >
            <span className="avatar avatar-active">{activeRole?.initials ?? "—"}</span>
            {!collapsed && (
              <span className="rail-role-text">
                <span className="rail-role-label">Working as</span>
                <span className="rail-role-name">{activeRole?.holder ?? activeRole?.label ?? "nobody"}</span>
              </span>
            )}
            {!collapsed && <span className="rail-caret" aria-hidden>{menuOpen ? "▾" : "▸"}</span>}
          </button>

          {menuOpen && (
            <div className="rail-menu" role="menu">
              {[...roles].sort((a, b) => Number(Boolean(b.holder)) - Number(Boolean(a.holder))).map((r, i, list) => (
                <div key={r.code}>
                {/* One line between the people who are actually on this engagement and the roles
                    that exist but nobody holds. Both are worth switching to — the second tells you
                    what a queue looks like for a role you have not staffed yet — but they are not
                    the same kind of thing. */}
                {i > 0 && Boolean(list[i - 1].holder) && !r.holder && <div className="rail-menu-rule">Unstaffed roles</div>}
                <button
                  role="menuitem"
                  className={r.code === activeRole?.code ? "rail-menu-item rail-menu-item-on" : "rail-menu-item"}
                  onClick={() => pickRole(r.code)}
                >
                  <span className="avatar">{r.initials}</span>
                  <span className="rail-menu-text">
                    <span>{r.holder ?? r.label}</span>
                    {/* The role under the person, because two people can hold roles that see very
                        different queues and a name alone does not say which. When nobody holds it
                        the label IS the name, so repeating it says nothing — the sub-line carries
                        what the row is actually for instead. */}
                    <span className="rail-menu-role">
                      {r.holder ? r.label : "nobody holds this — see its empty queue"}
                    </span>
                  </span>
                </button>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* The organisation, last. It is the least-changing thing on the screen and the one you
            look at least — which is exactly why it belongs at the bottom rather than the top. */}
        <div className="rail-org" title={collapsed ? org : undefined}>
          <span className="avatar rail-org-mark">{org.slice(0, 1).toUpperCase()}</span>
          {!collapsed && (
            <span className="rail-org-text">
              <span className="rail-org-name">{org}</span>
              <span className="rail-org-label">Organisation</span>
            </span>
          )}
        </div>
      </div>
    </aside>
  );
}

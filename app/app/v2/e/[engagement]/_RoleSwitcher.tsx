"use client";

// "Working as" — the demo's identity control.
//
// It writes the role to the URL rather than to state, so a screen is shareable and the acting
// role survives a refresh. That query parameter is the seam: when real identity lands, the role
// comes from the session and this component becomes a read-only label without any call site
// changing, because everything downstream already takes an Actor.
//
// It shows PEOPLE, not role codes. Switching to Rafi should feel like looking over someone's
// shoulder, not like changing a filter.

import { useRouter, useSearchParams, usePathname } from "next/navigation";
import { Avatar } from "../../_ui/primitives";

export type SwitchableRole = {
  code: string;
  label: string;
  holder: string | null;
  initials: string;
};

export function RoleSwitcher({ engagement, roles }: { engagement: string; roles: SwitchableRole[] }) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const active = params.get("role") ?? roles[0]?.code;

  if (!roles.length) {
    return (
      <span className="text-muted no-roster">
        Nobody is staffed on {engagement} yet — the roster is what gives a role a face.
      </span>
    );
  }

  function pick(code: string) {
    const next = new URLSearchParams(params.toString());
    next.set("role", code);
    router.replace(`${pathname}?${next}`, { scroll: false });
  }

  return (
    <div className="role-switcher">
      {roles.map((r) => {
        const on = r.code === active;
        return (
          <button
            key={r.code}
            onClick={() => pick(r.code)}
            aria-current={on ? "true" : undefined}
            className={on ? "role-chip role-chip-on" : "role-chip"}
            title={r.label}
          >
            <Avatar initials={r.initials} active={on} />
            <span>{(r.holder ?? r.label).split(" ")[0]}</span>
          </button>
        );
      })}
    </div>
  );
}

import { useEffect, useRef, useState } from "react";
import type { Role, SessionUser } from "./types";

export const ROLE_LABEL: Record<Role, string> = { architect: "Architect", engineer: "Engineer", viewer: "Viewer" };

/** One line on what each role can do (the server enforces it; see src/server/auth.ts). */
export const ROLE_SUMMARY: Record<Role, string> = {
  architect: "Edits the main model and code, and applies drafts.",
  engineer: "Reads everything and proposes changes in drafts. An architect applies them.",
  viewer: "Looks at everything, but cannot change anything.",
};

/**
 * Who is signed in: name and role in the top bar; a click opens a small menu with what the role can do and
 * Sign out. `role` is what the person can do here (a viewer on a read-only server, whatever the users file says).
 */
export function UserChip({ me, role, onSignOut }: { me: SessionUser; role: Role; onSignOut(): void }) {
  const [open, setOpen] = useState(false);
  const wrap = useRef<HTMLSpanElement>(null);
  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => !wrap.current?.contains(e.target as Node) && setOpen(false);
    const esc = (e: KeyboardEvent) => e.key === "Escape" && (e.stopPropagation(), setOpen(false));
    window.addEventListener("mousedown", close);
    window.addEventListener("keydown", esc, true);
    return () => {
      window.removeEventListener("mousedown", close);
      window.removeEventListener("keydown", esc, true);
    };
  }, [open]);
  return (
    <span className="user-chip-wrap" ref={wrap}>
      {role === "viewer" && (
        <span className="view-only-badge" title="You can look at everything but not change it" data-testid="view-only">
          View only
        </span>
      )}
      <button className="ghost user-chip" onClick={() => setOpen(!open)} aria-haspopup="menu" aria-expanded={open} title={`${me.name} (${ROLE_LABEL[role]})`} data-testid="user-chip">
        <span className="user-name">{me.name}</span>
        <span className={`role-badge ${role}`} data-testid="user-role">
          {ROLE_LABEL[role]}
        </span>
      </button>
      {open && (
        <div className="float user-menu" role="menu" data-testid="user-menu">
          <p data-testid="user-menu-who">
            Signed in as <strong>{me.name}</strong> ({ROLE_LABEL[role]})
          </p>
          <p className="muted small">{ROLE_SUMMARY[role]}</p>
          <button
            role="menuitem"
            onClick={() => {
              setOpen(false);
              onSignOut();
            }}
            data-testid="sign-out"
          >
            Sign out
          </button>
        </div>
      )}
    </span>
  );
}

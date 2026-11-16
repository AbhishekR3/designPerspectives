/** The frame of the hub-level pages: a left rail (pages, projects, the user) and the page (DEC-052). */

import { DialogHost } from "../dialogs";
import { Icon } from "../icons";
import { Toasts } from "../notify";
import { UserChip } from "../UserChip";
import type { HubInfo } from "../types";
import { projectLink } from "../useNavigation";
import { CatalogPage } from "./CatalogPage";
import { CredentialsPage } from "./CredentialsPage";
import { HistoryPage } from "./HistoryPage";
import { HomePage } from "./HomePage";

export type HubPage = "home" | "catalog" | "credentials" | "history";

export function HubShell({ hub, page, onSignOut, onChanged }: { hub: HubInfo; page: HubPage; onSignOut(): void; onChanged(): Promise<void> }) {
  const projects = hub.projects.filter((p) => !p.catalog);
  const catalog = hub.projects.find((p) => p.catalog);
  const nav = (id: HubPage, href: string, icon: string, label: string, testId: string) => (
    <a className={`rail-link${page === id ? " on" : ""}`} href={href} aria-current={page === id ? "page" : undefined} data-testid={testId}>
      <Icon name={icon} size={16} /> <span>{label}</span>
    </a>
  );
  return (
    <div className="hub" data-testid="hub-shell">
      <nav className="hub-rail" aria-label="designPerspectives">
        <div className="hub-brand">
          <span className="brand-small">designPerspectives</span>
          <strong title={hub.name}>{hub.name}</strong>
          <span className="muted small">{hub.mode === "hub" ? `${projects.length} project${projects.length === 1 ? "" : "s"}` : "One project"}</span>
        </div>
        {nav("home", "#/home", "home", "Home", "rail-home")}
        {nav("catalog", "#/catalog", "database", hub.mode === "hub" ? "Shared catalog" : "Data", "rail-catalog")}
        {nav("history", "#/history", "restart", "History", "rail-history")}
        {hub.canAdmin && nav("credentials", "#/settings/credentials", "gear", "Credentials", "rail-credentials")}
        <div className="rail-heading">{hub.mode === "hub" ? "Projects" : "Project"}</div>
        <div className="rail-projects">
          {projects.map((p) => (
            <a key={p.id} className="rail-link" href={projectLink(hub.mode === "hub" ? p.id : null)} title={p.description || p.name} data-testid={`rail-project-${p.id}`}>
              <Icon name="layers" size={14} /> <span className="truncate">{p.name}</span>
              {p.role && hub.me && p.role !== hub.me.role && <span className="muted small rail-role">{p.role}</span>}
              {p.error && <Icon name="warning" size={12} className="warn-icon" />}
            </a>
          ))}
          {catalog && (
            <a className="rail-link" href={projectLink(catalog.id)} title="Edit the shared elements" data-testid="rail-project-catalog">
              <Icon name="star" size={14} /> <span>{catalog.name}</span>
            </a>
          )}
        </div>
        <span className="grow" />
        {hub.me && (
          <div className="rail-user">
            <UserChip me={hub.me} role={hub.me.role} onSignOut={onSignOut} />
          </div>
        )}
      </nav>
      <main className="hub-main">
        {page === "home" && <HomePage hub={hub} onChanged={onChanged} />}
        {page === "catalog" && <CatalogPage hub={hub} />}
        {page === "credentials" && <CredentialsPage hub={hub} />}
        {page === "history" && <HistoryPage hub={hub} />}
        <div className="hub-toasts">
          <Toasts />
        </div>
      </main>
      <DialogHost />
    </div>
  );
}

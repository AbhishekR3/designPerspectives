/** The bell: what needs a look now, and the errors and notices shown earlier in this tab. */

import { useState } from "react";
import { Icon } from "./icons";
import { notify, useNotificationLog } from "./notify";
import { timeAgo } from "./comments";
import { useDismiss } from "./useDismiss";

/** Something that holds now (not a message that went by): a model that did not load cleanly, a draft behind the main model, decisions that wait. */
export interface StandingItem {
  id: string;
  tone: "warn" | "info";
  text: string;
  /** Where a click goes (the item is plain text without it). */
  onOpen?(): void;
}

export function NotificationBell({ standing = [], className = "ghost icon" }: { standing?: StandingItem[]; className?: string }) {
  const { log, unread } = useNotificationLog();
  // Open: where the list goes. It is fixed to the window (placed from the button), so the bar it sits in does not clip it.
  const [place, setPlace] = useState<React.CSSProperties | null>(null);
  const open = place !== null;
  const close = () => setPlace(null);
  const ref = useDismiss<HTMLSpanElement>(open, close);
  const warns = standing.filter((s) => s.tone === "warn").length;
  const title = unread ? `Notifications: ${unread} new` : warns ? `Notifications: ${warns} to look at` : "Notifications";
  return (
    <span className="export-wrap bell-wrap" ref={ref}>
      <button
        className={`${className} bell-btn${open ? " on" : ""}`}
        onClick={(e) => {
          if (open) return close();
          const r = e.currentTarget.getBoundingClientRect();
          setPlace({ position: "fixed", top: r.bottom + 6, right: Math.max(8, window.innerWidth - r.right), margin: 0 });
          // Opened: the new lines are seen. They stay in the list.
          notify.markRead();
        }}
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-label={title}
        title={title}
        data-testid="notifications"
      >
        <Icon name="bell" />
        {unread > 0 ? (
          <span className="bell-count" data-testid="notifications-count">
            {unread > 9 ? "9+" : unread}
          </span>
        ) : warns > 0 ? (
          <span className="bell-dot" data-testid="notifications-dot" />
        ) : null}
      </button>
      {open && (
        <div className="pop-menu wide bell-panel" style={place} role="dialog" aria-label="Notifications" data-testid="notifications-panel">
          {standing.length > 0 && (
            <>
              <div className="bell-head">Now</div>
              {standing.map((s) =>
                s.onOpen ? (
                  <button
                    key={s.id}
                    className={`bell-item ${s.tone}`}
                    onClick={() => {
                      close();
                      s.onOpen!();
                    }}
                    data-testid={`notification-${s.id}`}
                  >
                    <Icon name={s.tone === "warn" ? "warning" : "dots"} size={13} />
                    <span>{s.text}</span>
                  </button>
                ) : (
                  <div key={s.id} className={`bell-item ${s.tone}`} data-testid={`notification-${s.id}`}>
                    <Icon name={s.tone === "warn" ? "warning" : "dots"} size={13} />
                    <span>{s.text}</span>
                  </div>
                ),
              )}
            </>
          )}
          <div className="bell-head">
            <span>Earlier in this tab</span>
            {log.length > 0 && (
              <button className="link small" onClick={() => notify.clearLog()} data-testid="notifications-clear">
                Clear
              </button>
            )}
          </div>
          {log.length === 0 ? (
            <p className="muted small bell-empty">{standing.length ? "No errors or notices so far." : "Nothing to show: no errors or notices so far."}</p>
          ) : (
            log.map((e) => (
              <div key={e.id} className={`bell-item ${e.kind === "error" ? "error" : "info"}`} data-testid="notification-log">
                <Icon name={e.kind === "error" ? "warning" : "dots"} size={13} />
                <span>
                  {e.message}
                  <span className="muted small bell-time"> · {timeAgo(new Date(e.at).toISOString())}</span>
                </span>
              </div>
            ))
          )}
        </div>
      )}
    </span>
  );
}

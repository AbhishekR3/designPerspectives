import type { EdgeMark, NodeMark } from "./testingDecor";

/** What the testing mode adds to a line's label: the breakpoint, the intercept point's port, the calls seen, a trace hop. */
export function edgeBadgeTexts(m: EdgeMark): string[] {
  return [m.point ? `:${m.port ?? "?"}` : "", m.watched ? `watched${m.ms !== null ? ` · ${m.ms} ms` : ""}` : "", m.calls > 0 ? `${m.calls} call${m.calls === 1 ? "" : "s"}` : ""].filter(Boolean);
}

const BP_TITLE = {
  on: "Breakpoint: a call here is paused",
  off: "Breakpoint, switched off",
  hollow: "Breakpoint, but no intercept point is open for this line, so nothing can pause here yet",
};

export function EdgeTestingBadges({ id, mark }: { id: string; mark: EdgeMark }) {
  return (
    <>
      {mark.breakpoint && (
        <span className={`badge bp-badge ${mark.breakpoint}`} title={BP_TITLE[mark.breakpoint]} data-testid={`bp-edge-${id}`} data-state={mark.breakpoint}>
          <span className="bp-dot" />
        </span>
      )}
      {mark.point && (
        <span
          className={`badge point-badge ${mark.point}`}
          title={mark.point === "open" ? "An intercept point is open here" : "An intercept point is remembered here and not started"}
          data-testid={`point-edge-${id}`}
        >
          :{mark.port ?? "?"}
        </span>
      )}
      {mark.paused && (
        <span className="badge paused-badge" data-testid={`paused-edge-${id}`} data-phase={mark.paused}>
          {mark.paused === "request" ? "paused" : "paused at reply"}
        </span>
      )}
      {mark.watched && (
        <span className={`badge watched-badge${mark.error ? " failed" : ""}`} title="Seen in the chosen trace" data-testid={`watched-edge-${id}`}>
          watched{mark.ms !== null ? ` · ${mark.ms} ms` : ""}
        </span>
      )}
      {mark.calls > 0 && !mark.paused && (
        <span className="badge subtle" title="Calls in the run log" data-testid={`calls-edge-${id}`}>
          {mark.calls} call{mark.calls === 1 ? "" : "s"}
        </span>
      )}
    </>
  );
}

export function NodeTestingBadges({ id, mark }: { id: string; mark: NodeMark }) {
  const any = mark.breakpoint || mark.point || mark.notInModel.length > 0 || mark.watched;
  if (!any) return null;
  return (
    <div className="node-testing" data-testid={`testing-node-${id}`}>
      {mark.breakpoint && (
        <span
          className={`badge bp-badge ${mark.breakpoint}`}
          title={mark.breakpoint === "on" ? "Breakpoint: calls here are paused" : "Breakpoint, switched off"}
          data-testid={`bp-node-${id}`}
          data-state={mark.breakpoint}
        >
          <span className="bp-dot" />
        </span>
      )}
      {mark.point && (
        <span className={`badge point-badge ${mark.point}`} data-testid={`point-node-${id}`}>
          :{mark.port ?? "?"}
        </span>
      )}
      {mark.watched && (
        <span className={`badge watched-badge${mark.error ? " failed" : ""}`} title="Seen in the chosen trace">
          watched
        </span>
      )}
      {mark.notInModel.length > 0 && (
        <span className="badge drift-badge" title="The chosen trace shows calls the model has no relationship for" data-testid={`not-in-model-${id}`}>
          {mark.notInModel.join(", ")}: not in the model
        </span>
      )}
    </div>
  );
}

import { useEffect, useState } from "react";
import type { Diagram } from "./types";

/** The flow player: the step shown (null: the introduction) and whether it plays by itself. */
export function useFlowPlayer() {
  const [flowStep, setFlowStep] = useState<number | null>(null);
  const [playing, setPlaying] = useState(false);
  return { flowStep, setFlowStep, playing, setPlaying };
}

/** While playing, move to the next step every 1.6 s and stop after the last one. Returns the shown flow, if any. */
export function useFlowAutoplay(diagram: Diagram | null, player: ReturnType<typeof useFlowPlayer>) {
  const { flowStep, setFlowStep, playing, setPlaying } = player;
  const flow = diagram?.level === "flow" ? diagram.flow : undefined;
  useEffect(() => {
    if (!playing || !flow) return;
    // A flow without steps has nothing to play: no step is set on it.
    if (flow.steps.length === 0) {
      setPlaying(false);
      return;
    }
    const t = window.setTimeout(
      () => {
        if (flowStep === null) setFlowStep(0);
        else if (flowStep < flow.steps.length) setFlowStep(flowStep + 1);
        if (flowStep !== null && flowStep >= flow.steps.length - 1) setPlaying(false);
      },
      flowStep === null ? 0 : 1600,
    );
    return () => window.clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- setFlowStep, setPlaying are stable (state setters or refs), so it is safe to leave out of the dependencies
  }, [playing, flowStep, flow]);
  return flow;
}

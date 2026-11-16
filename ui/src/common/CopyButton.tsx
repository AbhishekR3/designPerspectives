import { useEffect, useRef, useState } from "react";

/** A button that copies `text` to the clipboard. It says "Copied" for a moment, or says why it could not copy. */
export function CopyButton({ text, label = "Copy", testId, className, disabled }: { text: string; label?: string; testId?: string; className?: string; disabled?: boolean }) {
  const [state, setState] = useState<"idle" | "copied" | "failed">("idle");
  const timer = useRef<number>(0);
  useEffect(() => () => window.clearTimeout(timer.current), []);
  const copy = async () => {
    let next: "copied" | "failed" = "copied";
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      next = "failed";
    }
    setState(next);
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => setState("idle"), next === "copied" ? 1500 : 4000);
  };
  return (
    <>
      <button className={className} onClick={() => void copy()} disabled={disabled} aria-live="polite" data-testid={testId}>
        {state === "copied" ? "Copied" : label}
      </button>
      {state === "failed" && (
        <span className="muted small" role="status" data-testid={testId ? `${testId}-failed` : undefined}>
          Copying is not allowed here. Select the text and copy it yourself.
        </span>
      )}
    </>
  );
}

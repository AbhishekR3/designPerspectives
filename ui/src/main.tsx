import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "@xyflow/react/dist/style.css";
import "./styles/tokens.css";
import "./styles/base.css";
import "./styles/layout.css";
import "./styles/overlays.css";
import "./styles/canvas.css";
import "./styles/panels.css";
import "./styles/dialogs.css";
import "./styles/pages.css";
import { AuthGate } from "./SignIn";
import { ErrorBoundary } from "./ErrorBoundary";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <ErrorBoundary>
      <AuthGate />
    </ErrorBoundary>
  </StrictMode>,
);

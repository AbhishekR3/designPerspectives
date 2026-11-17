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
import "./styles/home.css";
import { AuthGate } from "./pages/SignIn";
import { ErrorBoundary } from "./common/ErrorBoundary";
import { Tooltip } from "./common/Tooltip";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <ErrorBoundary>
      <AuthGate />
    </ErrorBoundary>
    <Tooltip />
  </StrictMode>,
);

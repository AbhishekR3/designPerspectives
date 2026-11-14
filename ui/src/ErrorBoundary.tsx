import { Component, type ReactNode } from "react";

/** Shows what went wrong instead of a blank page if the UI hits an unexpected error. */
export class ErrorBoundary extends Component<{ children: ReactNode }, { error: Error | null }> {
  state = { error: null as Error | null };

  static getDerivedStateFromError(error: Error) {
    return { error };
  }

  render() {
    if (!this.state.error) return this.props.children;
    return (
      <div className="crash" role="alert">
        <h2>Something went wrong in the editor</h2>
        <p>Your model is saved on disk after every change, so nothing you already did is lost.</p>
        <pre>{this.state.error.message}</pre>
        <button className="primary" onClick={() => window.location.reload()}>
          Reload
        </button>
      </div>
    );
  }
}

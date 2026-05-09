import { Component, type ErrorInfo, type ReactNode } from "react";

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
  message: string;
}

export class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, message: "" };
  }

  static getDerivedStateFromError(error: unknown): State {
    const message =
      error instanceof Error ? error.message : "An unexpected error occurred.";
    return { hasError: true, message };
  }

  override componentDidCatch(error: unknown, info: ErrorInfo): void {
    console.error("[ErrorBoundary] Caught error:", error, info.componentStack);
  }

  override render(): ReactNode {
    if (this.state.hasError) {
      return (
        <div
          style={{
            minHeight: "100vh",
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            background: "#030806",
            color: "#ddeee5",
            fontFamily: "'Outfit', sans-serif",
            padding: "2rem",
            textAlign: "center",
          }}
        >
          <div
            style={{
              fontSize: "2.5rem",
              marginBottom: "1rem",
            }}
          >
            🛡️
          </div>
          <h1
            style={{
              fontFamily: "'Exo 2', sans-serif",
              fontWeight: 800,
              fontSize: "1.5rem",
              marginBottom: "0.75rem",
              color: "#ff4444",
            }}
          >
            Something went wrong.
          </h1>
          <p
            style={{
              color: "#6a9478",
              fontSize: "0.95rem",
              maxWidth: 420,
              lineHeight: 1.7,
              marginBottom: "1.5rem",
            }}
          >
            EmeraldFi encountered an unexpected error. Refresh the page to try again.
          </p>
          <button
            onClick={() => window.location.reload()}
            style={{
              padding: "12px 28px",
              background: "#00e56b",
              color: "#020c05",
              border: "none",
              borderRadius: "8px",
              fontFamily: "'Exo 2', sans-serif",
              fontWeight: 700,
              fontSize: "0.875rem",
              letterSpacing: "0.06em",
              textTransform: "uppercase",
              cursor: "pointer",
            }}
          >
            Refresh Page
          </button>
        </div>
      );
    }

    return this.props.children;
  }
}

"use client";

import { Component, type ReactNode } from "react";

interface Props {
  children: ReactNode;
  title?: string;
}

interface State {
  hasError: boolean;
}

export default class ChartErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError(): State {
    return { hasError: true };
  }

  componentDidCatch(error: Error) {
    console.error(`[ChartErrorBoundary${this.props.title ? `: ${this.props.title}` : ""}]`, error);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="panel" style={{ height: "100%" }}>
          {this.props.title && (
            <div className="panel-header">{this.props.title}</div>
          )}
          <div
            style={{
              height: this.props.title ? "calc(100% - 37px)" : "100%",
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              justifyContent: "center",
              gap: "8px",
              padding: "20px",
            }}
          >
            <div
              style={{
                fontFamily: "var(--font-mono)",
                fontSize: "10px",
                color: "var(--red)",
                letterSpacing: "0.08em",
              }}
            >
              RENDER ERROR
            </div>
            <div
              style={{
                fontFamily: "var(--font-mono)",
                fontSize: "9px",
                color: "var(--muted)",
                textAlign: "center",
                maxWidth: "240px",
                lineHeight: 1.6,
              }}
            >
              This panel failed to render. Data will reload on next refresh.
            </div>
            <button
              className="ghost-btn"
              style={{ marginTop: "4px" }}
              onClick={() => this.setState({ hasError: false })}
            >
              RETRY
            </button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}

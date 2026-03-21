"use client";

import { Component, type ReactNode } from "react";

interface Props {
  title: string;
  children: ReactNode;
}

interface State {
  hasError: boolean;
  error?: Error;
}

export default class ChartErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="panel" style={{ height: "100%" }}>
          <div className="panel-header">{this.props.title}</div>
          <div
            style={{
              padding: "12px",
              height: "calc(100% - 37px)",
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              justifyContent: "center",
              gap: "6px",
            }}
          >
            <span
              style={{
                fontFamily: "var(--font-mono)",
                fontSize: "9px",
                color: "var(--red, #ef4444)",
                letterSpacing: "0.1em",
              }}
            >
              RENDER ERROR
            </span>
            <span
              style={{
                fontFamily: "var(--font-mono)",
                fontSize: "8px",
                color: "var(--muted)",
                textAlign: "center",
                maxWidth: "200px",
              }}
            >
              {this.state.error?.message ?? "Unknown error"}
            </span>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}

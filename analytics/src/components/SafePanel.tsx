"use client";

import ChartErrorBoundary from "./ChartErrorBoundary";
import type { ReactNode } from "react";

interface Props {
  title: string;
  children: ReactNode;
}

export default function SafePanel({ title, children }: Props) {
  return (
    <ChartErrorBoundary title={title}>
      {children}
    </ChartErrorBoundary>
  );
}

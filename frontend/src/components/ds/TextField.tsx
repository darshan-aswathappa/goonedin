"use client";

import { useId } from "react";
import { cn } from "@/lib/utils";
import { Kicker } from "./Kicker";

interface BaseProps {
  label?: string;
  /** Trailing element on the label row — e.g. a "Load file" ghost button. */
  action?: React.ReactNode;
  hint?: string;
  error?: string;
}

type InputProps = BaseProps &
  React.ComponentProps<"input"> & { multiline?: false };
type TextareaProps = BaseProps &
  React.ComponentProps<"textarea"> & { multiline: true };

/**
 * Mono input on a card surface with a mono uppercase label — fields are
 * named after what they technically are, not a friendly paraphrase.
 */
export function TextField(props: InputProps | TextareaProps) {
  const { label, action, hint, error, className, id, ...rest } = props as BaseProps &
    React.ComponentProps<"input"> &
    React.ComponentProps<"textarea"> & { multiline?: boolean };
  const generatedId = useId();
  const fieldId = id ?? generatedId;
  const { multiline, ...fieldProps } = rest as typeof rest & { multiline?: boolean };

  const fieldClass = cn(
    "w-full rounded-[4px] border bg-paper-card px-4 py-3 font-mono text-[15px] text-ink outline-none transition-colors duration-[120ms] placeholder:text-ink-faint focus:border-brick disabled:opacity-50",
    error ? "border-brick" : "border-hairline",
    multiline && "resize-y",
    className
  );

  return (
    <div className="flex flex-col gap-2">
      {(label || action) && (
        <div className="flex items-center justify-between">
          {label && (
            <Kicker as="label" htmlFor={fieldId}>
              {label}
            </Kicker>
          )}
          {action}
        </div>
      )}
      {multiline ? (
        <textarea id={fieldId} className={fieldClass} {...fieldProps} />
      ) : (
        <input id={fieldId} className={fieldClass} {...fieldProps} />
      )}
      {error ? (
        <p className="font-mono text-[11px] uppercase tracking-[0.09em] text-brick">{error}</p>
      ) : (
        hint && <p className="font-sans text-[13px] text-ink-muted">{hint}</p>
      )}
    </div>
  );
}

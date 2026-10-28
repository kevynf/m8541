import type { ChangeEvent, FocusEvent } from "react";

type ProgressBarVariant = "fill" | "marker";

interface ProgressBarProps {
  value: number;
  max: number;
  testId: string;
  variant?: ProgressBarVariant;
  label?: string;
  valuetext?: string;
  disabled?: boolean;
  onFocus?: (event: FocusEvent<HTMLInputElement>) => void;
  onInput?: (value: number) => void;
  onChange?: (event: ChangeEvent<HTMLInputElement>) => void;
  onBlur?: (event: FocusEvent<HTMLInputElement>) => void;
}

export default function ProgressBar({
  value,
  max,
  testId,
  variant = "fill",
  label,
  valuetext,
  disabled = false,
  onFocus,
  onInput,
  onChange,
  onBlur,
}: ProgressBarProps) {
  const percent = max > 0 ? Math.min(100, (value * 100) / max) : 0;

  return (
    <div className="progress-bar" data-testid={`${testId}-bar`}>
      {variant === "marker" ? (
        <div
          className="progress-marker"
          data-testid={`${testId}-marker`}
          style={{ left: `${percent}%` }}
        />
      ) : (
        <div
          className="progress-fill"
          data-testid={`${testId}-fill`}
          style={{ width: `${percent}%` }}
        />
      )}
      {label ? (
        <input
          className="range-input"
          type="range"
          tabIndex={0}
          min="0"
          max={max}
          value={value}
          disabled={disabled}
          aria-label={label}
          aria-valuetext={valuetext}
          onFocus={onFocus}
          onInput={(event) => onInput?.(event.currentTarget.valueAsNumber)}
          onChange={onChange}
          onBlur={onBlur}
        />
      ) : null}
    </div>
  );
}

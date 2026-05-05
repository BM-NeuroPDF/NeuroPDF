'use client';

import * as React from 'react';
import { OTPInput, REGEXP_ONLY_DIGITS } from 'input-otp';

import { cn } from '@/lib/utils';

type InputOTP6Props = {
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
  'aria-label'?: string;
};

export function InputOTP6({ value, onChange, disabled, 'aria-label': ariaLabel }: InputOTP6Props) {
  return (
    <OTPInput
      value={value}
      onChange={onChange}
      maxLength={6}
      disabled={disabled}
      pattern={REGEXP_ONLY_DIGITS}
      inputMode="numeric"
      aria-label={ariaLabel}
      containerClassName="flex w-full flex-col items-center gap-3"
      // Avoid Tailwind `sr-only`: it clips the real OTP `<input>` and breaks focus/hit-target.
      // `input-otp` already positions a transparent, full-container overlay input.
      className="focus-visible:ring-0 focus-visible:outline-none"
      render={({ slots }) => (
        <div className="flex justify-center gap-2">
          {slots.map((slot, i) => (
            <div
              key={i}
              data-slot="input-otp-slot"
              data-testid={i === 0 ? 'otp-slot-0' : undefined}
              className={cn(
                'flex h-12 w-10 items-center justify-center rounded-lg border border-[var(--navbar-border)] bg-[var(--background)] text-lg font-semibold text-[var(--foreground)]',
                slot.isActive &&
                  'ring-2 ring-[var(--button-bg)] ring-offset-2 ring-offset-[var(--background)]',
              )}
            >
              {slot.char ?? '\u00a0'}
            </div>
          ))}
        </div>
      )}
    />
  );
}

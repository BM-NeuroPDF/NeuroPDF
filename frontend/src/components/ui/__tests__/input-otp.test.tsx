import React, { useState } from 'react';
import { describe, it, expect } from 'vitest';
import { render, fireEvent } from '@testing-library/react';
import { InputOTP6 } from '../input-otp';

function Harness(props: Partial<React.ComponentProps<typeof InputOTP6>>) {
  const [value, setValue] = useState('');
  return (
    <InputOTP6
      value={value}
      onChange={setValue}
      aria-label="Test OTP"
      {...props}
    />
  );
}

describe('InputOTP6', () => {
  it('keeps the real OTP input focusable (no sr-only clipping)', () => {
    const { container } = render(<Harness />);
    const input = container.querySelector(
      'input[data-input-otp]'
    ) as HTMLInputElement | null;
    expect(input).toBeTruthy();
    expect(input?.className ?? '').not.toMatch(/\bsr-only\b/);
  });

  it('accepts digit input via the OTP field', () => {
    const { container } = render(<Harness />);
    const input = container.querySelector(
      'input[data-input-otp]'
    ) as HTMLInputElement;
    fireEvent.change(input, { target: { value: '123456' } });
    expect(input.value).toBe('123456');
  });
});

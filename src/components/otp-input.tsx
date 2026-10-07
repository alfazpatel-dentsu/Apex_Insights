'use client';

import { useEffect, useRef } from 'react';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';

interface OtpInputProps {
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
  error?: string;
  autoFocus?: boolean;
}

export function OtpInput({ value, onChange, disabled = false, error, autoFocus = true }: OtpInputProps) {
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (autoFocus && inputRef.current) {
      inputRef.current.focus();
    }
  }, [autoFocus]);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const inputValue = e.target.value.replace(/\D/g, '').slice(0, 6);
    onChange(inputValue);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Backspace' && value.length === 0) {
      e.preventDefault();
    }
  };

  const handlePaste = (e: React.ClipboardEvent<HTMLInputElement>) => {
    e.preventDefault();
    const pastedText = e.clipboardData.getData('text').replace(/\D/g, '').slice(0, 6);
    onChange(pastedText);
  };

  return (
    <div className="space-y-3">
      <div className="flex justify-center gap-2">
        {[0, 1, 2, 3, 4, 5].map((index) => (
          <div
            key={index}
            className={cn(
              'w-12 h-12 flex items-center justify-center border-2 rounded-lg font-bold text-xl',
              value[index]
                ? 'border-primary bg-primary/5'
                : 'border-neutral-300 bg-white',
              error && 'border-destructive bg-destructive/5',
              disabled && 'opacity-50 cursor-not-allowed'
            )}
          >
            {value[index] || ''}
          </div>
        ))}
      </div>
      <input
        ref={inputRef}
        type="text"
        inputMode="numeric"
        value={value}
        onChange={handleChange}
        onKeyDown={handleKeyDown}
        onPaste={handlePaste}
        disabled={disabled}
        maxLength={6}
        className="sr-only"
        aria-label="One-time password"
      />
      {error && (
        <p className="text-sm text-destructive text-center font-medium">{error}</p>
      )}
    </div>
  );
}

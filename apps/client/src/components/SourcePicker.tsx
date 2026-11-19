import { useEffect, useId, useRef, useState } from 'react';
import { providerLabel } from './HotChartPanel';
import './source-picker.css';

export interface SourcePickerProps {
  providers: string[];
  selected: string[];
  onToggle: (id: string) => void;
}

function EmptySourceIcon() {
  return (
    <svg className="source-picker-empty-icon" viewBox="0 0 20 20" aria-hidden="true">
      <path d="M3.5 6h13M3.5 10h13M3.5 14h13" />
      <circle cx="7" cy="6" r="1.6" />
      <circle cx="13" cy="10" r="1.6" />
      <circle cx="8.5" cy="14" r="1.6" />
    </svg>
  );
}

function ChevronIcon() {
  return (
    <svg className="source-picker-chevron" viewBox="0 0 16 16" aria-hidden="true">
      <path d="M4.25 6.25 8 10l3.75-3.75" />
    </svg>
  );
}

function CheckIcon() {
  return (
    <svg className="source-picker-check-icon" viewBox="0 0 14 14" aria-hidden="true">
      <path d="M3.2 7.3 5.8 9.9 10.9 4.5" />
    </svg>
  );
}

function ProviderLogo({ id, size = 'md' }: { id: string; size?: 'sm' | 'md' }) {
  const cls = `source-provider-logo is-${size}`;
  if (id === 'netease') {
    return (
      <svg className={cls} viewBox="0 0 24 24" aria-hidden="true">
        <rect x="0" y="0" width="24" height="24" rx="6" fill="#e60026" stroke="none" />
        <path
          d="M8.5 9.8a4.7 4.7 0 1 0 7.1.3"
          fill="none"
          stroke="#fff"
          strokeWidth="1.65"
          strokeLinecap="round"
        />
        <circle
          cx="11.5"
          cy="13.1"
          r="1.65"
          fill="none"
          stroke="#fff"
          strokeWidth="1.65"
        />
        <path
          d="M13.1 12.9 13.9 7c.2-.9 1.3-1 2.3-.1"
          fill="none"
          stroke="#fff"
          strokeWidth="1.65"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    );
  }
  if (id === 'kugou') {
    return (
      <svg className={cls} viewBox="0 0 24 24" aria-hidden="true">
        <rect x="0" y="0" width="24" height="24" rx="6" fill="#0c81ff" stroke="none" />
        <circle
          cx="12"
          cy="12"
          r="7.2"
          fill="none"
          stroke="#fff"
          strokeWidth="1.55"
        />
        <path
          d="M9.6 8.3v7.4M14.4 8.5 10 12.1M11.4 11.1l3.3 4.6"
          fill="none"
          stroke="#fff"
          strokeWidth="1.7"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    );
  }
  if (id === 'bilibili') {
    return (
      <svg className={cls} viewBox="0 0 24 24" aria-hidden="true">
        <rect x="0" y="0" width="24" height="24" rx="6" fill="#fb7299" stroke="none" />
        <rect
          x="5.2"
          y="8.4"
          width="13.6"
          height="9.8"
          rx="2.6"
          fill="none"
          stroke="#fff"
          strokeWidth="1.6"
        />
        <path
          d="M8.8 5.6 10.8 8.2M15.2 5.6 13.2 8.2M9.4 12.1v2M14.6 12.1v2"
          fill="none"
          stroke="#fff"
          strokeWidth="1.65"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    );
  }
  return (
    <span className={`${cls} source-provider-fallback`} aria-hidden="true">
      {providerLabel(id).slice(0, 1)}
    </span>
  );
}

export default function SourcePicker({ providers, selected, onToggle }: SourcePickerProps) {
  const [open, setOpen] = useState(false);
  const id = useId();
  const root = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) return;
    const closeOutside = (event: PointerEvent) => {
      if (event.target instanceof Node && !root.current?.contains(event.target)) setOpen(false);
    };
    document.addEventListener('pointerdown', closeOutside);
    return () => document.removeEventListener('pointerdown', closeOutside);
  }, [open]);

  if (providers.length === 0) return null;

  const activeProviders = providers.filter((provider) => selected.includes(provider));
  const summaryTitle = activeProviders.length > 0
    ? `当前音源：${activeProviders.map(providerLabel).join('、')}`
    : '未选择音源，点击选择';

  return (
    <div
      className="source-picker"
      ref={root}
      onBlur={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget)) setOpen(false);
      }}
      onKeyDown={(event) => {
        if (event.key !== 'Escape' || !open) return;
        event.stopPropagation();
        setOpen(false);
        trigger.current?.focus();
      }}
    >
      <button
        ref={trigger}
        type="button"
        className={`source-picker-trigger${activeProviders.length === 0 ? ' is-empty' : ''}`}
        aria-label="选择音源"
        title={summaryTitle}
        aria-expanded={open}
        aria-controls={id}
        onClick={() => setOpen((value) => !value)}
      >
        {activeProviders.length > 0 ? (
          <span className="source-picker-stack" aria-hidden="true">
            {activeProviders.map((provider) => (
              <span className="source-picker-badge" key={provider}>
                <ProviderLogo id={provider} size="sm" />
              </span>
            ))}
          </span>
        ) : (
          <EmptySourceIcon />
        )}
        <ChevronIcon />
      </button>

      <div
        id={id}
        className={`source-picker-popover${open ? ' is-open' : ''}`}
        role="group"
        aria-label="音源，可多选"
        hidden={!open}
      >
        <div className="source-picker-header" aria-hidden="true">
          <span>搜索音源</span>
          <span className="source-picker-count">
            {activeProviders.length}/{providers.length}
          </span>
        </div>
        <div className="source-picker-options">
          {providers.map((provider) => {
            const active = selected.includes(provider);
            const label = providerLabel(provider);
            return (
              <button
                key={provider}
                type="button"
                className="source-picker-option"
                aria-label={label}
                aria-pressed={active}
                onClick={() => onToggle(provider)}
              >
                <ProviderLogo id={provider} size="md" />
                <span className="source-picker-option-label">{label}</span>
                <span className="source-picker-check" aria-hidden="true">
                  {active && <CheckIcon />}
                </span>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}

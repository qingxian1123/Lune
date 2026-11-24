import { useEffect, useId, useRef, useState } from 'react';
import { providerLabel } from './HotChartPanel';
import neteaseIcon from './provider-icons/netease.png';
import kugouIcon from './provider-icons/kugou.png';
import './source-picker.css';

export interface SourcePickerProps {
  providers: string[];
  selected: string[];
  onToggle: (id: string) => void;
}

function ProviderLogo({ id }: { id: string }) {
  if (id === 'netease' || id === 'kugou') {
    return <img className="source-provider-logo" src={id === 'netease' ? neteaseIcon : kugouIcon} alt="" />;
  }
  if (id === 'bilibili') {
    return (
      <svg className="source-provider-logo source-provider-tv" viewBox="0 0 26 26" aria-hidden="true">
        <rect x="3.25" y="8.25" width="19.5" height="15.5" rx="5.75" />
        <path d="m8 4.25 3.5 3.3m6.5-3.3-3.5 3.3M9.75 14.9v2M16.25 14.9v2" />
      </svg>
    );
  }
  return (
    <span className="source-provider-logo source-provider-fallback" aria-hidden="true">
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
        className="source-picker-trigger"
        aria-label="选择音源"
        aria-expanded={open}
        aria-controls={id}
        onClick={() => setOpen((value) => !value)}
      >
        <svg className="source-picker-mark" viewBox="0 0 24 22" aria-hidden="true">
          <rect x="2" y="2.5" width="14" height="11" rx="3.3" opacity=".58" />
          <rect className="source-picker-front" x="8" y="8" width="14" height="11" rx="3.3" />
          <path d="M13.6 10.8v5.4l4.4-2.7z" />
        </svg>
      </button>

      <div
        id={id}
        className="source-picker-popover"
        role="group"
        aria-label="音源，可多选"
        hidden={!open}
      >
        {providers.map((provider) => (
          <button
            key={provider}
            type="button"
            className="source-picker-option"
            aria-label={providerLabel(provider)}
            aria-pressed={selected.includes(provider)}
            onClick={() => onToggle(provider)}
          >
            <ProviderLogo id={provider} />
          </button>
        ))}
      </div>
    </div>
  );
}

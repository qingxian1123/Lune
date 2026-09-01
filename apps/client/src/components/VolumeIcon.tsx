interface VolumeIconProps {
  volume: number;
  muted: boolean;
}

export default function VolumeIcon({ volume, muted }: VolumeIconProps) {
  const silent = muted || volume <= 0;
  const loud = volume >= 0.5;

  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <path
        d="M4 9.25h3.1L11.5 5.6v12.8l-4.4-3.65H4z"
        fill="currentColor"
        stroke="currentColor"
        strokeLinejoin="round"
        strokeWidth="1.35"
      />
      {silent ? (
        <path
          d="m15.5 9.5 4 5m0-5-4 5"
          fill="none"
          stroke="currentColor"
          strokeLinecap="round"
          strokeWidth="1.8"
        />
      ) : (
        <>
          <path
            d="M15.2 9.2a4.2 4.2 0 0 1 0 5.6"
            fill="none"
            stroke="currentColor"
            strokeLinecap="round"
            strokeWidth="1.7"
          />
          {loud && (
            <path
              d="M18 6.5a8.1 8.1 0 0 1 0 11"
              fill="none"
              stroke="currentColor"
              strokeLinecap="round"
              strokeWidth="1.7"
            />
          )}
        </>
      )}
    </svg>
  );
}

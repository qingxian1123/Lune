import { useId } from 'react';

// Keep the original offset silhouette; each light band has one clean cut.
const bands = [
  { cx: 252, cy: 264, rx: 226, ry: 226, cutCx: 292, cutCy: 226, cutRx: 188, cutRy: 201, fill: '#deddd7' },
  { cx: 272, cy: 254, rx: 174, ry: 190, cutCx: 241, cutCy: 275, cutRx: 143, cutRy: 158, fill: '#93928c' },
  { cx: 246, cy: 268, rx: 125, ry: 143, cutCx: 271, cutCy: 248, cutRx: 99, cutRy: 115, fill: '#deddd7' },
  { cx: 264, cy: 252, rx: 79, ry: 94, cutCx: 248, cutCy: 269, cutRx: 60, cutRy: 73, fill: '#5f5e58' },
];

export default function AbstractVinyl() {
  const id = useId().replace(/:/g, '');

  return (
    <div className="invite-turntable" aria-hidden="true">
      <svg className="invite-turntable-svg" viewBox="0 0 520 520" focusable="false">
        <defs>
          <clipPath id={`${id}-outer-opening`}>
            <ellipse
              cx={bands[0].cutCx} cy={bands[0].cutCy}
              rx={bands[0].cutRx} ry={bands[0].cutRy}
              transform={`rotate(24 ${bands[0].cutCx} ${bands[0].cutCy})`}
            />
          </clipPath>
          {bands.map((band, index) => (
            <mask key={index} id={`${id}-band-${index}`} maskUnits="userSpaceOnUse" x="0" y="0" width="520" height="520">
              <ellipse
                cx={band.cx} cy={band.cy} rx={band.rx} ry={band.ry}
                transform={`rotate(24 ${band.cx} ${band.cy})`} fill="white"
              />
              <ellipse
                cx={band.cutCx} cy={band.cutCy} rx={band.cutRx} ry={band.cutRy}
                transform={`rotate(24 ${band.cutCx} ${band.cutCy})`} fill="black"
              />
            </mask>
          ))}
        </defs>

        {bands.map((band, index) => (
          <rect
            key={index} width="520" height="520"
            fill={band.fill} mask={`url(#${id}-band-${index})`}
            clipPath={index === 1 ? `url(#${id}-outer-opening)` : undefined}
          />
        ))}
        <ellipse cx="248" cy="269" rx="25" ry="31" transform="rotate(24 248 269)" fill="#2c2c29" />
        <circle cx="248" cy="269" r="3.5" fill="#c4c3bb" />
      </svg>
    </div>
  );
}

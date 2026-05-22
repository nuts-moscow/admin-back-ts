/**
 * Line glyphs in current color. Ports the prototype's `Icon` set.
 * All icons accept `size` and `className` (color via `text-*`).
 */
import type { SVGProps } from 'react';

type Props = SVGProps<SVGSVGElement> & { size?: number };

function base({ size = 22, ...rest }: Props) {
  return {
    width: size,
    height: size,
    viewBox: '0 0 24 24',
    fill: 'none' as const,
    stroke: 'currentColor',
    strokeWidth: 1.6,
    strokeLinecap: 'round' as const,
    strokeLinejoin: 'round' as const,
    ...rest,
  };
}

export const HomeIcon = (p: Props) => (
  <svg {...base(p)}>
    <path d="M3 11l9-7 9 7v9a2 2 0 01-2 2h-4v-7h-6v7H5a2 2 0 01-2-2v-9z" />
  </svg>
);
export const CalendarIcon = (p: Props) => (
  <svg {...base(p)}>
    <rect x="3" y="5" width="18" height="16" rx="2" />
    <path d="M8 3v4M16 3v4M3 10h18" />
  </svg>
);
export const ForkIcon = (p: Props) => (
  <svg {...base(p)}>
    <path d="M7 2v8a3 3 0 006 0V2M10 13v9M17 2v13h3M17 2c0 4 3 4 3 9" />
  </svg>
);
export const TrophyIcon = (p: Props) => (
  <svg {...base(p)}>
    <path d="M7 4h10v5a5 5 0 01-10 0V4z" />
    <path d="M7 6H4v2a3 3 0 003 3M17 6h3v2a3 3 0 01-3 3M9 17h6M10 21h4M12 14v3" />
  </svg>
);
export const UserIcon = (p: Props) => (
  <svg {...base(p)}>
    <circle cx="12" cy="8" r="4" />
    <path d="M4 21c1-4 5-6 8-6s7 2 8 6" />
  </svg>
);
export const ChevRIcon = (p: Props) => (
  <svg {...base({ size: 14, ...p, strokeWidth: 2 })}>
    <path d="M9 6l6 6-6 6" />
  </svg>
);
export const ChevLIcon = (p: Props) => (
  <svg {...base({ size: 14, ...p, strokeWidth: 2 })}>
    <path d="M15 6l-6 6 6 6" />
  </svg>
);
export const ArrowUpIcon = (p: Props) => (
  <svg {...base({ size: 14, ...p, strokeWidth: 2 })}>
    <path d="M12 19V5M5 12l7-7 7 7" />
  </svg>
);
export const ArrowDownIcon = (p: Props) => (
  <svg {...base({ size: 14, ...p, strokeWidth: 2 })}>
    <path d="M12 5v14M5 12l7 7 7-7" />
  </svg>
);
export const UsersIcon = (p: Props) => (
  <svg {...base({ size: 18, ...p })}>
    <circle cx="9" cy="8" r="3" />
    <path d="M3 20c1-3 3-5 6-5s5 2 6 5" />
    <circle cx="17" cy="9" r="2.5" />
    <path d="M21 19c-.5-2-1.5-3-3-3.5" />
  </svg>
);
export const PauseIcon = (p: Props) => (
  <svg {...base({ size: 18, ...p, fill: 'currentColor', stroke: 'none' })}>
    <rect x="6" y="5" width="4" height="14" rx="1" />
    <rect x="14" y="5" width="4" height="14" rx="1" />
  </svg>
);
export const PlayIcon = (p: Props) => (
  <svg {...base({ size: 18, ...p, fill: 'currentColor', stroke: 'none' })}>
    <path d="M7 4l13 8-13 8V4z" />
  </svg>
);
export const QuestionIcon = (p: Props) => (
  <svg {...base(p)}>
    <circle cx="12" cy="12" r="9" />
    <path d="M9 9a3 3 0 116 0c0 2-3 2-3 4M12 17.5h.01" />
  </svg>
);
export const DocIcon = (p: Props) => (
  <svg {...base(p)}>
    <path d="M6 3h9l4 4v14a1 1 0 01-1 1H6a1 1 0 01-1-1V4a1 1 0 011-1z" />
    <path d="M14 3v5h5M8 13h8M8 17h6" />
  </svg>
);
export const SupportIcon = (p: Props) => (
  <svg {...base(p)}>
    <path d="M21 12a9 9 0 10-18 0v3a3 3 0 003 3h1v-7H4M21 12v3a3 3 0 01-3 3h-1v-7h3" />
  </svg>
);
export const BuildingIcon = (p: Props) => (
  <svg {...base(p)}>
    <path d="M4 21V6a1 1 0 011-1h5v16M14 21V11a1 1 0 011-1h5v11M4 21h16M8 9h2M8 13h2M8 17h2M16 14h2M16 18h2" />
  </svg>
);
export const MedalIcon = (p: Props) => (
  <svg {...base(p)}>
    <path d="M7 3l3 6M17 3l-3 6" />
    <circle cx="12" cy="15" r="6" />
    <path d="M9.5 14l1 2 3-3" />
  </svg>
);
export const EditIcon = (p: Props) => (
  <svg {...base({ size: 16, ...p })}>
    <path d="M3 21h4l11-11-4-4L3 17v4z" />
    <path d="M14 6l4 4" />
  </svg>
);
export const LogoutIcon = (p: Props) => (
  <svg {...base(p)}>
    <path d="M9 21H5a2 2 0 01-2-2V5a2 2 0 012-2h4" />
    <path d="M16 17l5-5-5-5M21 12H9" />
  </svg>
);

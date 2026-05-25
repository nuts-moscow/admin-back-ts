const PALETTE = ['#C9A877', '#A88B5A', '#8C6520', '#5C4A33', '#7A5236', '#9E7C42', '#B58A3C', '#6F5A3F'];

function pickColor(seed: string): string {
  let sum = 0;
  for (let i = 0; i < seed.length; i++) sum += seed.charCodeAt(i);
  return PALETTE[sum % PALETTE.length] ?? PALETTE[0]!;
}

function initials(name: string): string {
  return name
    .split(/\s+/)
    .map((s) => s[0])
    .filter(Boolean)
    .slice(0, 2)
    .join('')
    .toUpperCase();
}

interface AvatarProps {
  name: string;
  seed?: string;
  size?: number;
  ring?: boolean;
  className?: string;
}

export function Avatar({ name, seed, size = 40, ring = false, className }: AvatarProps) {
  const bg = pickColor(seed ?? name);
  const fontSize = size * 0.42;
  return (
    <div
      className={className}
      style={{
        width: size,
        height: size,
        borderRadius: '50%',
        background: bg,
        color: 'var(--paper)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        fontFamily: 'var(--font-sans), system-ui, sans-serif',
        fontWeight: 600,
        fontSize,
        flexShrink: 0,
        boxShadow: ring
          ? '0 0 0 2px var(--paper), 0 0 0 4px var(--gold)'
          : 'inset 0 0 0 1px rgba(0,0,0,0.08)',
        letterSpacing: 0.5,
      }}
    >
      {initials(name) || '?'}
    </div>
  );
}

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
  /**
   * The published avatar's address, from the payload that already carries the
   * nickname. Absent or null means initials — including while a replacement is
   * waiting for an admin, because the payload never carries waiting pictures.
   */
  src?: string | null;
}

export function Avatar({ name, seed, size = 40, ring = false, className, src }: AvatarProps) {
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
        overflow: 'hidden',
        boxShadow: ring
          ? '0 0 0 2px var(--paper), 0 0 0 4px var(--gold)'
          : 'inset 0 0 0 1px rgba(0,0,0,0.08)',
        letterSpacing: 0.5,
      }}
    >
      {src ? (
        // The address is derived from the picture's content, so what lives at it
        // never changes and the browser may cache it; how long is the backend's
        // call, and it is bounded so a takedown reaches screens on its own.
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={src}
          alt={name}
          width={size}
          height={size}
          style={{ width: '100%', height: '100%', objectFit: 'cover' }}
        />
      ) : (
        initials(name) || '?'
      )}
    </div>
  );
}

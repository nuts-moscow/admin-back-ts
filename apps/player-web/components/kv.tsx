/** Label/value pair used across cards. Label is uppercased and small; value is mono. */
export function KV({
  k,
  v,
  primary = false,
}: {
  k: string;
  v: React.ReactNode;
  primary?: boolean;
}) {
  return (
    <div>
      <div
        className="text-[9px] uppercase font-bold"
        style={{
          letterSpacing: 0.6,
          color: primary ? 'rgba(251,245,233,0.5)' : 'var(--ink-3)',
        }}
      >
        {k}
      </div>
      <div
        className="mono mt-0.5"
        style={{
          fontSize: 13,
          fontWeight: 600,
          color: primary ? 'var(--paper)' : 'var(--ink)',
        }}
      >
        {v}
      </div>
    </div>
  );
}

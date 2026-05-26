'use client';

import { TabBar } from '@/components/tab-bar';
import { usePlayerSession } from '@/lib/auth';

export default function AppLayout({ children }: { children: React.ReactNode }) {
  const { status } = usePlayerSession();
  return (
    <div className="h-[100dvh] w-full max-w-md mx-auto relative overflow-hidden bg-bg">
      {status === 'ready' ? children : null}
      <TabBar />
    </div>
  );
}

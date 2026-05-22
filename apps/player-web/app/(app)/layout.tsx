import { TabBar } from '@/components/tab-bar';
import { requirePlayerSession } from '@/lib/auth';

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  await requirePlayerSession();
  return (
    <div className="h-[100dvh] w-full max-w-md mx-auto relative overflow-hidden bg-bg">
      {children}
      <TabBar />
    </div>
  );
}

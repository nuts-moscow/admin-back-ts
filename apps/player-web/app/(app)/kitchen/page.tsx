import { requirePlayerSession } from '@/lib/auth';
import { KitchenScreen } from './kitchen-screen';

export const dynamic = 'force-dynamic';

export default async function KitchenPage() {
  await requirePlayerSession();
  return <KitchenScreen />;
}

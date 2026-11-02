import { StatsView } from '@/components/stats/StatsView';
import { TopBar } from '@/components/TopBar';
import { t } from '@/i18n';

export default function StatsPage() {
  return (
    <main className="page">
      <TopBar title={t('stats.title')} />
      <StatsView />
    </main>
  );
}

import { useTranslation } from 'react-i18next';
import { Badge, Card, Spinner, type BadgeTone } from '../../components/ui';
import { useHealth } from './useHealth';

type State = 'checking' | 'ok' | 'degraded' | 'down';

const badge: Record<Exclude<State, 'checking'>, { tone: BadgeTone; key: string }> = {
  ok: { tone: 'success', key: 'status.badgeOk' },
  degraded: { tone: 'warning', key: 'status.badgeDegraded' },
  down: { tone: 'danger', key: 'status.badgeDown' },
};

export function ApiStatusCard() {
  const { t } = useTranslation('dashboard');
  const { data, isPending, isError } = useHealth();
  const state: State = isPending ? 'checking' : isError ? 'down' : (data?.status ?? 'down');

  return (
    <Card
      title={t('status.title')}
      actions={
        state === 'checking' ? (
          <Spinner size="sm" label={t('status.checking')} />
        ) : (
          <Badge tone={badge[state].tone}>{t(badge[state].key)}</Badge>
        )
      }
    >
      <p className="text-sm text-slate-700" data-testid="api-status">
        {t(`status.${state}`)}
      </p>
    </Card>
  );
}

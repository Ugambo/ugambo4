'use client';

import { useResource } from '@rideswithme/web-core/client';
import { ErrorState, Loading } from '@/components/states';
import { api } from '@/lib/api';
import { useI18n } from '@/lib/i18n';

/** What each role may do. Roles are granted to people on their user page. */
export default function RolesPage() {
  const { t } = useI18n();
  const roles = useResource(() => api().admin.listRoles(), []);
  if (roles.loading && !roles.data) return <Loading />;
  if (roles.error) return <ErrorState error={roles.error} onRetry={() => void roles.reload()} />;
  return (
    <>
      <div className="page-header">
        <h1>{t('roles.title')}</h1>
      </div>
      <div className="charts">
        {roles.data!.map((r) => (
          <section key={r.key} className="card" data-testid={`role-${r.key}`}>
            <h2>{t(`role.${r.key}`)}</h2>
            <p className="small muted">{r.description}</p>
            {r.requiresMfa && <span className="pill pill-wait">{t('roles.mfa')}</span>}
            <h3>{t('roles.permissions')}</h3>
            <ul className="small">
              {r.permissions.map((p) => (
                <li key={p}>
                  <code>{p}</code>
                </li>
              ))}
            </ul>
          </section>
        ))}
      </div>
    </>
  );
}

import Link from 'next/link';
import type { ReactNode } from 'react';
import { t } from '@/i18n';

/** Barra superior con botón de volver, título y acciones opcionales a la derecha. */
export function TopBar({
  title,
  back = '/',
  children,
}: {
  title: ReactNode;
  back?: string;
  children?: ReactNode;
}) {
  return (
    <div className="topbar">
      <Link href={back} className="btn btn-link">
        ← {t('back')}
      </Link>
      <h1>{title}</h1>
      {children && <div className="topbar-actions">{children}</div>}
    </div>
  );
}

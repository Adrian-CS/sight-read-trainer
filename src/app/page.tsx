import Link from 'next/link';
import { t, type MessageKey } from '@/i18n';
import styles from './home.module.css';

type Entry = { href?: string; title: MessageKey; hint: MessageKey };

const ENTRIES: Entry[] = [
  { href: '/diagnostico/', title: 'home.diagnostics', hint: 'home.diagnosticsHint' },
  { title: 'home.library', hint: 'home.libraryHint' },
  { title: 'home.practice', hint: 'home.practiceHint' },
  { title: 'home.course', hint: 'home.courseHint' },
];

export default function Home() {
  return (
    <main className="page">
      <header className={styles.hero}>
        <h1>{t('appName')}</h1>
        <p className="muted">{t('appTagline')}</p>
      </header>
      <nav className={styles.grid}>
        {ENTRIES.map((entry) => {
          const body = (
            <>
              <strong>{t(entry.title)}</strong>
              <span className="muted">{entry.href ? t(entry.hint) : t('comingSoon')}</span>
            </>
          );
          return entry.href ? (
            <Link key={entry.title} href={entry.href} className={`card ${styles.tile}`}>
              {body}
            </Link>
          ) : (
            <div
              key={entry.title}
              className={`card ${styles.tile} ${styles.disabled}`}
              aria-disabled
            >
              {body}
            </div>
          );
        })}
      </nav>
    </main>
  );
}

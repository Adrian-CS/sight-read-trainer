'use client';

import Link from 'next/link';
import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react';
import { ensureSamples, importScoreFile, renamePiece } from '@/core/library/library';
import { getRepository } from '@/core/storage/client';
import type { Piece } from '@/core/storage/types';
import { t } from '@/i18n';
import styles from './LibraryView.module.css';

type Status = { kind: 'ok' | 'error' | 'busy'; text: string } | null;

export function LibraryView() {
  const [pieces, setPieces] = useState<Piece[] | null>(null);
  const [status, setStatus] = useState<Status>(null);
  const [editing, setEditing] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const reload = useCallback(async () => {
    setPieces(await getRepository().listPieces());
  }, []);

  useEffect(() => {
    void ensureSamples(getRepository()).then(reload);
  }, [reload]);

  const onFiles = async (files: FileList | null) => {
    if (!files?.length) return;
    setStatus({ kind: 'busy', text: t('library.importing') });
    const messages: Status[] = [];
    for (const file of Array.from(files)) {
      try {
        const piece = await importScoreFile(getRepository(), file);
        messages.push({ kind: 'ok', text: t('library.imported', { title: piece.title }) });
      } catch (err) {
        messages.push({
          kind: 'error',
          text: t('library.importError', { name: file.name, message: (err as Error).message }),
        });
      }
    }
    if (fileRef.current) fileRef.current.value = '';
    const error = messages.find((m) => m?.kind === 'error');
    setStatus(error ?? messages[messages.length - 1]);
    await reload();
  };

  const onRename = async (e: FormEvent<HTMLFormElement>, id: string) => {
    e.preventDefault();
    const title = new FormData(e.currentTarget).get('title');
    await renamePiece(getRepository(), id, String(title ?? ''));
    setEditing(null);
    await reload();
  };

  const onDelete = async (piece: Piece) => {
    if (!window.confirm(t('library.confirmDelete', { title: piece.title }))) return;
    await getRepository().deletePiece(piece.id);
    await reload();
  };

  return (
    <>
      <section className={`card ${styles.import}`}>
        {/* Sin "accept": Android filtra los .mxl porque no reconoce su tipo MIME. */}
        <input
          ref={fileRef}
          type="file"
          multiple
          hidden
          onChange={(e) => void onFiles(e.target.files)}
        />
        <button
          type="button"
          className="btn btn-primary"
          disabled={status?.kind === 'busy'}
          onClick={() => fileRef.current?.click()}
        >
          {t('library.import')}
        </button>
        <span className="muted">{t('library.importHint')}</span>
        {status && (
          <p
            role="status"
            className={
              status.kind === 'error'
                ? 'status-error'
                : status.kind === 'ok'
                  ? 'status-ok'
                  : 'muted'
            }
          >
            {status.text}
          </p>
        )}
      </section>

      {pieces?.length === 0 && <p className="muted">{t('library.empty')}</p>}
      <ul className={styles.list}>
        {pieces?.map((piece) => (
          <li key={piece.id} className={`card ${styles.item}`}>
            {editing === piece.id ? (
              <form className={styles.rename} onSubmit={(e) => void onRename(e, piece.id)}>
                <input
                  name="title"
                  className="input"
                  defaultValue={piece.title}
                  aria-label={t('library.newTitle')}
                  autoFocus
                />
                <button type="submit" className="btn btn-primary">
                  {t('library.save')}
                </button>
                <button type="button" className="btn" onClick={() => setEditing(null)}>
                  {t('library.cancel')}
                </button>
              </form>
            ) : (
              <>
                <Link href={`/pieza/?id=${encodeURIComponent(piece.id)}`} className={styles.info}>
                  <strong>{piece.title}</strong>
                  <span className="muted">
                    {[
                      piece.composer,
                      piece.measureCount
                        ? t('library.measures', { count: piece.measureCount })
                        : null,
                      piece.sampleId
                        ? t('library.sample')
                        : new Date(piece.createdAt).toLocaleDateString('es'),
                    ]
                      .filter(Boolean)
                      .join(' · ')}
                  </span>
                </Link>
                <div className={styles.actions}>
                  <Link
                    href={`/pieza/?id=${encodeURIComponent(piece.id)}`}
                    className="btn btn-primary btn-link"
                  >
                    {t('library.open')}
                  </Link>
                  <button type="button" className="btn" onClick={() => setEditing(piece.id)}>
                    {t('library.rename')}
                  </button>
                  <button
                    type="button"
                    className="btn btn-danger"
                    onClick={() => void onDelete(piece)}
                  >
                    {t('library.delete')}
                  </button>
                </div>
              </>
            )}
          </li>
        ))}
      </ul>
    </>
  );
}

'use client';

import { useSearchParams } from 'next/navigation';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { browserXmlParser, pieceText } from '@/core/library/library';
import { parseScore } from '@/core/score/parseScore';
import type { ScoreModel } from '@/core/score/model';
import { getRepository } from '@/core/storage/client';
import type { Piece } from '@/core/storage/types';
import { defaultSync, formatMs, times } from '@/core/sync/sync';
import { t } from '@/i18n';
import { MeasureGrid } from './MeasureGrid';
import { ScoreView, type MeasureLabel, type ScoreViewHandle } from './ScoreView';
import { SegmentedControl } from './SegmentedControl';
import { TopBar } from './TopBar';
import styles from './PieceView.module.css';

type Mode = 'score' | 'measures';
const MODE_KEY = 'sightread:viewMode';
const ZOOM_STEPS = [0.6, 0.75, 0.9, 1, 1.15, 1.3, 1.5, 1.75];

function readMode(): Mode {
  try {
    return localStorage.getItem(MODE_KEY) === 'measures' ? 'measures' : 'score';
  } catch {
    return 'score';
  }
}

type Loaded = { piece: Piece; xml: string; score: ScoreModel };

export function PieceView() {
  const id = useSearchParams().get('id');
  const [data, setData] = useState<Loaded | null | 'missing'>(null);
  const [error, setError] = useState<string | null>(null);
  const [mode, setMode] = useState<Mode>('score');
  const [zoomIndex, setZoomIndex] = useState(ZOOM_STEPS.indexOf(1));
  const [current, setCurrent] = useState(0);
  const scoreRef = useRef<ScoreViewHandle>(null);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- preferencia guardada en el navegador
    setMode(readMode());
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const piece = id ? await getRepository().getPiece(id) : undefined;
      if (cancelled) return;
      if (!piece) return setData('missing');
      const xml = await pieceText(piece);
      const score = parseScore(browserXmlParser(xml));
      if (!cancelled) setData({ piece, xml, score });
    })().catch((err: Error) => setError(err.message));
    return () => {
      cancelled = true;
    };
  }, [id]);

  const labels = useMemo<MeasureLabel[]>(() => {
    if (!data || data === 'missing') return [];
    const { piece, score } = data;
    const first = score.measures[0];
    const sync =
      piece.sync ??
      defaultSync({ tempo: score.tempo, beats: first?.beats ?? 4, beatType: first?.beatType ?? 4 });
    const starts = times(sync, score.measures.length);
    return score.measures.map((m, i) => ({
      number: m.number,
      time: formatMs(starts[i]),
      manual: sync.marks[i] !== undefined,
    }));
  }, [data]);

  const changeMode = (next: Mode) => {
    setMode(next);
    try {
      localStorage.setItem(MODE_KEY, next);
    } catch {
      // Sin almacenamiento (modo privado): solo se pierde la preferencia.
    }
  };

  const selectMeasure = useCallback((index: number) => {
    setCurrent(index);
    scoreRef.current?.toMeasure(index);
  }, []);

  if (error) {
    return (
      <Shell title="">
        <p className="status-error">{t('piece.renderError', { message: error })}</p>
      </Shell>
    );
  }
  if (data === 'missing') {
    return (
      <Shell title="">
        <p className="notice">{t('piece.notFound')}</p>
      </Shell>
    );
  }
  if (!data) {
    return (
      <Shell title="">
        <p className="muted">{t('piece.loading')}</p>
      </Shell>
    );
  }

  const total = data.score.measures.length;

  return (
    <main className={`page ${styles.page}`}>
      <TopBar title={data.piece.title} back="/biblioteca/">
        <SegmentedControl
          label={t('piece.mode')}
          value={mode}
          onChange={changeMode}
          options={[
            { value: 'score', label: t('piece.mode.score') },
            { value: 'measures', label: t('piece.mode.measures') },
          ]}
        />
      </TopBar>

      <div className={styles.toolbar}>
        <button
          type="button"
          className="btn btn-icon"
          aria-label={t('piece.prevNote')}
          onClick={() => scoreRef.current?.previous()}
        >
          ◀
        </button>
        <button
          type="button"
          className="btn btn-icon"
          aria-label={t('piece.nextNote')}
          onClick={() => scoreRef.current?.next()}
        >
          ▶
        </button>
        <span className={styles.position}>
          {t('piece.measureOf', { n: labels[current]?.number ?? current + 1, total })}
          <span className="muted"> · {labels[current]?.time}</span>
          {data.score.tempo && (
            <span className="muted"> · {t('piece.tempo', { bpm: data.score.tempo })}</span>
          )}
        </span>
        {mode === 'score' && (
          <span className={styles.zoom}>
            <button
              type="button"
              className="btn btn-icon"
              aria-label={t('piece.zoomOut')}
              disabled={zoomIndex === 0}
              onClick={() => setZoomIndex((z) => Math.max(0, z - 1))}
            >
              −
            </button>
            <span className="muted">{Math.round(ZOOM_STEPS[zoomIndex] * 100)} %</span>
            <button
              type="button"
              className="btn btn-icon"
              aria-label={t('piece.zoomIn')}
              disabled={zoomIndex === ZOOM_STEPS.length - 1}
              onClick={() => setZoomIndex((z) => Math.min(ZOOM_STEPS.length - 1, z + 1))}
            >
              +
            </button>
          </span>
        )}
      </div>

      {/* Las dos vistas siguen montadas: cambiar de modo no pierde cursor ni maquetación. */}
      <ScoreView
        key={data.piece.id}
        ref={scoreRef}
        xml={data.xml}
        visible={mode === 'score'}
        zoom={ZOOM_STEPS[zoomIndex]}
        currentMeasure={current}
        labels={labels}
        onSelectMeasure={selectMeasure}
        onCursorMeasure={setCurrent}
      />
      <MeasureGrid
        score={data.score}
        labels={labels}
        currentMeasure={current}
        visible={mode === 'measures'}
        onSelectMeasure={selectMeasure}
      />
    </main>
  );
}

function Shell({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <main className="page">
      <TopBar title={title} back="/biblioteca/" />
      {children}
    </main>
  );
}

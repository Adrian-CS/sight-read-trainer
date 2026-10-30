'use client';

import { useSearchParams } from 'next/navigation';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { browserXmlParser, ensureSamples, pieceText } from '@/core/library/library';
import { parseScore } from '@/core/score/parseScore';
import type { ScoreModel } from '@/core/score/model';
import { getRepository } from '@/core/storage/client';
import type { Piece } from '@/core/storage/types';
import type { Range } from '@/core/practice';
import { defaultSync, formatMs, times } from '@/core/sync/sync';
import type { Hand } from '@/core/storage/types';
import { t } from '@/i18n';
import { Keyboard } from './Keyboard';
import { MeasureGrid } from './MeasureGrid';
import { PracticeBar } from './practice/PracticeBar';
import { usePractice, type PracticeMode } from './practice/usePractice';
import { ScoreView, type MeasureLabel, type ScoreViewHandle } from './ScoreView';
import { SegmentedControl } from './SegmentedControl';
import { TopBar } from './TopBar';
import styles from './PieceView.module.css';

type Mode = 'score' | 'measures';
const MODE_KEY = 'sightread:viewMode';
const KEYBOARD_KEY = 'sightread:showKeyboard';
const PRACTICE_MODE_KEY = 'sightread:practiceMode';
const ZOOM_STEPS = [0.6, 0.75, 0.9, 1, 1.15, 1.3, 1.5, 1.75];

function readLocal(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

function writeLocal(key: string, value: string): void {
  try {
    localStorage.setItem(key, value);
  } catch {
    // Sin almacenamiento (modo privado): solo se pierde la preferencia.
  }
}

type Loaded = { piece: Piece; xml: string; score: ScoreModel };

const EMPTY_SCORE: ScoreModel = { title: '', composer: '', staves: [], measures: [], tempo: null };

export function PieceView() {
  const id = useSearchParams().get('id');
  const [data, setData] = useState<Loaded | null | 'missing'>(null);
  const [error, setError] = useState<string | null>(null);
  const [mode, setMode] = useState<Mode>('score');
  const [zoomIndex, setZoomIndex] = useState(ZOOM_STEPS.indexOf(1));
  const [current, setCurrent] = useState(0);
  const scoreRef = useRef<ScoreViewHandle>(null);

  const [practiceMode, setPracticeMode] = useState<PracticeMode>('wait');
  const [hand, setHand] = useState<Hand>('both');
  const [bpm, setBpm] = useState(100);
  const [chordWindowMs, setChordWindowMs] = useState(150);
  const [toleranceMs, setToleranceMs] = useState(150);
  const [loop, setLoop] = useState<Range | null>(null);
  const [showKeyboard, setShowKeyboard] = useState(false);

  useEffect(() => {
    /* eslint-disable react-hooks/set-state-in-effect -- preferencias guardadas en el navegador */
    setMode(readLocal(MODE_KEY) === 'measures' ? 'measures' : 'score');
    setShowKeyboard(readLocal(KEYBOARD_KEY) === '1');
    setPracticeMode(readLocal(PRACTICE_MODE_KEY) === 'tempo' ? 'tempo' : 'wait');
    /* eslint-enable react-hooks/set-state-in-effect */
    void getRepository()
      .getSettings()
      .then((settings) => {
        setChordWindowMs(settings.chordWindowMs);
        setToleranceMs(settings.tempoToleranceMs);
      });
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const repo = getRepository();
      let piece = id ? await repo.getPiece(id) : undefined;
      // Enlace directo a un ejemplo antes de haber abierto la biblioteca.
      if (!piece && id?.startsWith('sample-')) {
        await ensureSamples(repo);
        piece = await repo.getPiece(id);
      }
      if (cancelled) return;
      if (!piece) return setData('missing');
      const xml = await pieceText(piece);
      const score = parseScore(browserXmlParser(xml));
      if (cancelled) return;
      setData({ piece, xml, score });
      setHand(piece.hand);
      setBpm(piece.practiceBpm ?? score.tempo ?? 80);
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
    writeLocal(MODE_KEY, next);
  };

  const loaded = data && data !== 'missing' ? data : null;
  const practice = usePractice({
    pieceId: loaded?.piece.id ?? '',
    score: loaded?.score ?? EMPTY_SCORE,
    scoreRef,
    mode: practiceMode,
    hand,
    bpm,
    chordWindowMs,
    toleranceMs,
    loop,
    onMeasure: setCurrent,
  });
  const practicing = practice.status === 'running' || practice.status === 'countin';
  const { setStartMeasure } = practice;

  useEffect(() => setStartMeasure(current), [current, setStartMeasure]);

  const selectMeasure = useCallback(
    (index: number) => {
      if (practicing) return; // durante la práctica manda el motor
      setCurrent(index);
      scoreRef.current?.toMeasure(index);
    },
    [practicing],
  );

  /** Guarda un cambio en la pieza (mano o tempo por defecto). */
  const updatePiece = (patch: { hand?: Hand; practiceBpm?: number }) => {
    if (!loaded) return;
    const piece = { ...loaded.piece, ...patch };
    setData({ ...loaded, piece });
    void getRepository().savePiece(piece);
  };

  const setLoopEdge = (edge: 'from' | 'to') => {
    setLoop((prev) => {
      const from = edge === 'from' ? current : (prev?.from ?? 0);
      const to = edge === 'to' ? current : (prev?.to ?? current);
      return { from: Math.min(from, to), to: Math.max(from, to) };
    });
  };

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
    <main className={`page ${styles.page} ${showKeyboard ? styles.withKeyboard : ''}`}>
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

      <div className={styles.sticky}>
        <div className={styles.toolbar}>
          <button
            type="button"
            className="btn btn-icon"
            aria-label={t('piece.prevNote')}
            disabled={practicing}
            onClick={() => scoreRef.current?.previous()}
          >
            ◀
          </button>
          <button
            type="button"
            className="btn btn-icon"
            aria-label={t('piece.nextNote')}
            disabled={practicing}
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

        <PracticeBar
          status={practice.status}
          feedback={practice.feedback}
          counters={practice.counters}
          countIn={practice.countIn}
          mode={practiceMode}
          hand={hand}
          bpm={bpm}
          toleranceMs={toleranceMs}
          chordWindowMs={chordWindowMs}
          loop={loop}
          measureLabel={(i) => labels[i]?.number ?? String(i + 1)}
          showKeyboard={showKeyboard}
          onStart={practice.start}
          onStop={practice.stop}
          onMode={(m) => {
            setPracticeMode(m);
            writeLocal(PRACTICE_MODE_KEY, m);
          }}
          onHand={(h) => {
            setHand(h);
            updatePiece({ hand: h });
          }}
          onBpm={(b) => {
            setBpm(b);
            updatePiece({ practiceBpm: b });
          }}
          onTolerance={(ms) => {
            setToleranceMs(ms);
            void getRepository().updateSettings({ tempoToleranceMs: ms });
          }}
          onChordWindow={(ms) => {
            setChordWindowMs(ms);
            void getRepository().updateSettings({ chordWindowMs: ms });
          }}
          onLoopStart={() => setLoopEdge('from')}
          onLoopEnd={() => setLoopEdge('to')}
          onLoopClear={() => setLoop(null)}
          onToggleKeyboard={() => {
            setShowKeyboard((v) => {
              writeLocal(KEYBOARD_KEY, v ? '0' : '1');
              return !v;
            });
          }}
        />
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
        loop={loop}
        onSelectMeasure={selectMeasure}
        onCursorMeasure={setCurrent}
      />
      <MeasureGrid
        score={data.score}
        labels={labels}
        currentMeasure={current}
        visible={mode === 'measures'}
        loop={loop}
        onSelectMeasure={selectMeasure}
      />

      {showKeyboard && (
        <div className={styles.keyboard}>
          <Keyboard from={43} to={79} />
        </div>
      )}
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

'use client';

import { useCallback, useEffect, useImperativeHandle, useRef, useState, type Ref } from 'react';
import type { OpenSheetMusicDisplay } from 'opensheetmusicdisplay';
import { t } from '@/i18n';
import styles from './ScoreView.module.css';

export type ScoreViewHandle = {
  next(): void;
  previous(): void;
  toMeasure(index: number): void;
};

export type MeasureLabel = { number: string; time: string; manual: boolean };

type Box = { left: number; top: number; width: number; height: number };

type Props = {
  ref?: Ref<ScoreViewHandle>;
  xml: string;
  /** Si está oculta no se vuelve a maquetar (OSMD necesita un ancho real). */
  visible: boolean;
  /** Multiplicador del usuario sobre el zoom automático. */
  zoom: number;
  currentMeasure: number;
  labels: MeasureLabel[];
  onSelectMeasure(index: number): void;
  onCursorMeasure(index: number): void;
};

/** Zoom según el ancho: ~1,1 en una tablet horizontal; sin bajar de 0,8 para que se lea bien. */
export function autoZoom(width: number): number {
  return Math.min(1.4, Math.max(0.8, width / 1100));
}

/** Caja de cada compás (todos sus pentagramas) en píxeles relativos al contenedor. */
function measureBoxes(osmd: OpenSheetMusicDisplay, host: HTMLElement): Box[] {
  const svg = host.querySelector('svg');
  if (!svg) return [];
  const hostRect = host.getBoundingClientRect();
  const svgRect = svg.getBoundingClientRect();
  const unit = 10 * osmd.zoom;
  const staffHeight = osmd.EngravingRules.StaffHeight ?? 4;
  return osmd.GraphicSheet.MeasureList.map((staffMeasures) => {
    let x0 = Infinity;
    let y0 = Infinity;
    let x1 = -Infinity;
    let y1 = -Infinity;
    for (const gm of staffMeasures) {
      if (!gm) continue;
      const { AbsolutePosition: p, Size: s } = gm.PositionAndShape;
      x0 = Math.min(x0, p.x);
      x1 = Math.max(x1, p.x + s.width);
      y0 = Math.min(y0, p.y);
      y1 = Math.max(y1, p.y + staffHeight);
    }
    if (!Number.isFinite(x0)) return { left: 0, top: 0, width: 0, height: 0 };
    const pad = 1.2; // unidades por encima y por debajo de los pentagramas
    return {
      left: svgRect.left - hostRect.left + x0 * unit,
      top: svgRect.top - hostRect.top + (y0 - pad) * unit,
      width: (x1 - x0) * unit,
      height: (y1 - y0 + 2 * pad) * unit,
    };
  });
}

export function ScoreView({
  ref,
  xml,
  visible,
  zoom,
  currentMeasure,
  labels,
  onSelectMeasure,
  onCursorMeasure,
}: Props) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const hostRef = useRef<HTMLDivElement>(null);
  const osmdRef = useRef<OpenSheetMusicDisplay | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [boxes, setBoxes] = useState<Box[]>([]);
  const rendered = useRef({ width: 0, zoom: 0 });
  /** Posición del cursor como instante absoluto, para restaurarla tras volver a maquetar. */
  const cursorTime = useRef(0);
  const callbacks = useRef({ onCursorMeasure });
  useEffect(() => {
    callbacks.current = { onCursorMeasure };
  });

  // Cargar OSMD de forma diferida (es pesado) y parsear la partitura.
  useEffect(() => {
    // Cambiar de partitura = volver a montar el componente (key), así que no hace falta reiniciar el estado.
    let cancelled = false;
    (async () => {
      const { OpenSheetMusicDisplay } = await import('opensheetmusicdisplay');
      if (cancelled || !hostRef.current) return;
      const osmd = new OpenSheetMusicDisplay(hostRef.current, {
        autoResize: false,
        backend: 'svg',
        drawTitle: true,
        drawSubtitle: false,
        drawComposer: false, // ya aparece en la biblioteca; aquí tapaba etiquetas
        drawLyricist: false,
        drawCredits: false,
        drawPartNames: false,
        drawPartAbbreviations: false,
        drawMeasureNumbers: false,
        // El tempo se muestra en la barra de herramientas; aquí taparía la etiqueta del compás 1.
        drawMetronomeMarks: false,
        followCursor: true,
        cursorsOptions: [{ type: 0, color: '#2f6fdf', alpha: 0.45, follow: true }],
      });
      await osmd.load(xml);
      if (cancelled) return;
      osmdRef.current = osmd;
      cursorTime.current = 0;
      rendered.current = { width: 0, zoom: 0 };
      setLoaded(true);
    })().catch((err: Error) => !cancelled && setError(err.message));
    return () => {
      cancelled = true;
      osmdRef.current?.clear();
      osmdRef.current = null;
    };
  }, [xml]);

  const seek = useCallback((until: (time: number, measure: number) => boolean) => {
    const cursor = osmdRef.current?.cursor;
    if (!cursor) return;
    cursor.reset();
    while (
      !cursor.Iterator.EndReached &&
      !until(cursor.Iterator.CurrentSourceTimestamp.RealValue, cursor.Iterator.CurrentMeasureIndex)
    ) {
      cursor.next();
    }
    if (cursor.Iterator.EndReached) cursor.previous();
    cursorTime.current = cursor.Iterator.CurrentSourceTimestamp.RealValue;
  }, []);

  const layout = useCallback(() => {
    const osmd = osmdRef.current;
    const host = hostRef.current;
    if (!osmd || !host || !visible) return;
    const width = host.clientWidth;
    const z = autoZoom(width) * zoom;
    if (!width || (width === rendered.current.width && z === rendered.current.zoom)) return;
    try {
      osmd.zoom = z;
      osmd.render();
      rendered.current = { width, zoom: z };
      osmd.cursor.show();
      const time = cursorTime.current;
      seek((now) => now >= time - 1e-9);
      setBoxes(measureBoxes(osmd, host));
    } catch (err) {
      setError((err as Error).message);
    }
  }, [visible, zoom, seek]);

  useEffect(() => {
    if (loaded) layout();
  }, [loaded, layout]);

  useEffect(() => {
    const wrap = wrapRef.current;
    if (!wrap) return;
    let timer: ReturnType<typeof setTimeout>;
    const observer = new ResizeObserver(() => {
      clearTimeout(timer);
      timer = setTimeout(layout, 200);
    });
    observer.observe(wrap);
    return () => {
      clearTimeout(timer);
      observer.disconnect();
    };
  }, [layout]);

  useImperativeHandle(
    ref,
    () => ({
      next() {
        const cursor = osmdRef.current?.cursor;
        if (!cursor || cursor.Iterator.EndReached) return;
        cursor.next();
        if (cursor.Iterator.EndReached) cursor.previous();
        cursorTime.current = cursor.Iterator.CurrentSourceTimestamp.RealValue;
        callbacks.current.onCursorMeasure(cursor.Iterator.CurrentMeasureIndex);
      },
      previous() {
        const cursor = osmdRef.current?.cursor;
        if (!cursor || cursor.Iterator.CurrentSourceTimestamp.RealValue <= 0) return;
        cursor.previous();
        cursorTime.current = cursor.Iterator.CurrentSourceTimestamp.RealValue;
        callbacks.current.onCursorMeasure(cursor.Iterator.CurrentMeasureIndex);
      },
      toMeasure(index: number) {
        if (!osmdRef.current) return;
        // Antes del primer render solo se recuerda; se aplica al maquetar.
        if (!rendered.current.width) {
          const sheet = osmdRef.current.Sheet;
          cursorTime.current = sheet.SourceMeasures[index]?.AbsoluteTimestamp.RealValue ?? 0;
          return;
        }
        seek((_, measure) => measure >= index);
      },
    }),
    [seek],
  );

  return (
    <div className={styles.paper} ref={wrapRef} hidden={!visible}>
      {!loaded && !error && <p className={styles.message}>{t('piece.loading')}</p>}
      {error && (
        <p className={`${styles.message} status-error`}>
          {t('piece.renderError', { message: error })}
        </p>
      )}
      <div className={styles.stage}>
        <div ref={hostRef} />
        <div className={styles.overlay}>
          {boxes.map((box, i) =>
            box.width > 0 ? (
              <button
                key={i}
                type="button"
                className={`${styles.measure} ${i === currentMeasure ? styles.current : ''}`}
                style={box}
                aria-label={t('piece.measure', { n: labels[i]?.number ?? i + 1 })}
                aria-pressed={i === currentMeasure}
                onClick={() => onSelectMeasure(i)}
              >
                {labels[i] && (
                  <span className={styles.label}>
                    {labels[i].number} · {labels[i].time}
                    {labels[i].manual && <span title={t('piece.manualMark')}> ⚑</span>}
                  </span>
                )}
              </button>
            ) : null,
          )}
        </div>
      </div>
    </div>
  );
}

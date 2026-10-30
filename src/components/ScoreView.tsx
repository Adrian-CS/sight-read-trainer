'use client';

import { useCallback, useEffect, useImperativeHandle, useRef, useState, type Ref } from 'react';
import type { OpenSheetMusicDisplay } from 'opensheetmusicdisplay';
import { t } from '@/i18n';
import styles from './ScoreView.module.css';

export type ScoreViewHandle = {
  next(): void;
  previous(): void;
  toMeasure(index: number): void;
  /** Coloca el cursor en un instante (negras desde el inicio del compás). */
  toPosition(measure: number, onset: number): void;
  /** Colorea las notas con esas teclas que empiezan en ese instante. */
  colorNotes(measure: number, onset: number, midis: number[], color: string): void;
  clearColors(): void;
};

/** OSMD guarda la altura en semitonos con Do4 = 48; en MIDI Do4 = 60. */
const OSMD_HALFTONE_TO_MIDI = 12;
const EPS = 1e-6;

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
  /** Dibujar el título de la partitura (los ejercicios no tienen). */
  showTitle?: boolean;
  /** Compases del bucle (incluidos), para resaltarlos. */
  loop?: { from: number; to: number } | null;
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
  showTitle = true,
  loop,
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
  /** Posición del cursor en negras desde el inicio, para restaurarla tras volver a maquetar. */
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
        drawTitle: showTitle,
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
  }, [xml, showTitle]);

  /** Inicio del compás en negras, según OSMD. */
  const measureStart = useCallback((index: number) => {
    const m = osmdRef.current?.Sheet.SourceMeasures[index];
    return m ? m.AbsoluteTimestamp.RealValue * 4 : 0;
  }, []);

  /**
   * Mueve el cursor a la primera entrada con instante >= target (negras desde el inicio).
   * Avanza desde la posición actual si puede, y solo redibuja el cursor una vez.
   */
  const seek = useCallback((target: number) => {
    const cursor = osmdRef.current?.cursor;
    if (!cursor) return;
    const it = cursor.Iterator;
    const now = () => it.CurrentSourceTimestamp.RealValue * 4;
    if (it.EndReached || now() > target + EPS) cursor.resetIterator();
    while (!cursor.Iterator.EndReached && now() < target - EPS) cursor.Iterator.moveToNext();
    if (cursor.Iterator.EndReached) cursor.Iterator.moveToPrevious();
    cursor.update();
    cursorTime.current = cursor.Iterator.CurrentSourceTimestamp.RealValue * 4;
  }, []);

  const colored = useRef(new Set<SVGElement>());

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
      colored.current.clear(); // el render nuevo crea otros elementos SVG
      seek(cursorTime.current);
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

  useImperativeHandle(ref, () => {
    const step = (dir: 1 | -1) => {
      const cursor = osmdRef.current?.cursor;
      if (!cursor) return;
      if (dir === 1) {
        if (cursor.Iterator.EndReached) return;
        cursor.next();
        if (cursor.Iterator.EndReached) cursor.previous();
      } else {
        if (cursor.Iterator.CurrentSourceTimestamp.RealValue <= 0) return;
        cursor.previous();
      }
      cursorTime.current = cursor.Iterator.CurrentSourceTimestamp.RealValue * 4;
      callbacks.current.onCursorMeasure(cursor.Iterator.CurrentMeasureIndex);
    };
    const goTo = (measure: number, onset: number) => {
      if (!osmdRef.current) return;
      // Antes del primer render solo se recuerda; se aplica al maquetar.
      if (!rendered.current.width) cursorTime.current = measureStart(measure) + onset;
      else seek(measureStart(measure) + onset);
    };
    return {
      next: () => step(1),
      previous: () => step(-1),
      toMeasure: (index) => goTo(index, 0),
      toPosition: goTo,
      colorNotes(measure, onset, midis, color) {
        const osmd = osmdRef.current;
        if (!osmd || !rendered.current.width) return;
        for (const gm of osmd.GraphicSheet.MeasureList[measure] ?? []) {
          for (const entry of gm?.staffEntries ?? []) {
            if (Math.abs(entry.relInMeasureTimestamp.RealValue * 4 - onset) > EPS) continue;
            for (const ve of entry.graphicalVoiceEntries) {
              for (const gn of ve.notes) {
                const note = gn.sourceNote;
                if (note.isRest() || !midis.includes(note.halfTone + OSMD_HALFTONE_TO_MIDI))
                  continue;
                const g = (
                  gn as unknown as { getSVGGElement?: () => SVGGElement }
                ).getSVGGElement?.();
                if (!g) continue;
                g.querySelectorAll<SVGElement>('path, rect').forEach((el) => {
                  el.style.fill = color;
                  el.style.stroke = color;
                  colored.current.add(el);
                });
              }
            }
          }
        }
      },
      clearColors() {
        colored.current.forEach((el) => {
          el.style.fill = '';
          el.style.stroke = '';
        });
        colored.current.clear();
      },
    };
  }, [seek, measureStart]);

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
                className={`${styles.measure} ${i === currentMeasure ? styles.current : ''} ${
                  loop && i >= loop.from && i <= loop.to ? styles.inLoop : ''
                }`}
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

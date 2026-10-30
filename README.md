# Sightread Trainer

PWA personal para aprender a leer partituras tocando un teclado MIDI (Yamaha por USB) en una tablet Android con Chrome.

## Estado

- **Fase 0 (base):** Next.js (App Router, export estático) + TypeScript, PWA instalable y sin conexión, tema claro/oscuro automático, ESLint + Prettier, Vitest, CI en GitHub Actions y despliegue en Cloudflare Pages.
- **Fase 1 (MIDI):** abstracción `NoteInput` con `MidiInput`, `OnScreenKeyboardInput` y `ComputerKeyboardInput`; selección y recuerdo del dispositivo; reconexión al desenchufar/enchufar; pantalla de diagnóstico en `/diagnostico/`.
- **Fase 2 (visor):** importación de `.mxl`/`.musicxml`/`.xml` (JSZip), biblioteca local (abrir, renombrar, borrar) con 3 piezas de ejemplo de dominio público, render con OSMD (carga diferida) con cursor, zoom adaptado al ancho y compases seleccionables, y toggle **Partitura / Compases** que comparte cursor y compás actual. Cada compás muestra su número y su tiempo de inicio (calculado con `core/sync`, ⚑ si es una marca manual).
- **Fase 3 (práctica):** en la vista de pieza.
  - **Espera:** el cursor solo avanza con la(s) nota(s) correcta(s); acordes dentro de una ventana configurable (150 ms por defecto); verde al acertar, rojo al fallar y mensaje con lo que se tocó y lo que se esperaba.
  - **Con tempo:** metrónomo Web Audio con un compás de cuenta previa, cursor que avanza solo y evaluación de cada nota con margen ajustable (pronto / tarde / se pasó / nota de más).
  - Mano derecha, izquierda o ambas (se valida solo ese pentagrama), bucle entre dos compases, teclado en pantalla opcional.
  - Cada sesión guarda un intento (precisión, duración) y, en modo espera, fallos y tiempo de reacción por nota (`noteStats`) para la futura repetición espaciada.
- Siguiente: Fase 4 (curso desde cero).

## Desarrollo

```bash
npm install
npm run dev          # http://localhost:3000 (Web MIDI funciona en localhost)
npm test             # Vitest (lógica de core/)
npm run lint && npm run typecheck && npm run format:check
npm run build        # export estático en out/ + out/sw.js
npm start            # sirve out/ para probar la PWA
```

Limitaciones conocidas de la práctica: las repeticiones (`:|`) no se expanden y las notas de adorno no se evalúan.

Sin el Yamaha: usa el teclado en pantalla o el del ordenador (`A W S E D F T G Y H U J K O L P Ñ` = Do4…Mi5; `Z`/`X` cambian de octava).

## Tablet + Yamaha

1. Cable del puerto **USB TO HOST** (USB-B) del Yamaha a la tablet (USB-C, o adaptador OTG).
2. Abre la app en Chrome (HTTPS) → _Teclado y diagnóstico_ → _Conectar teclado MIDI_ y acepta el permiso.
3. Instálala con _Añadir a pantalla de inicio_: se abre en pantalla completa y en horizontal.

## Despliegue (Cloudflare Pages)

El job `deploy` de `.github/workflows/ci.yml` publica `out/` en el proyecto de Pages `sightread-trainer` en cada push a `main`. Configuración, una sola vez:

1. En Cloudflare: _Workers & Pages → Create → Pages → Direct Upload_, nombre `sightread-trainer` (o `npx wrangler pages project create sightread-trainer`).
2. Crea un API token con permiso _Cloudflare Pages: Edit_.
3. En GitHub, _Settings → Secrets and variables → Actions_: `CLOUDFLARE_API_TOKEN` y `CLOUDFLARE_ACCOUNT_ID`.

La URL será `https://sightread-trainer.pages.dev` (HTTPS, necesario para Web MIDI y Spotify).

## Estructura

```
src/
  app/          rutas (/, /diagnostico/, /biblioteca/, /pieza/?id=…, manifest)
  components/   InputProvider, Keyboard, ScoreView (OSMD), MeasureGrid, MiniStaff, SegmentedControl…
  core/         lógica sin React, testeada con Vitest
    input/      NoteInput y sus implementaciones, parser MIDI
    music/      utilidades de notas (número MIDI ↔ nombre)
    score/      lectura de archivos, modelo de partitura, constructor de MusicXML, piezas de ejemplo
    sync/       times(), measureAtTime(), fractionInMeasure()
    library/    importar, renombrar, piezas de ejemplo
    practice/   pasos esperados, motor de espera, evaluador de ritmo, metrónomo, estadísticas
    storage/    Repository + DexieRepository (IndexedDB)
  i18n/         textos (es.ts) y t()
scripts/        generador del service worker, render de iconos
```

La capa de datos está detrás de la interfaz `Repository`; la sincronización entre dispositivos con Cloudflare D1 se añadiría como otra implementación más adelante.

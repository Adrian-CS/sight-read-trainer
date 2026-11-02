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
- **Fase 4 (curso, `/curso/`):** tres pistas —clave de Sol (mano derecha, desde Do4–Mi4), clave de Fa (mano izquierda, desde Do3–Mi3) y las dos claves (mezcla lo desbloqueado)—.
  - Ejercicios de 16 negras generados como MusicXML y tocados en modo espera con el mismo pipeline (OSMD + `core/practice`).
  - Desbloqueo: si un ejercicio completo tiene ≥ 90 % de aciertos a la primera y una mediana de reacción ≤ 2 s, se añade la siguiente nota de la pista (posición de cinco dedos, después hacia fuera y por último las líneas adicionales).
  - Repetición espaciada: cada nota pesa más cuanto más se falla, más se tarda, menos se ha practicado o más tiempo hace que no sale.
  - **Ritmo** (5 niveles: redondas/blancas/negras → silencios → corcheas → puntillos → semicorcheas): figuras sobre Si4 con metrónomo; vale cualquier tecla. Se sube de nivel con ≥ 90 % de aciertos y ≤ 90 ms de desviación media.
  - **Intervalos** (3 niveles: 3ª y 5ª → 2ª y 4ª → 6ª, 7ª y 8ª) y **acordes** (3 niveles: Do/Fa/Sol mayor → La/Re/Mi menor → inversiones): se tocan a la vez en modo espera (ventana de 400 ms) y al acertar se muestra su nombre. Se sube con ≥ 90 % y ≤ 3 s de reacción.
  - En el curso no se muestra qué notas tocar: solo se revela después del segundo fallo en la misma nota.
- **Fase 5 (Spotify):** en la vista de pieza.
  - Inicio de sesión con Authorization Code + PKCE (sin secreto en el cliente), tokens en IndexedDB con renovación automática.
  - Web Playback SDK: la canción suena en la propia pestaña (requiere Premium; el primer play sale siempre de un toque).
  - Búsqueda de canciones o enlace pegado de open.spotify.com; por pieza se guardan `trackId`, `startMs` y `endMs`. «Escuchar fragmento» se para solo al final.
  - Sincronización (sección 6): tempo, «Compás 1 empieza aquí», «Fijar compás N aquí», Tap (marca el compás cuyo inicio está más cerca) y «Quitar marcas». Las marcas manuales llevan ⚑.
  - Mientras suena, una línea verde recorre la partitura y el compás que suena se resalta en las dos vistas (estado leído cada 250 ms e interpolado con `performance.now()`). Modo de depuración opcional: «lo que oyes» frente a «cursor de la app».
- Siguiente: Fase 6 (estadísticas).

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

## Spotify

App registrada en el [Spotify Developer Dashboard](https://developer.spotify.com/dashboard) en modo desarrollo (uso personal, hasta 5 usuarios, cuenta Premium). Redirect URIs registradas:

- `https://sight-read-trainer.pages.dev/spotify/callback/`
- `http://127.0.0.1:3000/spotify/callback/` (desarrollo: abrir la app en `http://127.0.0.1:3000`, no en `localhost`)

El Client ID está en `src/core/spotify/config.ts` (no es secreto) y se puede sustituir con `NEXT_PUBLIC_SPOTIFY_CLIENT_ID`. Uso personal únicamente: no publicar la app comercialmente sin aprobación de Spotify.

## Despliegue (Cloudflare Pages)

El repositorio está conectado a Cloudflare Pages (build `npm run build`, salida `out`): cada push a `main` se publica en https://sight-read-trainer.pages.dev.

Alternativa sin integración de Git:

el job `deploy` de `.github/workflows/ci.yml` publica `out/` con Wrangler si existen los secretos (sin ellos se omite, como ahora). Configuración, una sola vez:

1. En Cloudflare: _Workers & Pages → Create → Pages → Direct Upload_, nombre `sight-read-trainer`.
2. Crea un API token con permiso _Cloudflare Pages: Edit_.
3. En GitHub, _Settings → Secrets and variables → Actions_: `CLOUDFLARE_API_TOKEN` y `CLOUDFLARE_ACCOUNT_ID`.

## Estructura

```
src/
  app/          rutas (/, /curso/, /curso/leccion/?pista=…, /biblioteca/, /pieza/?id=…, /diagnostico/)
  components/   InputProvider, Keyboard, ScoreView (OSMD), MeasureGrid, MiniStaff, SegmentedControl…
  core/         lógica sin React, testeada con Vitest
    input/      NoteInput y sus implementaciones, parser MIDI
    music/      utilidades de notas (número MIDI ↔ nombre)
    score/      lectura de archivos, modelo de partitura, constructor de MusicXML, piezas de ejemplo
    sync/       times(), measureAtTime(), fractionInMeasure()
    library/    importar, renombrar, piezas de ejemplo
    practice/   pasos esperados, motor de espera, evaluador de ritmo, metrónomo, estadísticas
    spotify/    PKCE, tokens, Web API, Web Playback SDK, reloj de reproducción
    exercises/  pistas del curso, generadores (notas, ritmo, intervalos, acordes), repetición espaciada, desbloqueo
    storage/    Repository + DexieRepository (IndexedDB)
  i18n/         textos (es.ts) y t()
scripts/        generador del service worker, render de iconos
```

La capa de datos está detrás de la interfaz `Repository`; la sincronización entre dispositivos con Cloudflare D1 se añadiría como otra implementación más adelante.

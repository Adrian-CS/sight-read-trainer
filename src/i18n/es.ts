/** Textos de la interfaz en español. Añadir otro idioma = otro archivo con las mismas claves. */
export const es = {
  appName: 'Sightread Trainer',
  appTagline: 'Aprende a leer partituras tocando tu teclado',
  back: 'Volver',
  comingSoon: 'Próximamente',

  'home.diagnostics': 'Teclado y diagnóstico',
  'home.diagnosticsHint': 'Conecta el teclado MIDI y comprueba que llegan las notas',
  'home.library': 'Biblioteca',
  'home.libraryHint': 'Importa y abre partituras MusicXML',
  'home.practice': 'Práctica',
  'home.practiceHint': 'Toca la partitura nota a nota',
  'home.course': 'Curso desde cero',
  'home.courseHint': 'Ejercicios de lectura progresivos',

  'midi.title': 'Teclado MIDI',
  'midi.connect': 'Conectar teclado MIDI',
  'midi.requesting': 'Pidiendo permiso…',
  'midi.unsupported':
    'Este navegador no tiene Web MIDI. Usa Chrome en Android o en el PC. Puedes practicar con el teclado en pantalla o el del ordenador.',
  'midi.denied':
    'Se denegó el acceso MIDI. Pulsa el candado de la barra de direcciones, permite "Dispositivos MIDI" y vuelve a intentarlo.',
  'midi.failed': 'No se pudo acceder a MIDI: {message}',
  'midi.noDevices':
    'No hay dispositivos MIDI. Conecta el teclado por USB (con adaptador OTG si hace falta).',
  'midi.device': 'Dispositivo',
  'midi.connected': 'Conectado',
  'midi.disconnected': 'Desconectado — vuelve a enchufarlo y se reconectará solo',
  'midi.retry': 'Reintentar',

  'diag.title': 'Diagnóstico',
  'diag.lastNote': 'Última nota',
  'diag.velocity': 'Velocidad',
  'diag.source': 'Origen',
  'diag.none': '—',
  'diag.log': 'Eventos recientes',
  'diag.source.midi': 'MIDI',
  'diag.source.onscreen': 'Teclado en pantalla',
  'diag.source.computer': 'Teclado del ordenador',
  'diag.computerHint':
    'Teclado del ordenador: A W S E D F T G Y H U J K = Do…Do. Z / X bajan o suben una octava (base actual: {base}).',

  'keyboard.label': 'Teclado en pantalla',

  'library.title': 'Biblioteca',
  'library.import': 'Importar partitura',
  'library.importHint':
    'Archivos .mxl, .musicxml o .xml (por ejemplo, exportados desde MuseScore).',
  'library.importing': 'Importando…',
  'library.imported': 'Importada: {title}',
  'library.importError': 'No se pudo importar {name}: {message}',
  'library.empty': 'Aún no hay piezas. Importa una partitura para empezar.',
  'library.measures': '{count} compases',
  'library.sample': 'Ejemplo',
  'library.open': 'Abrir',
  'library.rename': 'Renombrar',
  'library.save': 'Guardar',
  'library.cancel': 'Cancelar',
  'library.delete': 'Borrar',
  'library.confirmDelete': '¿Borrar "{title}"? También se borrarán sus intentos.',
  'library.newTitle': 'Nuevo título',

  'piece.notFound': 'No se encontró la pieza.',
  'piece.loading': 'Cargando partitura…',
  'piece.renderError': 'No se pudo mostrar la partitura: {message}',
  'piece.mode': 'Vista',
  'piece.mode.score': 'Partitura',
  'piece.mode.measures': 'Compases',
  'piece.measure': 'Compás {n}',
  'piece.measureOf': 'Compás {n} de {total}',
  'piece.tempo': 'tempo {bpm}',
  'piece.prevNote': 'Nota anterior',
  'piece.nextNote': 'Nota siguiente',
  'piece.zoomIn': 'Ampliar',
  'piece.zoomOut': 'Reducir',
  'piece.manualMark': 'Marca manual',
} as const;

export type MessageKey = keyof typeof es;

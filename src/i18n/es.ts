/**
 * Spanish texts: those of the Spanish (es-ES) Windows 10 Paint, as they appear in its menus, tooltips and
 * dialogs (see analysis/). This is the reference catalog: en.ts and ca.ts have the same shape.
 */
export const es = {
  langName: 'Español',
  /** Locale for dates. */
  locale: 'es-ES',
  /** Decimal separator of displayed numbers (file sizes, units). */
  decimal: ',',
  untitled: 'Sin título',

  meta: {
    title: 'paint.cat · Paint online gratis, igual que el de Windows',
    description:
      'Dibuja y edita imágenes en tu navegador con paint.cat, una réplica fiel del Paint clásico de Windows: pinceles, formas, texto, selección, zoom y guardado en PNG, JPG, BMP y GIF. Gratis, sin registro y funciona sin conexión.',
  },

  /** Key names used to display shortcuts. */
  keys: {
    ctrl: 'Ctrl',
    shift: 'Mayús',
    alt: 'Alt',
    delete: 'Supr',
    pageUp: 'RePág',
    pageDown: 'AvPág',
    wheel: 'rueda',
  },

  /** Text of each command: `label` with & before the access key, `tip` (tooltip title) and `desc`. */
  cmd: {
    'file.new': { label: '&Nuevo', desc: 'Crea una nueva imagen.' },
    'file.open': { label: '&Abrir', desc: 'Abre una imagen existente.' },
    'file.save': { label: '&Guardar', desc: 'Guarda la imagen actual.' },
    'file.saveAs': { label: 'Guardar c&omo', desc: 'Guarda la imagen actual como un nuevo archivo.' },
    'file.saveAsPng': {
      label: 'Imagen &PNG',
      desc: 'Guarde una foto o un dibujo con alta calidad y úsela en el equipo o en la Web.',
    },
    'file.saveAsJpg': {
      label: 'Imagen &JPG',
      desc: 'Guarde una foto con buena calidad y úsela en el equipo, en el correo electrónico o en la Web.',
    },
    'file.saveAsBmp': {
      label: 'Imagen &BMP',
      desc: 'Guarde cualquier clase de imagen con alta calidad y úsela en el equipo.',
    },
    'file.saveAsGif': {
      label: 'Imagen &GIF',
      desc: 'Guarde un dibujo sencillo con menor calidad y úselo en el correo electrónico o en la Web.',
    },
    'file.saveAsOther': {
      label: '&Otros formatos',
      desc: 'Abra el cuadro de diálogo Guardar como para seleccionar uno de los posibles tipos de archivo.',
    },
    'file.print': {
      label: '&Imprimir',
      desc: 'Seleccione una impresora, un número de copias y otras opciones de impresión antes de imprimir.  Imprime la imagen actual.',
    },
    'file.pageSetup': { label: '&Configurar página', desc: 'Cambie el diseño de la imagen.' },
    'file.printPreview': {
      label: '&Vista previa de impresión',
      desc: 'Realice una vista previa y efectúe cambios antes de imprimir.',
    },
    'file.scanner': { label: '&Desde escáner o cámara', desc: 'Importa desde escáner o cámara.' },
    'file.email': {
      label: 'En&viar en correo electrónico',
      desc: 'Envía una copia de la imagen como datos adjuntos en un mensaje de correo electrónico.',
    },
    'file.wallpaper': {
      label: 'Establecer como &fondo de escritorio',
      desc: 'Establece la imagen actual como fondo de escritorio.',
    },
    'file.wallpaperFill': { label: '&Rellenar', desc: 'Rellena toda la pantalla con la imagen.' },
    'file.wallpaperTile': {
      label: '&Mosaico',
      desc: 'Use la imagen como un mosaico de modo que se repita hasta rellenar toda la pantalla.',
    },
    'file.wallpaperCenter': { label: '&Centrar', desc: 'Centre la imagen en el medio de pantalla.' },
    'file.properties': { label: 'Propi&edades', desc: 'Cambia las propiedades de la imagen.' },
    'file.about': { label: 'Acerca de &paint.cat' },
    'file.exit': { label: '&Salir' },

    'edit.undo': { label: 'Deshacer', desc: 'Deshace la última acción.' },
    'edit.redo': { label: 'Rehacer', desc: 'Rehace la última acción.' },
    'edit.paste': { label: '&Pegar', desc: 'Pega el contenido del Portapapeles.' },
    'edit.pasteFrom': { label: 'Pegar &desde', desc: 'Pega una imagen guardada en un archivo.' },
    'edit.cut': { label: 'C&ortar', desc: 'Corta la selección del lienzo y la coloca en el Portapapeles.' },
    'edit.copy': { label: '&Copiar', desc: 'Copia la selección del lienzo y la coloca en el Portapapeles.' },
    'edit.selectAll': { label: 'Seleccionar &todo' },
    'edit.invertSelection': { label: '&Invertir selección' },
    'edit.delete': { label: '&Eliminar' },
    'edit.crop': { label: '&Recortar', desc: 'Recorta la imagen de modo que solo contenga la selección actual.' },
    'edit.resize': { label: 'Cambiar ta&maño', desc: 'Cambia de tamaño o sesga la imagen o selección.' },
    'edit.rotate': { label: '&Girar', desc: 'Gira o voltea la imagen o selección.' },
    'edit.rotateRight': { label: 'Girar 90° a la &derecha' },
    'edit.rotateLeft': { label: 'Girar 90° a la &izquierda' },
    'edit.rotate180': { label: '&Girar 180°' },
    'edit.flipV': { label: 'Voltear &verticalmente' },
    'edit.flipH': { label: 'Voltear &horizontalmente' },
    'edit.invertColor': { label: 'In&vertir color' },

    'select.main': { label: 'Seleccionar', tip: 'Selección', desc: 'Selecciona una parte de una imagen.' },
    'select.rect': { label: 'Selección &rectangular' },
    'select.free': { label: 'Selección de &forma libre' },
    'select.transparent': { label: 'Selección &transparente' },
    'tool.pencil': { label: 'Lápiz', desc: 'Dibuja una línea de forma libre con el ancho de línea seleccionado.' },
    'tool.fill': {
      label: 'Relleno con color',
      desc: 'Hacer clic en un área del lienzo para llenarlo con el color de primer plano o hacer clic con el botón secundario para llenarlo con el color de fondo.',
    },
    'tool.text': { label: 'Texto', desc: 'Inserta texto en la imagen.' },
    'tool.eraser': { label: 'Borrador', desc: 'Borra una parte de la imagen y la reemplaza por el color de fondo.' },
    'tool.picker': { label: 'Selector de color', desc: 'Permite seleccionar un color de la imagen para dibujar.' },
    'tool.magnifier': { label: 'Lupa', desc: 'Cambia la ampliación de una parte de la imagen.' },
    'tool.brush': { label: 'Pinceles', desc: 'Dibuja con distintos tipos de pincel.' },
    'shape.outline': { label: 'Contorno', desc: 'Permite seleccionar el medio para el contorno de forma.' },
    'shape.fill': { label: 'Rellenar', desc: 'Permite seleccionar el medio para el relleno de forma.' },
    size: { label: 'Tamaño', desc: 'Permite seleccionar el ancho para la herramienta seleccionada.' },

    'color.1': {
      label: 'Color 1',
      tip: 'Color 1 (color de primer plano)',
      desc: 'Hacer clic aquí y seleccione un color de la paleta de colores. Este color se usará con el lápiz y con los pinceles, así como para contornos de forma.',
    },
    'color.2': {
      label: 'Color 2',
      tip: 'Color 2 (color de fondo)',
      desc: 'Hacer clic aquí y seleccione un color de la paleta de colores. Este color se usará con el borrador y para rellenos de forma.',
    },
    'color.edit': { label: 'Editar colores', desc: 'Permite seleccionar un color de la paleta de colores.' },

    'view.zoomIn': { label: 'Acercar', desc: 'Acerca la imagen actual.' },
    'view.zoomOut': { label: 'Alejar', desc: 'Aleja la imagen actual.' },
    'view.zoom100': { label: '100%', desc: 'Zoom al 100%.' },
    'view.rulers': {
      label: 'Reglas',
      desc: 'Permite ver y usar las reglas para alinear y medir los objetos de la imagen.',
    },
    'view.grid': {
      label: 'Cuadrícula',
      desc: 'Permite ver y usar la cuadrícula para alinear los objetos de la imagen.',
    },
    'view.statusBar': {
      label: 'Barra de estado',
      desc: 'Muestra u oculta la barra de estado en la parte inferior de la ventana.',
    },
    'view.fullscreen': { label: 'Pantalla completa', desc: 'Permite ver la imagen a pantalla completa.' },
    'view.thumbnail': { label: 'Miniatura', desc: 'Muestra u oculta la ventana de miniaturas.' },

    'text.family': { label: 'Familia de fuentes', desc: 'Cambia la familia de fuentes.' },
    'text.size': { label: 'Tamaño de fuente', desc: 'Cambia el tamaño de la fuente.' },
    'text.bold': { label: 'Negrita', desc: 'Cambia a una fuente en negrita.' },
    'text.italic': { label: 'Cursiva', desc: 'Cambia a una fuente en cursiva.' },
    'text.underline': { label: 'Subrayado', desc: 'Dibuja una línea debajo del texto.' },
    'text.strike': { label: 'Tachado', desc: 'Dibuja una línea en medio del texto.' },
    'text.opaque': { label: 'Opaco', desc: 'El fondo del cuadro de texto se rellena con el Color 2.' },
    'text.transparent': { label: 'Transparente', desc: 'El fondo del cuadro de texto es transparente.' },

    'preview.print': {
      label: 'Imprimir',
      desc: 'Seleccione una impresora, un número de copias y otras opciones de impresión antes de imprimir.  Imprime la imagen actual.',
    },
    'preview.pageSetup': { label: 'Configurar página', desc: 'Cambie el diseño de la imagen.' },
    'preview.zoomIn': { label: 'Acercar', desc: 'Acerca la imagen actual.' },
    'preview.zoomOut': { label: 'Alejar', desc: 'Aleja la imagen actual.' },
    'preview.onePage': { label: 'Una página', desc: 'Acerca o aleja la imagen para ajustar una página a la ventana.' },
    'preview.twoPages': {
      label: 'Dos páginas',
      desc: 'Acerca o aleja la imagen para ajustar dos páginas a la ventana.',
    },
    'preview.prev': { label: 'Página anterior', desc: 'Va a la página anterior de la imagen.' },
    'preview.next': { label: 'Página siguiente', desc: 'Va a la siguiente página de la imagen.' },
    'preview.close': {
      label: 'Cerrar vista previa de impresión',
      desc: 'Cierra la vista previa de impresión y vuelve a la imagen.',
    },

    'ribbon.minimize': {
      label: 'Mi&nimizar la Cinta',
      tip: 'Minimizar la cinta de opciones',
      desc: 'Mostrar solamente los nombres de pestaña en la cinta de opciones.',
    },
    'qat.position': { label: '&Mostrar bajo la Cinta' },
    help: { label: 'Ayuda', desc: 'Proporciona ayuda sobre el uso de paint.cat.' },
    language: { label: 'Idioma', desc: 'Cambia el idioma de paint.cat.' },
  },

  brushes: {
    brush: 'Pincel',
    calligraphy1: 'Pincel caligráfico 1',
    calligraphy2: 'Pincel caligráfico 2',
    airbrush: 'Aerógrafo',
    oil: 'Pincel para óleo',
    crayon: 'Crayón',
    marker: 'Marcador',
    naturalPencil: 'Lápiz natural',
    watercolor: 'Pincel para acuarela',
  },

  shapes: {
    line: 'Línea',
    curve: 'Curva',
    ellipse: 'Elipse',
    rectangle: 'Rectángulo',
    roundRect: 'Rectángulo redondeado',
    polygon: 'Polígono',
    triangle: 'Triángulo',
    rightTriangle: 'Triángulo rectángulo',
    diamond: 'Rombo',
    pentagon: 'Pentágono',
    hexagon: 'Hexágono',
    arrowRight: 'Flecha derecha',
    arrowLeft: 'Flecha izquierda',
    arrowUp: 'Flecha arriba',
    arrowDown: 'Flecha abajo',
    star4: 'Estrella de cuatro puntas',
    star5: 'Estrella de cinco puntas',
    star6: 'Estrella de seis puntas',
    calloutRoundRect: 'Llamada rectangular redondeada',
    calloutEllipse: 'Llamada de elipse',
    calloutCloud: 'Llamada de nube',
    heart: 'Corazón',
    lightning: 'Rayo',
  },

  /** Shape outline and fill media. */
  styles: {
    none: 'Sin contorno',
    solid: 'Color sólido',
    crayon: 'Crayón',
    marker: 'Marcador',
    oil: 'Óleo',
    naturalPencil: 'Lápiz natural',
    watercolor: 'Acuarela',
  },
  noFill: 'Sin relleno',

  /** Default palette, in DEFAULT_PALETTE order. */
  palette: [
    'Negro',
    'Gris-50%',
    'Rojo oscuro',
    'Rojo',
    'Naranja',
    'Amarillo',
    'Verde',
    'Turquesa',
    'Añil',
    'Morado',
    'Blanco',
    'Gris-25%',
    'Marrón',
    'Rosado',
    'Dorado',
    'Amarillo claro',
    'Lima',
    'Turquesa claro',
    'Azul grisáceo',
    'Lavanda',
  ],

  qat: {
    toolbar: 'Barra de herramientas de acceso rápido',
    customize: 'Personalizar barra de herramientas de acceso rápido',
    showBelow: '&Mostrar bajo la Cinta',
    showAbove: '&Mostrar sobre la Cinta',
    items: {
      new: 'Nuevo',
      open: 'Abrir',
      save: 'Guardar',
      print: 'Imprimir',
      printPreview: 'Vista previa de impresión',
      email: 'Enviar en correo electrónico',
      undo: 'Deshacer',
      redo: 'Rehacer',
    },
  },

  ribbon: {
    label: 'Cinta de opciones',
    file: 'Archivo',
    fileTip: 'Pestaña Archivo',
    fileDesc: 'Hacer clic aquí para abrir, guardar o imprimir y para ver todo lo que puede hacer con la imagen.',
    tabs: { home: 'Inicio', view: 'Ver', text: 'Texto', preview: 'Vista previa de impresión' },
    textTools: 'Herramientas de texto',
    expand: 'Expandir la cinta de opciones',
    minimize: 'Minimizar la cinta de opciones',
    groups: {
      clipboard: 'Portapapeles',
      image: 'Imagen',
      tools: 'Herramientas',
      shapes: 'Formas',
      colors: 'Colores',
      zoom: 'Zoom',
      showHide: 'Mostrar u ocultar',
      display: 'Pantalla',
      font: 'Fuente',
      background: 'Fondo',
      print: 'Imprimir',
      preview: 'Vista previa',
    },
    selectionShapes: 'Formas de selección',
    selectionOptions: 'Opciones de selección',
    shapes: 'Formas',
    shapesDesc: 'Inserta formas ya listas como rectángulos, círculos, triángulos, flechas, estrellas y llamadas.',
    rowUp: 'Subir fila',
    rowDown: 'Bajar fila',
    moreShapes: 'Más formas',
    palette: 'Paleta de colores',
    customColor: (n: number) => `Color personalizado ${n}`,
    /** Large-button labels, split over two lines as on the Ribbon. */
    color: (n: number) => `Color\n${n}`,
    editColors: 'Editar\ncolores',
    zoom100: '100\n%',
    fullscreen: 'Pantalla\ncompleta',
    pageSetup: 'Configurar\npágina',
    prevPage: 'Página\nanterior',
    nextPage: 'Página\nsiguiente',
    closePreview: 'Cerrar vista previa\nde impresión',
    open: 'Abrir',
    moreFonts: 'Mostrar más fuentes',
  },

  /** Canvas context menu (some access keys differ from the Ribbon). */
  context: {
    selectAll: '&Seleccionar todo',
    rotate: '&Girar',
    resize: '&Cambiar tamaño',
  },

  fileMenu: {
    recent: 'Imágenes recientes',
    saveAs: 'Guardar como',
    print: 'Imprimir',
    wallpaper: 'Establecer como fondo de escritorio',
    moreOptions: (label: string) => `${label}: más opciones`,
  },

  status: {
    label: 'Barra de estado',
    position: (x: number, y: number) => `${x}, ${y} píxeles`,
    size: (w: number, h: number) => `${w} × ${h} píxeles`,
    fileSize: (size: string) => `Tamaño: ${size}`,
    zoomSlider: 'Control deslizante del zoom',
  },

  workspace: {
    fullscreen: 'Pantalla completa',
    thumbnail: 'Miniatura',
    textBox: 'Cuadro de texto',
  },

  dialog: {
    ok: 'Aceptar',
    cancel: 'Cancelar',
    close: 'Cerrar',
    save: 'Guardar',
    dontSave: 'No guardar',
    saveChanges: (name: string) => `¿Desea guardar los cambios de ${name}?`,
    bytes: (n: number) => `${n} bytes`,
    kb: 'KB',
    mb: 'MB',
  },

  resize: {
    title: 'Cambiar de tamaño y sesgar',
    resize: 'Cambiar tamaño',
    by: 'Por:',
    percent: 'Porcentaje',
    pixels: 'Píxeles',
    horizontal: 'Horizontal:',
    vertical: 'Vertical:',
    keepRatio: 'Mantener relación de aspecto',
    skew: 'Sesgar (grados)',
    intRange: (min: number, max: number) => `Escriba un número entero entre ${min} y ${max}.`,
  },

  properties: {
    title: 'Propiedades de la imagen',
    fileAttributes: 'Atributos de archivo',
    lastSaved: 'Guardado por última vez:',
    sizeOnDisk: 'Tamaño en disco:',
    resolution: 'Resolución:',
    dpi: (n: number) => `${n} PPP`,
    notAvailable: 'No disponible',
    units: 'Unidades',
    inches: 'Pulgadas',
    centimeters: 'Centímetros',
    pixels: 'Píxeles',
    colors: 'Colores',
    blackWhite: 'Blanco y negro',
    color: 'Color',
    width: 'Ancho:',
    height: 'Alto:',
    default: 'Predeterminado',
    sizeRange: (max: number) => `El ancho y el alto deben estar entre 1 y ${max} píxeles.`,
    monochromeWarning:
      'Al convertir la imagen a blanco y negro se perderá toda la información de color. Esta operación se puede deshacer. ¿Desea continuar?',
  },

  editColors: {
    title: 'Editar colores',
    basic: 'Colores básicos:',
    custom: 'Colores personalizados:',
    define: 'Definir colores personalizados >>',
    add: 'Agregar a los colores personalizados',
    hueSat: 'Matiz y saturación',
    lumBar: 'Luminosidad',
    solid: 'Color|Sólido',
    hue: 'Matiz:',
    sat: 'Sat.:',
    lum: 'Lum.:',
    red: 'Rojo:',
    green: 'Verde:',
    blue: 'Azul:',
  },

  pageSetup: {
    title: 'Configurar página',
    preview: 'Vista previa',
    paper: 'Papel',
    size: 'Tamaño:',
    source: 'Origen:',
    orientation: 'Orientación',
    portrait: 'Vertical',
    landscape: 'Horizontal',
    margins: 'Márgenes (milímetros)',
    left: 'Izquierdo:',
    top: 'Superior:',
    right: 'Derecho:',
    bottom: 'Inferior:',
    centering: 'Centrado',
    horizontally: 'Horizontal',
    vertically: 'Vertical',
    scaling: 'Escala',
    adjustTo: 'Ajustar al:',
    normalSize: '% del tamaño normal',
    fitTo: 'Ajustar a:',
    by: 'por',
    pages: 'página(s)',
    papers: { A4: 'A4', A3: 'A3', A5: 'A5', Letter: 'Carta', Legal: 'Legal' },
  },

  saveAs: {
    title: 'Guardar como',
    fileName: 'Nombre de archivo:',
    type: 'Tipo:',
    downloadNote: 'El archivo se descargará en la carpeta de descargas de tu navegador.',
  },

  files: {
    formats: {
      bmp1: 'Mapa de bits monocromático (*.bmp;*.dib)',
      bmp4: 'Mapa de bits de 16 colores (*.bmp;*.dib)',
      bmp8: 'Mapa de bits de 256 colores (*.bmp;*.dib)',
      bmp24: 'Mapa de bits de 24 bits (*.bmp;*.dib)',
      jpg: 'JPEG (*.jpg;*.jpeg;*.jpe;*.jfif)',
      gif: 'GIF (*.gif)',
      tiff: 'TIFF (*.tif;*.tiff)',
      png: 'PNG (*.png)',
    },
    allImages: 'Todos los archivos de imagen',
    cantRead: (name: string) =>
      `paint.cat no puede leer este archivo.\n\n${name}\n\nNo es un archivo de imagen válido o no se admite su formato.`,
    notFound: (name: string) => `No se encuentra «${name}». Puede que se haya movido o eliminado.`,
    noShare: 'Este navegador no permite compartir imágenes. Guarda la imagen y adjúntala desde tu programa de correo.',
  },

  about: {
    title: 'Acerca de paint.cat',
    version: (v: string) => `Versión ${v}`,
    text: 'Una réplica web del Paint clásico de Windows 10. Funciona en el navegador, sin servidor y sin conexión.',
    legal:
      'paint.cat no está afiliado ni patrocinado por Microsoft. Microsoft, Windows y Paint son marcas comerciales de Microsoft Corporation. Iconos y código propios.',
    openSource:
      'paint.cat es de código abierto. Si encuentras un error o quieres proponer un cambio, abre un issue o un pull request en GitHub:',
  },

  help: {
    title: 'Ayuda de paint.cat',
    shortcuts: 'Atajos de teclado',
    tricks: 'Trucos',
    rows: {
      new: 'Nuevo',
      open: 'Abrir',
      save: 'Guardar',
      saveAs: 'Guardar como',
      print: 'Imprimir',
      undo: 'Deshacer',
      redo: 'Rehacer',
      clipboard: 'Cortar / Copiar / Pegar',
      selectAll: 'Seleccionar todo',
      delete: 'Eliminar la selección',
      crop: 'Recortar',
      resize: 'Cambiar de tamaño y sesgar',
      invertColor: 'Invertir color',
      properties: 'Propiedades de la imagen',
      rulersGrid: 'Reglas / Cuadrícula',
      zoom: 'Acercar / Alejar',
      fullscreen: 'Pantalla completa',
      size: 'Aumentar / reducir grosor',
      keytips: 'Mostrar las teclas de acceso de la cinta',
    },
    tips: [
      'Clic izquierdo dibuja con el Color 1 y clic derecho con el Color 2.',
      'Con el borrador, el clic derecho reemplaza solo el Color 1 por el Color 2.',
      'Mantén Mayús al dibujar formas para obtener círculos, cuadrados y líneas a 45°.',
      'Arrastra una selección con Ctrl para copiarla y con Mayús para dejar un rastro.',
      'Algunos atajos (Ctrl+N, Ctrl+W) los reserva el navegador: instala paint.cat como aplicación para usarlos todos.',
    ],
  },

  update: {
    available: 'Hay una versión nueva de paint.cat.',
    reload: 'Actualizar',
  },
};

/** Same shape as `es` with any string values: every translation must match it. */
type Widen<T> = T extends string
  ? string
  : T extends (...args: infer A) => infer R
    ? (...args: A) => R
    : T extends readonly (infer U)[]
      ? readonly Widen<U>[]
      : { readonly [K in keyof T]: Widen<T[K]> };

/** Text of a command; each language decides whether its tooltip has a title other than the label (`tip`). */
export interface CommandText {
  readonly label: string;
  readonly tip?: string;
  readonly desc?: string;
}

export type Messages = Omit<Widen<typeof es>, 'cmd'> & {
  readonly cmd: Readonly<Record<keyof typeof es.cmd, CommandText>>;
};

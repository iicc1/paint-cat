# Microsoft Paint (classic, Windows 10) specification for its web replica

Reference document for building **paint.cat** (formerly written as "claudiopaint"), a faithful web copy of Windows 10 Paint.
Everything here was obtained from the Paint installed on the analysis machine by automating it
(UI Automation/MSAA + screenshots with `PrintWindow`) and extracting its internal resources.

> **Note on links:** `msaa/`, `screenshots/` and `resources/` are gitignored and kept locally only: they contain Microsoft-copyrighted material and details of the machine used for the analysis. Links into those folders do not resolve on GitHub.

> **Note on language:** the analysed Paint was the **Spanish (es-ES)** build. UI strings quoted from it (labels, KeyTip letters, access keys, shortcuts such as Ctrl+G) are facts about that build and are kept verbatim in Spanish, usually followed by the English Paint equivalent in parentheses, e.g. **Pegar** (Paste). Tooltip and description texts are given as English translations; the verbatim Spanish strings are in the `msaa/` dumps and in `resources/ribbon_comandos.txt`. File names inside `msaa/`, `screenshots/` and `resources/` are in Spanish and are referenced as-is.

| Item | Value |
|---|---|
| Executable | `C:\Windows\System32\mspaint.exe` |
| Version | 10.0.19041.4522 (Windows 10 Pro 22H2, build 19045.7807) |
| UI language | Spanish (es-ES), resources in `es-ES\mspaint.exe.mui` |
| Display scaling during capture | 110% (106 DPI). Pixel measurements in this document are screen pixels at 110%; divide by **1.104** to get CSS pixels at 96 DPI. |
| Window size during analysis | 1280 × 820 px (not maximized) |
| Other installed app | Paint 3D (`Microsoft.MSPaint` 6.2410). It is **not** in scope for this replica; it only appears as the "Editar con Paint 3D" (Edit with Paint 3D) button. |

## Contents of the `analysis/` folder

| Path | Contents |
|---|---|
| `screenshots/NN_*.png` | 55 screenshots of windows, menus, dropdowns, dialogs and states. They were taken with `PrintWindow`, so they show only Paint windows (no other apps on top). |
| `msaa/NN_*.txt` | Dump of the accessibility tree for each screenshot: each control's name, role, on-screen position `[x,y widthxheight]`, state (`unavailable` = disabled, `checked`, `pressed`, `selected`…), **KeyTip** (`key='Alt, H, V'`) and **tooltip** (`desc='…'`). This is the source of truth for texts and states. |
| `msaa/12_tamanos_por_herramienta.txt` | Line widths offered by "Tamaño" (Size) for each tool. |
| `msaa/17_paleta_colores.txt` | Default palette with exact names and RGB values. |
| `msaa/27b_colores_basicos_editar_colores.txt` | The 48 basic colors of the Edit Colors dialog. |
| `resources/` | Resources extracted from `mspaint.exe` (strings, dialogs, accelerators, cursors, icons, images). See its `LEEME.md` (README, in Spanish). |

Screenshot naming convention: the number matches the `msaa/` dump with the same name.

---

## 1. Main window structure

![Main window](screenshots/01_ventana_principal.png)

From top to bottom (measurements at 110%):

1. **Title bar** (~33 px): Paint icon, **Quick Access Toolbar** (QAT), separator, title `"<file> - Paint"` (with no file: `"Sin título - Paint"`, English `"Untitled - Paint"`), Minimize / Maximize / Close buttons.
2. **Tab row** (25 px, y=33): blue **Archivo** (File) button (61 px), **Inicio** (Home) and **Ver** (View) tabs; on the right, the **Minimizar la cinta de opciones** (Minimize the Ribbon) button (`˄`) and **Ayuda** (Help, blue `?`).
   - A contextual tab **Herramientas de texto › Texto** (Text Tools › Text; green header) appears while text is being edited.
   - In print preview the tabs are replaced by **Vista previa de impresión** (Print Preview).
3. **Ribbon** (101 px, y=58): groups with a grey label at the bottom and vertical separators.
4. **Work area** (bluish-grey gradient background, approx. `#C8D1E0`→`#D9E2F0`), with the **white canvas** anchored at the top left (~5 px margin) and a soft shadow. Canvas resize handles: 3 small white squares (right side, bottom edge and bottom-right corner). Scrollbars when the canvas does not fit.
5. **Status bar** (28 px), with panels separated by vertical lines:

| Panel | Content | Example (Spanish build) |
|---|---|---|
| 1 (178 px) | ✥ icon + cursor position over the canvas | `447, 156 píxeles` (English: `447, 156px`) |
| 2 (176 px) | ⬚ icon + size of the selection/shape in progress | `181 × 121 píxeles` |
| 3 (176 px) | ▭ icon + image size | `1152 × 648 píxeles` |
| 4 (176 px) | file size on disk (only if saved) | `Tamaño: 4.9KB` (English: `Size: 4.9KB`) |
| 5 | empty | |
| 6 | zoom: `100%` text, **Alejar** (Zoom out, ⊖) button, slider, **Acercar** (Zoom in, ⊕) button | |

Default size of a new image: **1152 × 648** on a 1920 × 1080 display (60% of the screen resolution). White background.

### 1.1 Quick Access Toolbar (QAT)

By default it shows **Guardar** (Save; Alt,1), **Deshacer** (Undo; Alt,2), **Rehacer** (Redo; Alt,3) and the **Personalizar** (Customize) arrow.
Undo/Redo are disabled when there is no history.

![Customize QAT](screenshots/05_qat_personalizar.png)

*Personalizar barra de herramientas de acceso rápido* (Customize Quick Access Toolbar) menu (checkboxes that add/remove buttons):
Nuevo (New) · Abrir (Open) · **Guardar ✔** (Save) · Imprimir (Print) · Vista previa de impresión (Print preview) · Enviar en correo electrónico (Send in email) · **Deshacer ✔** (Undo) · **Rehacer ✔** (Redo) — separator — *Mostrar bajo la Cinta* (Show below the Ribbon; toggles with *Mostrar sobre la Cinta*, Show above the Ribbon) — separator — *Minimizar la Cinta* (Minimize the Ribbon).

- QAT below the ribbon: [44_qat_bajo_la_cinta.png](screenshots/44_qat_bajo_la_cinta.png)
- Minimized ribbon (tab names only; clicking a tab drops the ribbon down over the canvas): [45_cinta_minimizada.png](screenshots/45_cinta_minimizada.png), [46_cinta_minimizada_desplegada.png](screenshots/46_cinta_minimizada_desplegada.png). The `˄` button becomes `˅`.

The QAT configuration is persisted (on Windows, in the registry; see §12).

---

## 2. File menu

![File menu](screenshots/02_menu_archivo.png)

Drop-down panel of 639 × 573 px: left column of commands (270 px, 32 px icons, 47 px rows) and right column **Imágenes recientes** (Recent pictures).
Commands with a `▸` arrow are split buttons: the left part runs the action and the arrow opens a submenu that replaces the recent list.

| Command | KeyTip | Tooltip (translated) | State/notes |
|---|---|---|---|
| Nuevo (New) | Alt,F,N | Creates a new image. | Prompts to save if there are changes |
| Abrir (Open) | Alt,F,A | Opens an existing image. | Prompts to save if there are changes |
| Guardar (Save) | Alt,F,G | Saves the current image. | No file → behaves as Save as |
| Guardar como ▸ (Save as) | Alt,F,O (▸ Alt,F,U) | Saves the current image as a new file. | Format submenu |
| Imprimir ▸ (Print) | Alt,F,M (▸ Alt,F,I) | Select a printer, number of copies and other printing options before printing. Prints the current image. | Submenu |
| Desde escáner o cámara (From scanner or camera) | Alt,F,D | Imports from a scanner or camera. | Disabled when no device |
| Enviar en correo electrónico (Send in email) | Alt,F,V | Sends a copy of the image as an attachment in an email message. | |
| Establecer como fondo de escritorio ▸ (Set as desktop background) | Alt,F,F (▸ Alt,F,C) | Sets the current image as the desktop background. | Disabled if the image is not saved |
| Propiedades (Properties) | Alt,F,E | Changes the image properties. | Opens dialog §8.2 |
| Acerca de Paint (About Paint) | Alt,F,P | — | Dialog §8.4 |
| Salir (Exit) | Alt,F,S | — | Prompts to save if there are changes |

Separators after *Save as*, after *Send in email*, after *Set as desktop background*, after *Properties* and after *About Paint*.

**Imágenes recientes** (Recent pictures): numbered list of files (`prueba.png`, KeyTip Alt,F,1…; tooltip = full path). See [51_menu_archivo_con_archivo.png](screenshots/51_menu_archivo_con_archivo.png).

### 2.1 Save as submenu

![Save as](screenshots/03_archivo_guardar_como.png)

Each option has a 32 px icon, a bold title and a description:

| Option | KeyTip | Description (translated) |
|---|---|---|
| Imagen PNG (PNG picture) | Alt,F,V,P | Save a photo or drawing with high quality and use it on your computer or on the web. |
| Imagen JPG (JPEG picture) | Alt,F,V,J | Save a photo with good quality and use it on your computer, in email or on the web. |
| Imagen BMP (BMP picture) | Alt,F,V,B | Save any kind of picture with high quality and use it on your computer. |
| Imagen GIF (GIF picture) | Alt,F,V,G | Save a simple drawing with lower quality and use it in email or on the web. |
| Otros formatos (Other formats) | Alt,F,V,O | Open the Save As dialog box to select from all possible file types. |

File types in the *Save as* dialog (default **PNG**): Monochrome bitmap (*.bmp;*.dib) · 16-color bitmap · 256-color bitmap · 24-bit bitmap · JPEG (*.jpg;*.jpeg;*.jpe;*.jfif) · GIF (*.gif) · TIFF (*.tif;*.tiff) · PNG (*.png) · HEIC (*.heic).

### 2.2 Print submenu

![Print](screenshots/04_archivo_imprimir.png)

| Option | KeyTip | Description (translated) |
|---|---|---|
| Imprimir (Print) | Alt,F,R,M | (same as Print) |
| Configurar página (Page setup) | Alt,F,R,C | Change the layout of the picture. |
| Vista previa de impresión (Print preview) | Alt,F,R,V | Preview and make changes before printing. |

### 2.3 Set as desktop background submenu

![Background](screenshots/52_archivo_fondo_escritorio.png)

Rellenar (Fill; Alt,F,K,R — *Fills the entire screen with the picture.*) · Mosaico (Tile; Alt,F,K,M — *Use the picture as a tile so it repeats until it fills the entire screen.*) · Centrar (Center; Alt,F,K,C — *Centers the picture in the middle of the screen.*).

---

## 3. Home tab (Inicio)

![Home](screenshots/01_ventana_principal.png)

Groups from left to right (group KeyTip `Alt,H,Z n`). Full tooltips in `msaa/01_ribbon_inicio.txt`.

### 3.1 Clipboard (Portapapeles)
| Control | Type | KeyTip | Tooltip (translated) |
|---|---|---|---|
| **Pegar** (Paste) | large split button (32 px clipboard icon; bottom part `▾`) | Alt,H,V | Paste (Ctrl+V) — Pastes the contents of the Clipboard. |
| Cortar (Cut) | small button | Alt,H,X | Cuts the selection from the canvas and puts it on the Clipboard. |
| Copiar (Copy) | small button | Alt,H,C | Copies the selection from the canvas and puts it on the Clipboard. |

Paste dropdown: **Pegar** (Paste) · **Pegar desde** (Paste from; opens an open-file dialog titled "Pegar desde"). [06_inicio_pegar.png](screenshots/06_inicio_pegar.png)
Cut/Copy are enabled only with a selection; Paste only when the clipboard has content.

### 3.2 Image (Imagen)
| Control | Type | KeyTip | Tooltip (translated) |
|---|---|---|---|
| **Seleccionar** (Select) | large split button | Alt,H,S,E | Selection — Selects a part of a picture. |
| Recortar (Crop) | small | Alt,H,R,P | Crops the picture so it only contains the current selection. (requires a selection) |
| Cambiar tamaño (Resize) | small | Alt,H,R,E | Resizes or skews the picture or selection. |
| Girar ▾ (Rotate) | small dropdown | Alt,H,R,O | Rotates or flips the picture or selection. |

![Select](screenshots/07_inicio_seleccionar.png)

**Select** dropdown with two headers:
- *Formas de selección* (Selection shapes): **Selección rectangular** (Rectangular selection) · **Selección de forma libre** (Free-form selection) (the chosen one changes the button's icon).
- *Opciones de selección* (Selection options): **Seleccionar todo** (Select all) · **Invertir selección** (Invert selection) · **Eliminar** (Delete) · **Selección transparente** (Transparent selection; checkbox; makes Color 2 transparent when moving/pasting the selection).

![Rotate](screenshots/08_inicio_girar.png)

**Rotate** dropdown: Girar 90° a la derecha (Rotate right 90°) · Girar 90° a la izquierda (Rotate left 90°) · Girar 180° (Rotate 180°) · Voltear verticalmente (Flip vertical) · Voltear horizontalmente (Flip horizontal). Applies to the selection if there is one; otherwise to the whole image.

### 3.3 Tools (Herramientas) (3 × 2 grid of 24 px buttons)
| Tool | KeyTip | Tooltip (translated) |
|---|---|---|
| Lápiz (Pencil) | Alt,H,P,1 | Draws a free-form line with the selected line width. |
| Relleno con color (Fill with color) | Alt,H,K | Click an area on the canvas to fill it with the foreground color, or right-click to fill it with the background color. |
| Texto (Text) | Alt,H,T | Inserts text into the picture. |
| Borrador (Eraser) | Alt,H,E,R | Erases part of the picture and replaces it with the background color. |
| Selector de color (Color picker) | Alt,H,D | Picks a color from the picture and uses it for drawing. |
| Lupa (Magnifier) | Alt,H,M | Changes the magnification of a part of the picture. |

The active tool is marked with a light blue background and a blue border (`pressed` state). Default tool on startup: **Pinceles** (Brushes; the Pincel/Brush).

### 3.4 Brushes (Pinceles)
Large split button **Pinceles** (Brushes; Alt,H,B; tooltip *Draws with different kinds of brushes.*). The button's icon reflects the chosen brush.

![Brushes](screenshots/09_inicio_pinceles.png)

4-column gallery (43 × 43 cells): Pincel (Brush) · Pincel caligráfico 1 (Calligraphy brush 1) · Pincel caligráfico 2 (Calligraphy brush 2) · Aerógrafo (Airbrush) · Pincel para óleo (Oil brush) · Crayón (Crayon) · Marcador (Marker) · Lápiz natural (Natural pencil) · Pincel para acuarela (Watercolor brush).

### 3.5 Shapes (Formas)
Inline gallery (7 columns × 3 visible rows of 21 × 21 icons, with up/down arrows and a `▾` button to expand) — Alt,H,S,H; tooltip *Inserts ready-made shapes such as rectangles, circles, triangles, arrows, stars and callouts.*

![Shapes gallery](screenshots/10_inicio_formas_galeria.png)

23 shapes in this order: Línea (Line) · Curva (Curve) · Elipse (Oval) · Rectángulo (Rectangle) · Rectángulo redondeado (Rounded rectangle) · Polígono (Polygon) · Triángulo (Triangle) · Triángulo rectángulo (Right triangle) · Rombo (Diamond) · Pentágono (Pentagon) · Hexágono (Hexagon) · Flecha derecha (Right arrow) · Flecha izquierda (Left arrow) · Flecha arriba (Up arrow) · Flecha abajo (Down arrow) · Estrella de cuatro puntas (Four-point star) · Estrella de cinco puntas (Five-point star) · Estrella de seis puntas (Six-point star) · Llamada rectangular redondeada (Rounded rectangular callout) · Llamada de elipse (Oval callout) · Llamada de nube (Cloud callout) · Corazón (Heart) · Rayo (Lightning).

Next to it, two dropdowns (enabled only while a shape is active — [13_inicio_forma_activa.png](screenshots/13_inicio_forma_activa.png)):

| Contorno ▾ (Outline; Alt,H,O) — *Selects the medium for the shape outline.* | Rellenar ▾ (Fill; Alt,H,I) — *Selects the medium for the shape fill.* |
|---|---|
| Sin contorno (No outline) · **Color sólido** (Solid color; default) · Crayón (Crayon) · Marcador (Marker) · Óleo (Oil) · Lápiz natural (Natural pencil) · Acuarela (Watercolor) | **Sin relleno** (No fill; default) · Color sólido (Solid color) · Crayón (Crayon) · Marcador (Marker) · Óleo (Oil) · Lápiz natural (Natural pencil) · Acuarela (Watercolor) |

![Outline](screenshots/14_inicio_contorno.png) ![Fill](screenshots/15_inicio_rellenar.png)

The outline uses **Color 1** and the fill uses **Color 2**. (The Pencil tool leaves Outline/Fill disabled; Line and Curve only allow Outline.)

### 3.6 Size (Tamaño)
Large **Tamaño ▾** (Size) button (Alt,H,S,Z; *Selects the width for the selected tool.*), icon of 3 lines of increasing thickness. List of 4 widths (140 × 43 rows, each drawing the line). [11_inicio_tamano_pincel.png](screenshots/11_inicio_tamano_pincel.png)

| Tool | Options | Selected on the analysis machine |
|---|---|---|
| Pencil | 1, 2, 3, 4 px | 1 px |
| Eraser | 4, 6, 8, 10 px | 8 px |
| Brush | 1, 3, 5, 8 px | 3 px |
| Calligraphy brush 1 and 2 | 3, 5, 8, 10 px | 5 px |
| Airbrush | 4, 8, 16, 24 px | 8 px |
| Oil, Crayon, Marker, Watercolor | 8, 16, 30, 40 px | 30 px |
| Natural pencil | 4, 6, 8, 10 px | 4 px |
| Shapes | 1, 3, 5, 8 px | (last used) |
| Fill with color, Text, Color picker, Magnifier, Selection | — (Size disabled) | |

Each tool remembers its last size.

### 3.7 Colors (Colores)

| Control | KeyTip | Tooltip (translated) |
|---|---|---|
| **Color 1** (32 px swatch) | Alt,H,1 | Click here and then select a color from the color palette. This color is used with the pencil and with brushes, as well as for shape outlines. |
| **Color 2** | Alt,H,2 | … This color is used with the eraser and for shape fills. |
| Palette (10 × 3) | Alt,H,Y | 20 px cells with a border; tooltip = color name |
| **Editar colores** (Edit colors; rainbow icon) | Alt,H,E,C | Selects a color from the color palette. |

Color 1 / Color 2 are toggles: the active one (blue border) receives the color when a palette cell is clicked. Defaults: Color 1 = black, Color 2 = white.

**Default palette** (measured in pixels; names = Spanish tooltips, English Paint name in parentheses):

| | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 |
|---|---|---|---|---|---|---|---|---|---|---|
| Row 1 | Negro (Black) `#000000` | Gris-50% (Gray-50%) `#7F7F7F` | Rojo oscuro (Dark red) `#880015` | Rojo (Red) `#ED1C24` | Naranja (Orange) `#FF7F27` | Amarillo (Yellow) `#FFF200` | Verde (Green) `#22B14C` | Turquesa (Turquoise) `#00A2E8` | Añil (Indigo) `#3F48CC` | Morado (Purple) `#A349A4` |
| Row 2 | Blanco (White) `#FFFFFF` | Gris-25% (Gray-25%) `#C3C3C3` | Marrón (Brown) `#B97A57` | Rosado (Rose) `#FFAEC9` | Dorado (Gold) `#FFC90E` | Amarillo claro (Light yellow) `#EFE4B0` | Lima (Lime) `#B5E61D` | Turquesa claro (Light turquoise) `#99D9EA` | Azul grisáceo (Blue-gray) `#7092BE` | Lavanda (Lavender) `#C8BFE7` |
| Row 3 | 10 empty slots for custom colors (filled from *Edit colors → OK*, pushing existing ones to the right) |

### 3.8 Edit with Paint 3D (Editar con Paint 3D)
Large button (Alt,H,P,3; *Try the advanced editing tools or turn this picture into 3D.*). Opens Paint 3D. It has no equivalent on the web (see §13).

### 3.9 Ribbon states by context
- **With an active selection** ([22_seleccion_rectangular.png](screenshots/22_seleccion_rectangular.png)): Cut, Copy and Crop become enabled; Size becomes disabled.
- **With an active shape**: Outline and Fill become enabled; the shape is highlighted in the gallery.

---

## 4. View tab (Ver)

![View](screenshots/16_pestana_ver.png)

| Group | Control | KeyTip | Tooltip (translated) |
|---|---|---|---|
| Zoom | Acercar (Zoom in) | Alt,V,I | Zooms in on the current picture. |
| | Alejar (Zoom out) | Alt,V,O | Zooms out of the current picture. |
| | 100% | Alt,V,M | Zoom to 100%. |
| Mostrar u ocultar (Show or hide) | ☐ Reglas (Rulers) | Alt,V,R | View and use rulers to line up and measure objects in the picture. |
| | ☐ Cuadrícula (Gridlines) | Alt,V,G | View and use gridlines to align objects in the picture. |
| | ☑ Barra de estado (Status bar) | Alt,V,S | Shows or hides the status bar at the bottom of the window. |
| Pantalla (Display) | Pantalla completa (Full screen) | Alt,V,F | View the picture in full screen. |
| | Miniatura (Thumbnail) | Alt,V,T | Shows or hides the thumbnail window. (Disabled if the whole image fits in the window) |

**Zoom levels** measured: *Zoom in* 100 → 200 → 300 → 400 → 500 → 600 → 700 → **800%** (maximum). *Zoom out* 100 → 50 → 25 → **12.5%** (minimum, displayed as `12.50%`). The status bar slider covers 12.5%–800%.

**Rulers**: horizontal ruler above and vertical ruler to the left of the canvas, numbers every 100 px (at 100%) with ticks every 10 px; a red line marks the cursor position on each ruler. [35_ver_reglas_cuadricula_100.png](screenshots/35_ver_reglas_cuadricula_100.png)

**Gridlines**: at 100% a dotted grid every 10 px; at 400% or more, one line per pixel. [36_ver_reglas_cuadricula_400.png](screenshots/36_ver_reglas_cuadricula_400.png)

**Thumbnail**: 120 × 120 px floating window titled "Miniatura" (Thumbnail) with the whole image scaled down, over the top-left of the work area. [37_ver_miniatura.png](screenshots/37_ver_miniatura.png)

**Full screen**: the image at 100% centered on a black background, with no UI; any click or key exits. [38_pantalla_completa.png](screenshots/38_pantalla_completa.png)

---

## 5. Contextual tab "Herramientas de texto › Texto" (Text Tools › Text)

Appears when a text box is created with the Text tool (light green header above the tab, tab row with a green line). It is selected automatically.

![Text](screenshots/19_texto_pestana_contextual.png)

| Group | Controls |
|---|---|
| Portapapeles (Clipboard) | Pegar (Paste; Alt,T,P,1), Cortar (Cut; Alt,T,X), Copiar (Copy; Alt,T,C) — act on the selected text |
| Fuente (Font) | **Familia de fuentes** (Font family) combo box (Alt,T,F,F; default *Calibri*) · **Tamaño de fuente** (Font size; Alt,T,F,S; default *11*) · **Negrita** (Bold; Alt,T,F,B; localized icon **N**, English **B**) · **Cursiva** (Italic; Alt,T,F,I; icon **K**, English **I**) · **Subrayado** (Underline; Alt,T,F,U; icon **S**, English **U**) · **Tachado** (Strikethrough; Alt,T,F,X; icon ~~abc~~) |
| Fondo (Background) | **Opaco** (Opaque; Alt,T,O; fills the box with Color 2) · **Transparente** (Transparent; Alt,T,T; default) — mutually exclusive |
| Colores (Colors) | Color 1, Color 2, palette, Edit colors (same as in Home) |
| | Editar con Paint 3D (Edit with Paint 3D) |

- Font size list: 8, 9, 10, 11, 12, 14, 16, 18, 20, 22, 24, 26, 28, 36, 48, 72 (a value can also be typed). [20_texto_tamano_fuente.png](screenshots/20_texto_tamano_fuente.png)
- Font family list: all installed fonts, each name rendered in its own font, with a **Mostrar más fuentes** (Show more fonts) link at the bottom and a resize grip. [21_texto_familia_fuente.png](screenshots/21_texto_familia_fuente.png)
- The text box is a rectangle with a dashed border and 8 handles; the text uses Color 1. It is **rich text**: font, size and styles apply to the **selected text** inside the box (verified: [57_verif_texto_formato_parcial.png](screenshots/57_verif_texto_formato_parcial.png), only "Mundo" in bold) or, with no selection, to what is typed next.
- **Esc** with the box open **discards** the text; clicking outside or switching tools **commits** it to the canvas.

---

## 6. Print Preview (Vista previa de impresión)

![Print Preview](screenshots/34_vista_previa_impresion.png)

Replaces all tabs with **Vista previa de impresión** (Print Preview; Alt,P):

| Group | Controls |
|---|---|
| Imprimir (Print) | Imprimir (Print; Alt,P,P) · Configurar página (Page setup; Alt,P,S) |
| Zoom | Acercar (Zoom in; Alt,P,I) · Alejar (Zoom out; Alt,P,O) · Una página (One page; Alt,P,1) · Dos páginas (Two pages; Alt,P,2) |
| Vista previa (Preview) | Página anterior (Previous page; Alt,P,V) · Página siguiente (Next page; Alt,P,N) |
| | **Cerrar vista previa de impresión** (Close print preview; Alt,P,C) |

The work area shows the sheet (A4 landscape by default) with the image and a shadow.

---

## 7. Canvas context menu

Right-click on a selection:

![Context menu](screenshots/24_menu_contextual_girar.png)

| Item | Access key (Spanish build) | Notes |
|---|---|---|
| Cortar (Cut) | O | |
| Copiar (Copy) | C | |
| Pegar (Paste) | P | disabled if the clipboard is empty |
| — | | |
| Recortar (Crop) | R | |
| Seleccionar todo (Select all) | S | |
| Invertir selección (Invert selection) | I | |
| Eliminar (Delete) | E | |
| — | | |
| Girar ▸ (Rotate) | G | Girar 90° a la derecha (Rotate right 90°) · Girar 90° a la izquierda (Rotate left 90°) · Girar 180° (Rotate 180°; G) · Voltear verticalmente (Flip vertical; V) · Voltear horizontalmente (Flip horizontal; H) |
| Cambiar tamaño (Resize) | C | opens §8.1 |
| Invertir color (Invert color) | V | inverts the colors of the selection |

With drawing tools, right-click does not open a menu: it draws with Color 2.

---

## 8. Dialogs

All dialogs are modal, with background `#F0F0F0`, Segoe UI 9 pt font, and Aceptar/Cancelar (OK/Cancel) buttons at the bottom right. Exact layout (dialog units) in `resources/dialogos_es.txt`.

### 8.1 Resize and Skew — "Cambiar de tamaño y sesgar" (Ctrl+W)
![Resize](screenshots/25_dialogo_cambiar_tamano.png)

- **Cambiar tamaño** (Resize) group: `Por:` (By:) ◉ Porcentaje (Percentage) ○ Píxeles (Pixels) · Horizontal [100] (↔ icon) · Vertical [100] (↕ icon) · ☑ Mantener relación de aspecto (Maintain aspect ratio).
- **Sesgar (grados)** (Skew (Degrees)) group: Horizontal [0] · Vertical [0] (parallelogram icons).
- OK / Cancel. Applies to the selection if one exists; otherwise to the image.

### 8.2 Image Properties — "Propiedades de la imagen" (Ctrl+Shift+E in the Spanish build; Ctrl+E in English Paint)
![Properties](screenshots/26_dialogo_propiedades.png) ![Properties with file](screenshots/53_dialogo_propiedades_con_archivo.png)

- **Atributos de archivo** (File attributes): Guardado por última vez (Last saved; `No disponible` (Not available) or a date such as `22/10/2026 9:20`) · Tamaño en disco (Size on disk; `4.9KB`) · Resolución (Resolution; `106 PPP` = `106 DPI`, the screen DPI).
- **Unidades** (Units): ○ Pulgadas (Inches) ○ Centímetros (Centimeters) ◉ Píxeles (Pixels).
- **Colores** (Colors): ○ Blanco y negro (Black and white) ◉ Color.
- Ancho (Width) [1152] · Alto (Height) [648] · **Predeterminado** (Default) button · OK / Cancel. Changing Width/Height resizes the **canvas** (no scaling): shrinking crops from the right/bottom and enlarging fills the new area with **Color 2** (verified: [55_verif_lienzo_ampliado_color2.png](screenshots/55_verif_lienzo_ampliado_color2.png)).

### 8.3 Edit Colors (Editar colores)
![Edit Colors](screenshots/27_dialogo_editar_colores.png)

Standard Windows dialog (ChooseColor), which Paint opens **already expanded**:
- **Colores básicos** (Basic colors) 8 × 6:
  ```
  #FF8080 #FFFF80 #80FF80 #00FF80 #80FFFF #0080FF #FF80C0 #FF80FF
  #FF0000 #FFFF00 #80FF00 #00FF40 #00FFFF #0080C0 #8080C0 #FF00FF
  #804040 #FF8040 #00FF00 #008080 #004080 #8080FF #800040 #FF0080
  #800000 #FF8000 #008000 #008040 #0000FF #0000A0 #800080 #8000FF
  #400000 #804000 #004000 #004040 #000080 #000040 #400040 #400080
  #000000 #808000 #808040 #808080 #408080 #C0C0C0 #400040 #FFFFFF
  ```
- **Colores personalizados** (Custom colors) 8 × 2 (empty).
- *Definir colores personalizados >>* (Define Custom Colors >>) button (disabled because the dialog is already expanded).
- Right panel: **hue (horizontal) × saturation (vertical)** box with a crosshair, vertical **luminosity** bar with a ◀ arrow, **Color|Sólido** (Color|Solid) swatch, **Matiz / Sat. / Lum.** (Hue / Sat / Lum; range 0–240) and **Rojo / Verde / Azul** (Red / Green / Blue; 0–255) fields, and the *Agregar a los colores personalizados* (Add to Custom Colors) button.
- OK assigns the color to the active Color 1 or 2 and adds it to the palette's custom-colors row.

### 8.4 About Paint (Acerca de Paint)
![About](screenshots/28_dialogo_acerca_de.png)
Windows 10 logo, Paint icon, OS version, legal notice, license to the user's name, and OK. In the replica it should be replaced with an "About paint.cat" dialog.

### 8.5 Unsaved changes prompt
![Prompt](screenshots/30_aviso_guardar_cambios.png)
Title "Paint", text **¿Desea guardar los cambios de Sin título?** (Do you want to save changes to Untitled?; or to the file name), buttons **Guardar** (Save; default) · **No guardar** (Don't Save) · **Cancelar** (Cancel). Shown on New, Open, Exit and when closing the window.

### 8.6 Page Setup (Configurar página)
![Page Setup](screenshots/32_dialogo_configurar_pagina.png)
Sheet preview on the left · **Papel** (Paper): Tamaño (Size; A4), Origen (Source; disabled) · **Orientación** (Orientation): ○ Vertical (Portrait) ◉ Horizontal (Landscape) · **Márgenes (milímetros)** (Margins (millimeters)): Izquierdo (Left), Derecho (Right), Superior (Top), Inferior (Bottom) = 12.7 · **Centrado** (Centering): ☐ Horizontal ☐ Vertical · **Escala** (Scaling): ○ Ajustar al [100] % del tamaño normal (Adjust to [100]% normal size) / ◉ Ajustar a [1] por [1] página(s) (Fit to [1] by [1] page(s)).

### 8.7 System dialogs
- **Imprimir** (Print; [33_dialogo_imprimir.png](screenshots/33_dialogo_imprimir.png)): standard Windows print dialog (General tab, printer list, page range, copies).
- **Guardar como** (Save as; [29](screenshots/29_dialogo_guardar_como.png)), **Abrir** (Open; [54](screenshots/54_dialogo_abrir.png)) and **Pegar desde** (Paste from; [31](screenshots/31_dialogo_pegar_desde.png)): standard file dialogs.
  - Open/Paste from filters: *Todos los archivos de imagen* (All picture files; default) · Bitmap files (*.bmp, *.dib) · JPEG · GIF · TIFF · PNG · ICO (*.ico) · HEIC (*.heic) · WEBP (*.webp).

---

## 9. Canvas visual states

| State | Screenshot | Description |
|---|---|---|
| Freshly drawn shape (editable) | [18_forma_en_edicion.png](screenshots/18_forma_en_edicion.png) | Blue dashed rectangle with 8 handles; it can be moved/resized and its outline, fill, width and colors changed until the user clicks outside. The status bar shows the shape's size. |
| Text box | [19](screenshots/19_texto_pestana_contextual.png) | Grey dashed border with 8 handles. |
| Rectangular selection | [22_seleccion_rectangular.png](screenshots/22_seleccion_rectangular.png) | Blue dashed rectangle (static "marching ants") with 8 handles for scaling. |
| Free-form selection | [47_seleccion_forma_libre.png](screenshots/47_seleccion_forma_libre.png) | While dragging, the stroke is visible; on release, the bounding rectangle with handles remains. |
| Moved selection | [48_seleccion_movida.png](screenshots/48_seleccion_movida.png) | **The hole left by the selection is filled with Color 2** (yellow here). |
| KeyTips | [39_keytips_alt.png](screenshots/39_keytips_alt.png), [40_keytips_alt_h.png](screenshots/40_keytips_alt_h.png), [02b](screenshots/02b_menu_archivo_keytips.png) | Pressing Alt shows square labels with the letter; Alt,H shows those of Home. |
| Rich tooltips | [41](screenshots/41_tooltip_relleno.png), [42](screenshots/42_tooltip_pegar.png), [43](screenshots/43_tooltip_pinceles.png) | 275 px wide box below the ribbon: bold title + description. They appear after ~1 s of hover. |

---

## 10. Keyboard shortcuts

**Shortcuts are localized in the Spanish build** and differ from the English version (e.g. Ctrl+A = Open, Ctrl+G = Save, Ctrl+E = Select all, F4 = Redo; English Paint uses Ctrl+O, Ctrl+S, Ctrl+A and Ctrl+Y, plus Ctrl+E for Properties and Ctrl+G for Gridlines). Source: the `RT_ACCELERATOR` table of `es-ES\mspaint.exe.mui` (`resources/aceleradores.txt`); ✔ = verified by pressing it in Paint, ◇ = per the table. The "English Paint" column is the standard English build's shortcut, given for reference (not verified on this machine).

| Shortcut (Spanish build) | Action | | English Paint |
|---|---|---|---|
| Ctrl+N | New | ✔ | Ctrl+N |
| Ctrl+A | Open | ✔ | Ctrl+O |
| Ctrl+G | Save (with no file, opens Save as) | ✔ | Ctrl+S |
| F12 | Save as | ✔ | F12 |
| Ctrl+P | Print | ✔ | Ctrl+P |
| Ctrl+Z · Alt+Backspace | Undo | ✔ · ◇ | Ctrl+Z |
| **F4** | Redo (Ctrl+Y does **not** work) | ✔ | Ctrl+Y |
| Ctrl+X · Shift+Delete | Cut | ◇ | Ctrl+X |
| Ctrl+C · Ctrl+Insert | Copy | ◇ | Ctrl+C |
| Ctrl+V · Shift+Insert | Paste | ◇ | Ctrl+V |
| Delete | Delete the selection | ◇ | Delete |
| **Ctrl+E** | Select all | ◇ | Ctrl+A |
| Ctrl+Shift+X | Crop | ◇ | Ctrl+Shift+X |
| Ctrl+Shift+I | Invert color | ◇ | Ctrl+Shift+I |
| Ctrl+W | Resize and Skew | ✔ | Ctrl+W |
| **Ctrl+Shift+E** | Image Properties | ✔ | Ctrl+E |
| Ctrl+R | Show/hide Rulers | ✔ | Ctrl+R |
| **Ctrl+D** | Show/hide Gridlines | ✔ | Ctrl+G |
| Ctrl+PgUp / Ctrl+PgDn | Zoom in / Zoom out | ✔ | Ctrl+PgUp / Ctrl+PgDn |
| F11 | Full screen | ✔ | F11 |
| Ctrl+`+` / Ctrl+`−` (numeric keypad) | Increase / decrease width | ✔ | Ctrl+`+` / Ctrl+`−` |
| Ctrl+B / Ctrl+I / Ctrl+U | Bold / Italic / Underline (in a text box) | ◇ | Ctrl+B / Ctrl+I / Ctrl+U |
| PgUp / PgDn | Scroll up / down | ◇ | |
| Shift+PgUp / Shift+PgDn / Shift+Home / Shift+End | Horizontal scrolling | ◇ | |
| Esc | Cancel the current operation / clear the selection / discard text | ✔ (text) | Esc |
| Ctrl+Shift+N | No visible effect (command 50021) | ✔ | |
| Alt or F10 | Show KeyTips (then letters; see the KeyTip columns in this document) | ✔ (Alt) | Alt or F10 |

In the web version for Mac, `⌘` should be accepted as well as `Ctrl` and, optionally, the English shortcuts (`⌘O`, `⌘S`, `⌘Y`…) that a Mac user will expect should be added.

---

## 11. Tool behavior

Observed during the analysis (✔) or known from Windows 7/10 Paint and pending verification during implementation (○):

- ✔ Left click draws with **Color 1**; right click with **Color 2** (pencil, brushes, shapes, fill, opaque text).
- ✔ Moving a selection leaves the hole filled with Color 2 (except with *Transparent selection*, which also makes Color 2 inside the selection transparent).
- ✔ Esc discards a text box being edited.
- ✔ Each tool remembers its width; the active tool when Paint opens is **Brushes** (Brush).
- ✔ **Undo: 50 levels** (after 60 actions, the Undo button becomes disabled after 50 undos).
- ✔ **Ctrl + `+` / Ctrl + `−`** (numeric keypad) increase/decrease the active tool's width, cycling through its 4 values (pencil 1→2→3→4 px).
- ✔ **Eraser**: left click paints Color 2 over everything; **right-click dragging replaces only Color 1 pixels with Color 2** (verified: [56_verif_borrador_reemplazo_color.png](screenshots/56_verif_borrador_reemplazo_color.png)).
- ✔ **Color picker**: after picking a color it automatically returns to the previous tool. ○ Left click → Color 1, right click → Color 2.
- ✔ Enlarging the canvas (Properties or handles) fills the new area with Color 2.
- ○ **Fill with color**: flood fill of pixels of the exact same color (no tolerance, 4-connected).
- ○ **Magnifier**: shows a rectangle of the area to magnify; left click zooms in, right click zooms out.
- ○ **Pencil**: 1–4 px stroke without antialiasing.
- ○ **Shapes**: Shift constrains to a 1:1 ratio (circle, square) and lines to multiples of 45°. *Polygon*: click per vertex, double click closes. *Curve*: draw a line, then two clicks/drags bend the curve.
- ○ **Selection**: dragging moves; Ctrl+drag copies; Shift+drag leaves a trail; the handles scale.
- ○ **Ctrl+wheel** changes the zoom.
- ○ Canvas handles: resize the canvas while showing the size in the status bar.
- ○ Text and strokes of the artistic brushes (oil, crayon, watercolor, natural pencil, marker) have their own texture/transparency; the airbrush sprays random dots within a circle while the button is held down.

---

## 12. Persistent settings (registry → `localStorage`)

Paint stores its preferences in `HKCU\Software\Microsoft\Windows\CurrentVersion\Applets\Paint`:

| Subkey | Relevant values | Web equivalent |
|---|---|---|
| `View` | `ShowRulers`, `ShowGrid`, `ShowStatusBar`, `ShowThumbnail`, `WindowPlacement`, `UnitSetting`, `BMPWidth/BMPHeight` | view preferences |
| `Text` | `TypeFaceName`, `PointSize`, `Bold`, `Italic`, `Underline`, `Strikeout`, `TextPen` (opaque) | last text formatting |
| `Ribbon` | `QatItems` (XML: QAT buttons, position, minimized ribbon) | QAT and ribbon configuration |
| `Recent File List` | recent files | recent list (on the web: File System Access handles or thumbnails in IndexedDB) |
| `Settings`, `Keyboard` | other settings | |

(The key was backed up during the analysis and restored afterwards.)

---

## 13. Notes for the web version (Mac)

- **Shortcuts**: accept both `Ctrl` and `⌘` as the primary modifier.
- **Files**: Open/Save via `<input type=file>` + download, or the File System Access API where available (Chrome/Edge). PNG/JPG/BMP/GIF can be encoded in the browser (BMP and GIF need a custom encoder); TIFF/HEIC are optional.
- **Clipboard**: Async Clipboard API for images (PNG).
- **Print**: `window.print()` with a print stylesheet that honors Page Setup.
- **No direct equivalent**: *From scanner or camera* (could use `getUserMedia`), *Send in email* (could share via the Web Share API), *Set as desktop background* (download only), *Edit with Paint 3D* and *Help* (link to our own page). Decide whether to show them disabled or adapt them.
- **Fonts**: the font family list will depend on the fonts available in the browser (Local Font Access API or a fixed list).
- **Look**: reproduce the Windows 10 ribbon (Segoe UI 9 pt font → on Mac use a `"Segoe UI", system-ui, sans-serif` stack), with the colors and measurements in this document.
- **Icons and cursors**: those in `resources/` are Microsoft property; they serve as a local visual reference, but they would have to be redrawn to publish the website.

---

## 14. Extracted internal resources (`resources/`)

Extracted from `mspaint.exe` and `es-ES\mspaint.exe.mui` without running Paint. Full details in [resources/LEEME.md](resources/LEEME.md) (in Spanish). **They are © Microsoft: local reference only, do not publish.**

| Resource | Contents | Use in the replica |
|---|---|---|
| `ribbon_comandos.txt` | 116 ribbon commands with label, tooltip, description, KeyTip, per-DPI images and English symbolic name (`cmdFileNew`, `cmdToolsPencilCommand`…) | Master command table; the English names serve as identifiers in the code |
| `ribbon_estructura.txt` | Tab → group → control tree, QAT, File menu and context menus (heuristic reconstruction) | UI structure |
| `imagenes/` | 580 ribbon icons (16/32 px and DPI variants), 63 from the brushes gallery, 92 shapes, 12 sizes, 36 outline/fill styles, 16 greyscale brush textures | Reference icons and textures for the artistic brushes |
| `cursores/` | 18 cursors × 2 sizes (32 and 48 px) with their hotspot; summary sheet `cursores/_hoja_cursores.png` | CSS cursors per tool (table below) |
| `iconos/` | 40 icons (`.ico` + PNG) | Favicon / dialog icons |
| `dialogos_es.txt` | Exact templates (dialog units) for Properties, Resize and Skew, Page Setup and the preview bar | Laying out the dialogs |
| `dialogo_editar_colores_comdlg32_es.txt` | Template of the standard Windows color picker | Laying out Edit Colors |
| `cadenas_es.txt` | 596 UI strings | UI texts and error messages |
| `aceleradores.txt` | 38 shortcuts | §10 |
| `paleta.txt` | Default palette (it lives in the code, not in the resources) + secondary tables | §3.7 |
| `identificadores_en.txt` | id → English symbol → Spanish label, and tool class names (`CFreehandTool`, `CAirBrushTool`…) | Module names |

**Cursors by tool** (ids of `resources/cursores/cursor_<id>.cur`, 32 px; the next id is the 48 px version):

| Cursor | id (hotspot) | Cursor | id (hotspot) |
|---|---|---|---|
| Move selection | 9263 (11,11) | Magnifier | 9275 (5,5) |
| Dotted crosshair (select) | 9265 (9,9) | Magnifier + / Magnifier − | 9295 / 9297 (5,5) |
| Crosshair with center (shapes, lines) | 9267 (10,10) | Airbrush | 9285 (8,21) |
| Eyedropper (color picker) | 9269 (0,14) | Thick crosshair (brushes) | 9287 (9,9) |
| Bucket (fill) | 9271 (1,12) | Thin crosshair with circle | 9289 (10,10) |
| Pencil | 9273 (0,15) | Text cursor (I-beam) | 9293 (3,16) |
| Resize ↘ / ↗ / ↔ / ↕ | 9277 / 9279 / 9281 / 9283 | Move (variant) | 9291 (11,11) |

The exact cursor ↔ tool mapping (especially for the crosshairs) is a visual identification made by the subagent; verify it during implementation by hovering over the canvas with each tool. The eraser has no cursor of its own: Paint draws a square the size of the eraser.

**Other findings from the resources**:
- Default text font in the Spanish build: Calibri 11 pt.
- Paint has a **keyboard drawing mode** (accessibility): arrows to move, Space to activate, Shift to go faster, Ctrl to scroll, Ctrl+Space to confirm, Esc to cancel and Tab to cycle through control points. Optional in the replica.
- Never-released brush icons ("Glitter", "Sketch"…): they are not part of the real UI; ignore them.
- The tooltips mention Ctrl+Y for Redo, but pressing it in this Paint does not redo (verified); F4 does.

---

## 15. Screenshot index

| # | File | What it shows |
|---|---|---|
| 01 | `01_ventana_principal.png` | Full window, Home tab |
| 02 | `02_menu_archivo.png` / `02b_menu_archivo_keytips.png` | File menu (without and with KeyTips) |
| 03 | `03_archivo_guardar_como.png` | Save as submenu |
| 04 | `04_archivo_imprimir.png` | Print submenu |
| 05 | `05_qat_personalizar.png` | Customize QAT menu |
| 06 | `06_inicio_pegar.png` | Paste dropdown |
| 07 | `07_inicio_seleccionar.png` | Select dropdown |
| 08 | `08_inicio_girar.png` | Rotate dropdown |
| 09 | `09_inicio_pinceles.png` | Brushes gallery |
| 10 | `10_inicio_formas_galeria.png` | Expanded shapes gallery |
| 11 | `11_inicio_tamano_pincel.png` | Size dropdown (brush) |
| 13 | `13_inicio_forma_activa.png` | Ribbon with an active shape |
| 14 | `14_inicio_contorno.png` | Outline dropdown |
| 15 | `15_inicio_rellenar.png` | Fill dropdown |
| 16 | `16_pestana_ver.png` | View tab |
| 18 | `18_forma_en_edicion.png` | Editable shape with handles |
| 19 | `19_texto_pestana_contextual.png` | Text tab + text box |
| 20 | `20_texto_tamano_fuente.png` | Font size list |
| 21 | `21_texto_familia_fuente.png` | Font list |
| 22 | `22_seleccion_rectangular.png` | Rectangular selection |
| 23 | `23_menu_contextual_seleccion.png` | Context menu |
| 24 | `24_menu_contextual_girar.png` | Context menu › Rotate |
| 25 | `25_dialogo_cambiar_tamano.png` | Resize and Skew |
| 26 | `26_dialogo_propiedades.png` | Properties (no file) |
| 27 | `27_dialogo_editar_colores.png` | Edit Colors |
| 28 | `28_dialogo_acerca_de.png` | About Paint |
| 29 | `29_dialogo_guardar_como.png` | Save as (system) |
| 30 | `30_aviso_guardar_cambios.png` | Save changes prompt |
| 31 | `31_dialogo_pegar_desde.png` | Paste from |
| 32 | `32_dialogo_configurar_pagina.png` | Page Setup |
| 33 | `33_dialogo_imprimir.png` | Print (system) |
| 34 | `34_vista_previa_impresion.png` | Print Preview |
| 35 | `35_ver_reglas_cuadricula_100.png` | Rulers + gridlines at 100% |
| 36 | `36_ver_reglas_cuadricula_400.png` | Rulers + gridlines at 400% |
| 37 | `37_ver_miniatura.png` | Thumbnail window |
| 38 | `38_pantalla_completa.png` | Full screen |
| 39 | `39_keytips_alt.png` | KeyTips (Alt) |
| 40 | `40_keytips_alt_h.png` | Home KeyTips (Alt, H) |
| 41–43 | `41_tooltip_relleno.png`, `42_tooltip_pegar.png`, `43_tooltip_pinceles.png` | Tooltips |
| 44 | `44_qat_bajo_la_cinta.png` | QAT below the ribbon |
| 45–46 | `45_cinta_minimizada.png`, `46_cinta_minimizada_desplegada.png` | Minimized ribbon |
| 47 | `47_seleccion_forma_libre.png` | Free-form selection |
| 48 | `48_seleccion_movida.png` | Moved selection (hole filled with Color 2) |
| 50 | `50_imagen_abierta.png` | Opened image (title and status bar with file size) |
| 51 | `51_menu_archivo_con_archivo.png` | File menu with recent pictures |
| 52 | `52_archivo_fondo_escritorio.png` | Set as desktop background submenu |
| 53 | `53_dialogo_propiedades_con_archivo.png` | Properties with a saved file |
| 54 | `54_dialogo_abrir.png` | Open (system) |
| 55 | `55_verif_lienzo_ampliado_color2.png` | Verification: canvas enlarged to 600 px fills with Color 2 |
| 56 | `56_verif_borrador_reemplazo_color.png` | Verification: eraser with right click (left) vs. left click (right) |
| 57 | `57_verif_texto_formato_parcial.png` | Verification: bold applied only to the selected word |

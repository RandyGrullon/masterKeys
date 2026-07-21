"""Genera los dos PDFs del plan de piano usando Edge headless.

  python build_pdf.py

Salida:
  pdf/Piano-Speedrun-Plan.pdf   -> plan completo, A4 vertical
  pdf/Piano-Atril.pdf           -> cheat sheet, A4 horizontal, para el atril
"""

import re
import subprocess
import sys
import tempfile
import time
from pathlib import Path

import markdown

ROOT = Path(__file__).parent
ASSETS = ROOT / "assets"
BUILD = ROOT / "build"
PDF = ROOT / "pdf"
EDGE = Path(r"C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe")


def load_svg(name, scale_text=1.0):
    """Lee un SVG y lo adapta a papel: gris claro -> gris oscuro legible."""
    svg = (ASSETS / name).read_text(encoding="utf-8")
    svg = svg.replace("#8a8a8a", "#333333")  # trazos y texto, legibles impresos
    svg = re.sub(r'^<\?xml[^>]*\?>\s*', "", svg)
    # que escale al ancho del contenedor
    svg = svg.replace('width="880"', 'width="100%"', 1)
    svg = re.sub(r'\sheight="\d+"', "", svg, count=1)
    return svg


BASE_CSS = """
  *{ box-sizing: border-box; }
  body {
    font-family: "Segoe UI", Helvetica, Arial, sans-serif;
    color: #1a1a1a; line-height: 1.55; margin: 0;
  }
  h1 { font-size: 21pt; margin: 0 0 4pt; letter-spacing: -0.3px; }
  h2 { font-size: 14pt; margin: 20pt 0 7pt; padding-bottom: 4pt;
       border-bottom: 1.5px solid #1a1a1a; page-break-after: avoid; }
  h3 { font-size: 11.5pt; margin: 14pt 0 5pt; page-break-after: avoid; }
  p, li { font-size: 10pt; }
  li { margin-bottom: 2.5pt; }
  a { color: #1a1a1a; text-decoration: underline; }
  hr { border: 0; border-top: 1px solid #ccc; margin: 16pt 0; }
  table { width: 100%; border-collapse: collapse; margin: 8pt 0 12pt;
          page-break-inside: avoid; }
  th, td { border: 1px solid #bbb; padding: 4pt 6pt; font-size: 9pt;
           text-align: left; vertical-align: top; }
  th { background: #f0f0f0; font-weight: 700; }
  blockquote { margin: 10pt 0; padding: 7pt 12pt; border-left: 3px solid #333;
               background: #f6f6f6; page-break-inside: avoid; }
  blockquote p { margin: 0; font-size: 9.5pt; }
  code { font-family: Consolas, monospace; font-size: 9pt;
         background: #f0f0f0; padding: 1pt 3pt; border-radius: 2px; }
  strong { font-weight: 700; }
  svg { display: block; margin: 10pt auto; max-width: 100%; }
  .fig { page-break-inside: avoid; margin: 12pt 0; }
"""


def build_plan():
    md_text = (ROOT / "PLAN.md").read_text(encoding="utf-8")
    md_text = md_text.replace("- [ ] ", "- ☐ ")  # checkbox imprimible

    html_body = markdown.markdown(md_text, extensions=["tables", "sane_lists"])

    # sustituye <img src="assets/x.svg"> por el SVG en línea
    def inline(m):
        name = Path(m.group(1)).name
        return f'<div class="fig">{load_svg(name)}</div>'

    html_body = re.sub(r'<img[^>]*src="([^"]*\.svg)"[^>]*/?>', inline, html_body)
    html_body = re.sub(r"<p>\s*</p>", "", html_body)

    html = f"""<!doctype html><html lang="es"><head><meta charset="utf-8">
<title>Piano Speedrun</title><style>
@page {{ size: A4 portrait; margin: 16mm 15mm 18mm; }}
{BASE_CSS}
</style></head><body>{html_body}</body></html>"""

    out = BUILD / "plan.html"
    out.write_text(html, encoding="utf-8")
    return out, PDF / "Piano-Speedrun-Plan.pdf"


CHEAT = [
    ("grand-staff.svg", "1 · Las 4 anclas",
     "No recites <b>mi-sol-si-re-fa</b> desde abajo: eso tiene techo. "
     "Memoriza estas cuatro notas y mide todo lo demás por distancia desde ellas."),
    ("keyboard-map.svg", "2 · Orientación en el teclado",
     "Nunca cuentes teclas desde el extremo. <b>DO</b> = blanca a la izquierda del grupo "
     "de <b>2</b> negras. <b>FA</b> = blanca a la izquierda del grupo de <b>3</b>."),
    ("intervals.svg", "3 · Leer por distancia",
     "Nombra <b>solo la primera nota</b> del compás. El resto se lee como movimiento. "
     "Nombrar cada nota es exactamente lo que te frena."),
    ("rhythm.svg", "4 · Ritmo",
     "El 90% de los fallos de lectura son de ritmo. <b>Si no lo puedes palmear "
     "contando en voz alta, no lo puedes tocar.</b>"),
]

PROTOCOL = """
<h2 style="margin-top:0">Protocolo para cualquier compás nuevo</h2>
<ol style="font-size:13pt; line-height:1.9">
  <li><b>Palmea</b> el ritmo contando en voz alta — sin tocar el piano</li>
  <li>Solo <b>mano izquierda</b>, contando en voz alta</li>
  <li>Solo <b>mano derecha</b>, contando en voz alta</li>
  <li>Manos juntas al <b>50%</b> del tempo</li>
  <li>Sube de <b>5 en 5 bpm</b>. Si fallas: baja 10 y haz 3 repeticiones limpias</li>
</ol>
<h2>Rutina diaria · 2 h</h2>
<table style="font-size:12pt">
  <tr><th style="width:22%">25 min</th><td>Lectura a primera vista — material
      <b>más fácil</b> de lo que sabes tocar, y siempre <b>nuevo</b></td></tr>
  <tr><th>20 min</th><td>Técnica — escalas, arpegios, Czerny Op. 599</td></tr>
  <tr><th>60 min</th><td>Repertorio — fragmentos, metrónomo, protocolo de 5 pasos</td></tr>
  <tr><th>15 min</th><td>Tocar por gusto — lo que sea</td></tr>
</table>
<p style="font-size:12pt; margin-top:14pt"><b>¿Solo 40 min hoy?</b>
   Lectura + repertorio. <b>Nunca saltes la lectura.</b></p>
<p style="font-size:12pt"><b>Prohibido Synthesia</b> en las 2 piezas objetivo.
   Partitura o nada.</p>
<p style="font-size:12pt"><b>✈ 8–30 ago, Alemania:</b> 15 min/día de lectura en el celular
   (Tenuto) + palmear ritmos. La lectura es lo único que se oxida rápido.</p>
"""


def build_cheat():
    pages = []
    for svg_name, title, subtitle in CHEAT:
        pages.append(f"""<section>
  <h1>{title}</h1>
  <p class="sub">{subtitle}</p>
  {load_svg(svg_name)}
</section>""")
    pages.append(f'<section class="text">{PROTOCOL}</section>')

    html = f"""<!doctype html><html lang="es"><head><meta charset="utf-8">
<title>Piano · Atril</title><style>
@page {{ size: A4 landscape; margin: 10mm 12mm; }}
{BASE_CSS}
section {{ page-break-after: always; height: 185mm;
           display: flex; flex-direction: column; justify-content: center; }}
section:last-child {{ page-break-after: auto; }}
section.text {{ justify-content: flex-start; padding-top: 6mm; }}
h1 {{ font-size: 20pt; margin: 0 0 3pt; }}
.sub {{ font-size: 12pt; color: #444; margin: 0 0 6pt; max-width: 210mm; }}
svg {{ width: 100%; height: auto; }}
</style></head><body>{"".join(pages)}</body></html>"""

    out = BUILD / "atril.html"
    out.write_text(html, encoding="utf-8")
    return out, PDF / "Piano-Atril.pdf"


def wait_for_pdf(pdf_path, timeout=90):
    """Espera a que Edge termine de escribir el PDF.

    IMPORTANTE: el proceso de Edge retorna ANTES de que el archivo este escrito
    -- delega en un proceso hijo y sale con codigo 0. Comprobar la existencia
    del archivo justo despues de subprocess.run() da falsos negativos.
    Aqui se espera a que aparezca y a que su tamano se estabilice.
    """
    deadline = time.time() + timeout
    last_size = -1
    stable = 0
    while time.time() < deadline:
        if pdf_path.exists():
            size = pdf_path.stat().st_size
            if size > 0 and size == last_size:
                stable += 1
                if stable >= 3:  # ~0.9 s sin cambios => terminado
                    return size
            else:
                stable = 0
            last_size = size
        time.sleep(0.3)
    sys.exit(f"Timeout esperando {pdf_path.name}")


def to_pdf(html_path, pdf_path):
    # --user-data-dir aislado: evita chocar con el Edge que el usuario tenga abierto.
    profile = Path(tempfile.mkdtemp(prefix="edgepdf"))
    if pdf_path.exists():
        pdf_path.unlink()

    subprocess.run([
        str(EDGE), "--headless=new", "--disable-gpu", "--no-sandbox",
        "--no-first-run", f"--user-data-dir={profile}",
        "--no-pdf-header-footer", f"--print-to-pdf={pdf_path}",
        html_path.as_uri(),
    ], check=True, timeout=180)

    return wait_for_pdf(pdf_path)


def main():
    if not EDGE.exists():
        sys.exit(f"No encuentro Edge en {EDGE}")
    BUILD.mkdir(exist_ok=True)
    PDF.mkdir(exist_ok=True)

    for builder in (build_plan, build_cheat):
        html_path, pdf_path = builder()
        size = to_pdf(html_path, pdf_path)
        print(f"OK  {pdf_path.name}  ({size / 1024:.0f} KB)")


if __name__ == "__main__":
    main()

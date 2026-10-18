"""Render docs/INSTALL-HOMEPL.md as a standalone, printable HTML page (docs/INSTALL-HOMEPL.html).
   python3 tools/guide_html.py   — needs the 'markdown' package (pip install markdown)."""
import pathlib, re, markdown
root = pathlib.Path(__file__).resolve().parent.parent
md = (root / 'docs' / 'INSTALL-HOMEPL.md').read_text(encoding='utf-8')
body = markdown.markdown(md, extensions=['tables', 'fenced_code', 'toc', 'sane_lists'])
body = re.sub(r'<table>', '<div class="tw"><table>', body).replace('</table>', '</table></div>')
toc = ''.join('<li><a href="#%s">%s</a></li>' % (m.group(1), re.sub('<[^>]+>', '', m.group(2))) for m in re.finditer(r'<h2 id="([^"]+)">(.*?)</h2>', body))
html = '''<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>AI Forecast Atlas on home.pl — installation guide</title>
<style>
:root { --bg: #f6f5f1; --panel: #fff; --ink: #17171a; --ink2: #43413c; --ink3: #66635b; --rule: #dfdcd2; --a: #9c5500; --code: #f1efe9; color-scheme: light; }
@media (prefers-color-scheme: dark) { :root { --bg: #0b0b0c; --panel: #141416; --ink: #f1efe8; --ink2: #c9c6bc; --ink3: #8f8c83; --rule: #2a2a2e; --a: #f5a524; --code: #1d1d20; color-scheme: dark; } }
body { margin: 0; background: var(--bg); color: var(--ink); font: 16px/1.6 system-ui, -apple-system, "Segoe UI", Roboto, Arial, sans-serif; }
.wrap { display: grid; grid-template-columns: 250px minmax(0, 1fr); gap: 32px; max-width: 1180px; margin: 0 auto; padding-block: 28px 60px; padding-left: max(16px, env(safe-area-inset-left, 0px)); padding-right: max(16px, env(safe-area-inset-right, 0px)); }
nav { position: sticky; top: 16px; align-self: start; font-size: 14px; }
nav b { display: block; margin-bottom: 8px; color: var(--a); font: 700 12px/1.3 ui-monospace, Menlo, Consolas, monospace; letter-spacing: .06em; text-transform: uppercase; }
nav ol { margin: 0; padding-left: 18px; } nav li { margin: 4px 0; } nav a { color: var(--ink2); text-decoration: none; } nav a:hover { color: var(--a); }
main { background: var(--panel); border: 1px solid var(--rule); border-radius: 4px; padding: 28px 36px; min-width: 0; }
h1 { font-size: 30px; line-height: 1.2; margin: 0 0 12px; text-wrap: balance; }
h2 { font-size: 21px; margin: 36px 0 10px; padding-top: 14px; border-top: 2px solid var(--a); text-wrap: balance; }
h3 { font-size: 17px; margin: 22px 0 8px; }
p, li { color: var(--ink2); max-width: 74ch; } li { margin: 5px 0; } strong { color: var(--ink); }
a { color: var(--a); }
code { font-family: ui-monospace, Menlo, Consolas, monospace; font-size: .88em; background: var(--code); padding: 1px 5px; border-radius: 3px; overflow-wrap: anywhere; }
pre { background: var(--code); border: 1px solid var(--rule); border-radius: 4px; padding: 12px 14px; overflow-x: auto; } pre code { background: none; padding: 0; }
.tw { overflow-x: auto; margin: 10px 0 14px; } table { border-collapse: collapse; width: 100%; font-size: 15px; } th, td { text-align: left; vertical-align: top; padding: 8px 10px; border-bottom: 1px solid var(--rule); } th { color: var(--ink3); font-size: 13px; }
hr { border: 0; border-top: 1px solid var(--rule); margin: 26px 0; }
.brand { display: inline-block; background: var(--a); color: var(--panel); font: 700 12px/1 ui-monospace, Menlo, Consolas, monospace; padding: 5px 7px 4px; border-radius: 2px; letter-spacing: .06em; margin-bottom: 14px; }
@media (max-width: 900px) { .wrap { grid-template-columns: minmax(0, 1fr); } nav { position: static; } main { padding: 20px 18px; } }
@media print { nav { display: none; } .wrap { display: block; } main { border: 0; padding: 0; } body { background: #fff; } h2 { break-after: avoid; } }
</style></head><body><div class="wrap">
<nav aria-label="Steps"><b>Steps</b><ol>{{TOC}}</ol></nav>
<main><span class="brand">AI FORECAST ATLAS · CREOOX AG</span>
{{BODY}}
</main></div></body></html>
'''.replace('{{TOC}}', toc).replace('{{BODY}}', body)
(root / 'docs' / 'INSTALL-HOMEPL.html').write_text(html, encoding='utf-8')
print('wrote docs/INSTALL-HOMEPL.html', len(html))

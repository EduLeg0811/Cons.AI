from http.server import HTTPServer, BaseHTTPRequestHandler

HTML = """
<!DOCTYPE html>
<html lang=\"en\">
<head>
  <meta charset=\"UTF-8\" />
  <title>OpenAI Icon Debug</title>
  <!-- Font Awesome latest tested -->
  <link rel=\"stylesheet\" href=\"https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.7.2/css/all.min.css\">
  <!-- Iconify for broad icon coverage (SVG runtime) -->
  <script src=\"https://code.iconify.design/3/3.1.0/iconify.min.js\"></script>
  <style>
    body { margin:0; font-family: system-ui, sans-serif; background:#16a34a; color:#fff; }
    .wrap { display:flex; flex-direction:column; gap:20px; align-items:center; justify-content:center; min-height:100vh; padding:24px; }
    .row { display:flex; gap:16px; align-items:center; flex-wrap:wrap; }
    .box { display:flex; align-items:center; gap:12px; }
    .icon { font-size:72px; background: rgba(255,255,255,0.12); padding:24px; border-radius:16px; display:flex; align-items:center; justify-content:center; }
    .label { font-size:14px; opacity:0.95; max-width:540px; }
    .img { width:96px; height:96px; background: rgba(255,255,255,0.12); padding:12px; border-radius:16px; display:flex; align-items:center; justify-content:center; }
    .img img, .img svg { width:72px; height:72px; }
  </style>
  </head>
  <body>
  <div class=\"wrap\">
    <!-- 1) Font Awesome brands: openai -->
    <div class=\"row\">
      <div class=\"box\">
        <div class=\"icon\"><i class=\"fa-brands fa-openai\"></i></div>
        <div class=\"label\">Font Awesome brands: <code>fa-brands fa-openai</code></div>
      </div>
      <div class=\"box\">
        <div class=\"icon\"><i class=\"fab fa-openai\"></i></div>
        <div class=\"label\">Font Awesome brands (alias): <code>fab fa-openai</code></div>
      </div>
      <div class=\"box\">
        <div class=\"icon\"><i class=\"fa-solid fa-robot\"></i></div>
        <div class=\"label\">FA solid fallback: <code>fa-solid fa-robot</code></div>
      </div>
      <div class=\"box\">
        <div class=\"icon\"><i class=\"fa-brands fa-font-awesome\"></i></div>
        <div class=\"label\">FA brands sanity check: <code>fa-brands fa-font-awesome</code></div>
      </div>
    </div>

    <!-- 2) Iconify runtime (uses Simple Icons OpenAI) -->
    <div class=\"row\">
      <div class=\"box\">
        <div class=\"icon\" style=\"color:#fff;\"><span class=\"iconify\" data-icon=\"simple-icons:openai\" data-width=\"72\" data-height=\"72\"></span></div>
        <div class=\"label\">Iconify Simple Icons: <code>simple-icons:openai</code> (SVG runtime)</div>
      </div>
      <div class=\"box\">
        <div class=\"icon\" style=\"color:#fff;\"><span class=\"iconify\" data-icon=\"fa6-brands:openai\" data-width=\"72\" data-height=\"72\"></span></div>
        <div class=\"label\">Iconify FA6 brands mapping: <code>fa6-brands:openai</code></div>
      </div>
    </div>

    <!-- 3) Direct SVG via Iconify API / Simple Icons CDN (no runtime) -->
    <div class=\"row\">
      <div class=\"box\">
        <div class=\"img\"><img alt=\"OpenAI (Iconify)\" src=\"https://api.iconify.design/simple-icons:openai.svg?color=white\" /></div>
        <div class=\"label\">Image SVG via Iconify API: <code>simple-icons:openai.svg</code></div>
      </div>
      <div class=\"box\">
        <div class=\"img\"><img alt=\"OpenAI (SimpleIcons CDN)\" src=\"https://cdn.simpleicons.org/openai/FFFFFF\" /></div>
        <div class=\"label\">Image SVG via Simple Icons CDN: <code>cdn.simpleicons.org/openai/FFFFFF</code></div>
      </div>
      <div class=\"box\">
        <div class=\"img\"><img alt=\"OpenAI (Tabler via Iconify)\" src=\"https://api.iconify.design/tabler:brand-openai.svg?color=white\" /></div>
        <div class=\"label\">Image SVG via Iconify API: <code>tabler:brand-openai</code></div>
      </div>
    </div>
  </div>

  <script>
    function logInfo(sel, label){
      const el = document.querySelector(sel);
      if (!el) return;
      const cs = getComputedStyle(el);
      console.log(label, 'font-family:', cs.fontFamily, 'font-size:', cs.fontSize, 'color:', cs.color);
    }
    logInfo('.fa-openai', 'FA .fa-openai');
    logInfo('.fa-robot', 'FA .fa-robot');
    logInfo('.fa-font-awesome', 'FA .fa-font-awesome');
  </script>
  </body>
  </html>
"""
class Handler(BaseHTTPRequestHandler):

    def do_GET(self):
        self.send_response(200)
        self.send_header("Content-Type", "text/html; charset=utf-8")
        self.end_headers()
        self.wfile.write(HTML.encode("utf-8"))

if __name__ == "__main__":

    HTTPServer(("127.0.0.1", 8000), Handler).serve_forever()

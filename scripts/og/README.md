# Social preview image (`public/og-image.png`) and README screenshot (`docs/screenshot.png`)

Both are in English, the default language (`capture.ts` sets the scene's language).

1. Start the dev server: `docker compose up`.
2. Capture the sample scene at 1280×800 and compose the final 1200×630 image with Chromium from the official
   Playwright image. It joins the dev server's Docker network and connects through its IP, which Vite accepts without
   changing `allowedHosts`:

   ```bash
   C=$(docker compose ps -q app)
   NET=$(docker inspect "$C" -f '{{range $k, $v := .NetworkSettings.Networks}}{{$k}}{{end}}')
   IP=$(docker inspect "$C" -f '{{range .NetworkSettings.Networks}}{{.IPAddress}}{{end}}')
   docker run --rm --network "$NET" -v "$PWD":/work -w /work mcr.microsoft.com/playwright:v1.49.0-noble sh -c "
     npx -y playwright@1.49.0 screenshot --browser chromium --viewport-size=1280,800 --wait-for-timeout=10000 \
       http://$IP:5173/scripts/og/capture.html scripts/og/app-capture.png &&
     npx -y playwright@1.49.0 screenshot --browser chromium --viewport-size=1200,630 --wait-for-timeout=1500 \
       file:///work/scripts/og/compose.html public/og-image.png"
   ```

3. Copy the capture as the README screenshot: `cp scripts/og/app-capture.png docs/screenshot.png`.

`app-capture.png` is an intermediate file and is not committed.

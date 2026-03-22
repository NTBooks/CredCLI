'use strict';

const { app, BrowserWindow } = require('electron');
const fs = require('fs');
const path = require('path');

// Flags for headless / container environments (must be set before app ready)
app.commandLine.appendSwitch('headless');
app.commandLine.appendSwitch('disable-gpu');
app.commandLine.appendSwitch('no-sandbox');
app.commandLine.appendSwitch('disable-dev-shm-usage');
app.disableHardwareAcceleration();

// Prevent Electron from quitting automatically when a window is destroyed mid-loop
app.on('window-all-closed', () => {});

const manifestArg = process.argv.find(a => a.startsWith('--manifest='));
if (!manifestArg) {
  process.stderr.write(JSON.stringify({ error: 'Missing --manifest argument' }) + '\n');
  app.exit(1);
}

const manifestPath = manifestArg.slice('--manifest='.length);

app.whenReady().then(async () => {
  let items;
  try {
    items = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
  } catch (e) {
    process.stderr.write(JSON.stringify({ error: 'Failed to read manifest: ' + e.message }) + '\n');
    app.exit(1);
    return;
  }

  for (let i = 0; i < items.length; i++) {
    const { html, output, format, width, height } = items[i];

    const win = new BrowserWindow({ width, height, show: false });

    try {
      await win.loadFile(html);
      // Allow layout and any synchronous paint to complete
      await new Promise(r => setTimeout(r, 150));

      if (format === 'pdf') {
        // Convert CSS pixels (96 dpi) to microns: 1px = 25400/96 µm
        const toMicrons = px => Math.round(px * 25400 / 96);
        const data = await win.webContents.printToPDF({
          pageSize: { width: toMicrons(width), height: toMicrons(height) },
          printBackground: true,
          margins: { marginType: 'none' },
        });
        fs.writeFileSync(output, data);
      } else {
        const image = await win.webContents.capturePage({ x: 0, y: 0, width, height });
        fs.writeFileSync(output, image.toPNG());
      }
    } catch (e) {
      process.stderr.write(JSON.stringify({ error: 'Failed to render ' + path.basename(output) + ': ' + e.message }) + '\n');
      win.destroy();
      app.exit(1);
      return;
    }

    win.destroy();
    process.stdout.write(JSON.stringify({ done: i + 1, total: items.length, file: path.basename(output) }) + '\n');
  }

  app.quit();
});

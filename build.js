const fs = require('fs');
const path = require('path');

const outDir = path.join(__dirname, 'www');
if (!fs.existsSync(outDir)) {
  fs.mkdirSync(outDir, { recursive: true });
}

const filesToCopy = [
  'index.html',
  'app.js',
  'style.css',
  'sw.js',
  'manifest.json',
  'tailwind.js',
  'jsmediatags.min.js',
  'logo.png',
  'icon-192.png',
  'icon-512.png',
  'apple-touch-icon.png',
  'favicon.png'
];

filesToCopy.forEach(file => {
  const src = path.join(__dirname, file);
  const dest = path.join(outDir, file);
  if (fs.existsSync(src)) {
    fs.copyFileSync(src, dest);
  }
});

console.log('✅ Assets successfully copied to www/ for Capacitor Android build!');

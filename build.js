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
  'favicon.png',
  '.nojekyll'
];

filesToCopy.forEach(file => {
  const src = path.join(__dirname, file);
  const dest = path.join(outDir, file);
  if (fs.existsSync(src)) {
    fs.copyFileSync(src, dest);
  }
});

// Copy .well-known folder
const wellKnownDir = path.join(__dirname, '.well-known');
const destWellKnownDir = path.join(outDir, '.well-known');
if (fs.existsSync(wellKnownDir)) {
  if (!fs.existsSync(destWellKnownDir)) {
    fs.mkdirSync(destWellKnownDir, { recursive: true });
  }
  const wkFiles = fs.readdirSync(wellKnownDir);
  wkFiles.forEach(f => {
    fs.copyFileSync(path.join(wellKnownDir, f), path.join(destWellKnownDir, f));
  });
}

console.log('✅ Assets successfully copied to www/ for Capacitor Android build!');

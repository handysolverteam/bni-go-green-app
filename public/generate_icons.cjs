const fs = require('fs');
const path = require('path');
const sharp = require('sharp');

const iconsDir = path.join(__dirname, 'icons');
if (!fs.existsSync(iconsDir)) fs.mkdirSync(iconsDir, { recursive: true });

// Clean, high-resolution 512x512 Master Icon SVG (Without top-right dot and arrow)
const createMasterSvg = (size = 512) => `
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" width="${size}" height="${size}">
  <defs>
    <!-- Background Gradient -->
    <linearGradient id="bgGrad" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#0b0f19" />
      <stop offset="50%" stop-color="#091322" />
      <stop offset="100%" stop-color="#061a14" />
    </linearGradient>

    <!-- Emerald Brand Glow -->
    <radialGradient id="emeraldGlow" cx="50%" cy="42%" r="50%">
      <stop offset="0%" stop-color="#10b981" stop-opacity="0.4" />
      <stop offset="70%" stop-color="#0d9488" stop-opacity="0.1" />
      <stop offset="100%" stop-color="#0b0f19" stop-opacity="0" />
    </radialGradient>

    <!-- Icon Badge Gradient -->
    <linearGradient id="badgeGrad" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#10b981" />
      <stop offset="100%" stop-color="#14b8a6" />
    </linearGradient>

    <filter id="shadow" x="-20%" y="-20%" width="140%" height="140%">
      <feDropShadow dx="0" dy="12" stdDeviation="16" flood-color="#10b981" flood-opacity="0.3" />
    </filter>
  </defs>

  <!-- Solid Background for Maskable Icon Safe Zone -->
  <rect width="512" height="512" fill="url(#bgGrad)" />

  <!-- Outer Glow Circle -->
  <circle cx="256" cy="240" r="210" fill="url(#emeraldGlow)" />

  <!-- Outer Glass Frame Ring -->
  <rect x="56" y="56" width="400" height="400" rx="96" fill="#0d1527" fill-opacity="0.6" stroke="#10b981" stroke-width="4" stroke-opacity="0.4" filter="url(#shadow)" />

  <!-- Inner Glass Panel -->
  <rect x="72" y="72" width="368" height="368" rx="80" fill="url(#bgGrad)" stroke="#ffffff" stroke-width="1.5" stroke-opacity="0.15" />

  <!-- Clean Performance Score Growth Bars Graphic (No dot or arrow) -->
  <g transform="translate(0, 10)">
    <!-- Bar 1 (Red) -->
    <rect x="144" y="240" width="36" height="90" rx="14" fill="#f43f5e" opacity="0.85" />
    <!-- Bar 2 (Amber) -->
    <rect x="196" y="190" width="36" height="140" rx="14" fill="#f59e0b" opacity="0.9" />
    <!-- Bar 3 (Emerald Green Active) -->
    <rect x="248" y="140" width="36" height="190" rx="14" fill="url(#badgeGrad)" />
    <!-- Bar 4 (Teal Green Top) -->
    <rect x="300" y="96" width="36" height="234" rx="14" fill="#34d399" />
  </g>

  <!-- BNI GO GREEN Badge Pill -->
  <rect x="136" y="370" width="240" height="56" rx="28" fill="url(#badgeGrad)" />
  <text x="256" y="408" font-family="-apple-system, BlinkMacSystemFont, 'Plus Jakarta Sans', 'Segoe UI', Roboto, sans-serif" font-weight="900" font-size="27" fill="#090d16" text-anchor="middle" letter-spacing="3">BNI GO GREEN</text>
</svg>
`;

async function generateAllIcons() {
  const masterSvg = createMasterSvg(512);
  const svgPath = path.join(iconsDir, 'icon.svg');
  fs.writeFileSync(svgPath, masterSvg);
  console.log('Saved clean icon.svg');

  const svgBuffer = Buffer.from(masterSvg);

  // 1. 512x512 PNG
  await sharp(svgBuffer)
    .resize(512, 512)
    .png()
    .toFile(path.join(iconsDir, 'icon-512x512.png'));
  console.log('Saved icon-512x512.png');

  // 2. 192x192 PNG
  await sharp(svgBuffer)
    .resize(192, 192)
    .png()
    .toFile(path.join(iconsDir, 'icon-192x192.png'));
  console.log('Saved icon-192x192.png');

  // 3. 180x180 Apple Touch Icon
  await sharp(svgBuffer)
    .resize(180, 180)
    .png()
    .toFile(path.join(iconsDir, 'apple-touch-icon.png'));
  console.log('Saved apple-touch-icon.png');

  // 4. Favicon 32x32
  await sharp(svgBuffer)
    .resize(32, 32)
    .png()
    .toFile(path.join(iconsDir, 'favicon-32x32.png'));
  console.log('Saved favicon-32x32.png');

  // 5. Favicon 16x16
  await sharp(svgBuffer)
    .resize(16, 16)
    .png()
    .toFile(path.join(iconsDir, 'favicon-16x16.png'));
  console.log('Saved favicon-16x16.png');

  console.log('All clean PWA icons re-generated successfully!');
}

generateAllIcons().catch(err => {
  console.error('Error generating icons:', err);
  process.exit(1);
});

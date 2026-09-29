const fs = require('fs');
const path = require('path');

const rootDir = path.join(__dirname, '..');
const publicDir = path.join(rootDir, 'public');

if (!fs.existsSync(publicDir)) {
  fs.mkdirSync(publicDir, { recursive: true });
}

// Lista de archivos estáticos que deben estar disponibles en el despliegue
const filesToCopy = [
  'index.html',
  'generador_lockups_tecnicos.html',
  'MPS_AYALA_PROPUESTA_ROI_001.html',
  'PROPUESTA DE SERVICIOS Y SOLUCIONES DIGITALES MPS AYALA..html',
  'Code_Generated_Image.png',
  'mockup tsolutions.png'
];

filesToCopy.forEach(file => {
  const src = path.join(rootDir, file);
  const dest = path.join(publicDir, file);
  if (fs.existsSync(src)) {
    fs.copyFileSync(src, dest);
    console.log(`Copied ${file} -> public/${file}`);
  }
});

console.log('✓ Public directory prepared successfully for Vercel deployment.');

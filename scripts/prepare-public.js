const fs = require('fs');
const path = require('path');

const rootDir = path.join(__dirname, '..');
const publicDir = path.join(rootDir, 'public');

if (!fs.existsSync(publicDir)) {
  fs.mkdirSync(publicDir, { recursive: true });
}

// Asegurar copia con nombre limpio sin espacios ni puntos dobles
const mpsSrc = path.join(rootDir, 'PROPUESTA DE SERVICIOS Y SOLUCIONES DIGITALES MPS AYALA..html');
const mpsClean = path.join(rootDir, 'propuesta_servicios_digitales_mps.html');
if (fs.existsSync(mpsSrc) && !fs.existsSync(mpsClean)) {
  fs.copyFileSync(mpsSrc, mpsClean);
}

// Lista de archivos estáticos que deben estar disponibles en el despliegue
const filesToCopy = [
  'index.html',
  'prompt_architect.html',
  'generador_lockups_tecnicos.html',
  'MPS_AYALA_PROPUESTA_ROI_001.html',
  'PROPUESTA DE SERVICIOS Y SOLUCIONES DIGITALES MPS AYALA..html',
  'propuesta_servicios_digitales_mps.html',
  'Code_Generated_Image.png',
  'mockup tsolutions.png'
];

filesToCopy.forEach(file => {
  const src = path.join(rootDir, file);
  const dest = path.join(publicDir, file);
  if (fs.existsSync(src)) {
    fs.copyFileSync(src, dest);
    console.log(`Copied ${file} -> public/${file}`);

    // Si es archivo HTML con nombre limpio (sin espacios ni doble punto), crear copia sin extensión
    if (file.endsWith('.html') && file !== 'index.html' && !file.includes('..') && !file.includes(' ')) {
      const cleanName = file.replace(/\.html$/, '');
      const cleanDest = path.join(publicDir, cleanName);
      fs.copyFileSync(src, cleanDest);
      console.log(`CleanURL: public/${cleanName}`);
    }
  }
});

console.log('✓ Public directory prepared successfully for Vercel deployment with CleanURLs.');

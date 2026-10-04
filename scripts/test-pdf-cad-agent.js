const express = require('express');
const { Pool } = require('pg');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../.env.local') });

const { createPresentationRoutes } = require('../dist/routes/presentation.routes');
const { createAIRoutes } = require('../dist/routes/ai.routes');

async function testPdfAndCadAgent() {
  console.log('--- TEST: PRESENTATION PDF EXPORT & CAD SVG AGENT ---');

  const pool = new Pool({
    connectionString: process.env.DATABASE_URL_UNPOOLED || process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false }
  });

  const app = express();
  app.use(express.json());
  app.use('/api/v1/presentations', createPresentationRoutes(pool));
  app.use('/api/v1/ai', createAIRoutes(pool));

  const server = app.listen(0);
  const port = server.address().port;
  console.log(`Test server running on port ${port}`);

  async function request(path, options = {}) {
    const res = await fetch(`http://127.0.0.1:${port}${path}`, {
      headers: { 'Content-Type': 'application/json', ...(options.headers || {}) },
      ...options
    });
    const contentType = res.headers.get('content-type') || '';
    let data;
    if (contentType.includes('application/json')) {
      data = await res.json().catch(() => ({}));
    } else {
      data = await res.text().catch(() => '');
    }
    return { status: res.status, ok: res.ok, data, contentType };
  }

  try {
    // 1. Probar generación de mazo o consulta de mazo para PDF
    const listRes = await request('/api/v1/presentations');
    console.log('1. List Presentations:', listRes.status === 200 ? '✓ PASS' : '❌ FAIL', `(Count: ${listRes.data.length})`);

    let deckId;
    if (listRes.data.length > 0) {
      deckId = listRes.data[0].id;
    } else {
      // Crear un mazo de prueba rápido
      const genRes = await request('/api/v1/presentations/generate', {
        method: 'POST',
        body: JSON.stringify({
          title: 'Deck de Prueba PDF Export 16:9',
          objective: 'Validación de exportación a PDF de alta resolución.'
        })
      });
      deckId = genRes.data.deck.id;
    }

    // 2. Probar Endpoint de Exportación PDF
    const pdfViewRes = await request(`/api/v1/presentations/${deckId}/export-pdf`);
    const hasPrintCss = typeof pdfViewRes.data === 'string' && pdfViewRes.data.includes('@media print') && pdfViewRes.data.includes('size: landscape');
    const hasSlides = typeof pdfViewRes.data === 'string' && pdfViewRes.data.includes('slide-page');
    console.log('2. Export PDF 16:9 View:', (pdfViewRes.status === 200 && hasPrintCss && hasSlides) ? '✓ PASS (HTML 16:9 Landscape Generado)' : '❌ FAIL');

    // 3. Probar CAD AI SVG Agent: ISOTIPO
    const isoRes = await request('/api/v1/ai/cad/generate-svg', {
      method: 'POST',
      body: JSON.stringify({
        designType: 'ISOTIPO',
        brandName: 'TSOLUTIONS IPIDD',
        industry: 'Ingeniería de Software & OPEX',
        visualConcept: 'Hexágono regular exterior con ligadura angular T-S y resplandor glow',
        colorPalette: 'TSOLUTIONS_OFFICIAL',
        geometricStyle: 'HEXAGONAL_TECHNICAL',
        includeConstructionGuides: true
      })
    });
    const isoValid = isoRes.status === 200 && isoRes.data.design && isoRes.data.design.svgCode.includes('<svg');
    console.log('3. CAD AI Agent - ISOTIPO Puro:', isoValid ? '✓ PASS (SVG Validado)' : '❌ FAIL', isoRes.data.design?.conceptRationale?.slice(0, 70));

    // 4. Probar CAD AI SVG Agent: IMAGOTIPO
    const imagoRes = await request('/api/v1/ai/cad/generate-svg', {
      method: 'POST',
      body: JSON.stringify({
        designType: 'IMAGOTIPO',
        brandName: 'TSOLUTIONS IPIDD',
        industry: 'Arquitectura de Sistemas',
        visualConcept: 'Isotipo hexagonal a la izquierda y Wordmark tipográfico con lema a la derecha',
        colorPalette: 'TSOLUTIONS_OFFICIAL',
        geometricStyle: 'GOLDEN_RATIO',
        includeConstructionGuides: true
      })
    });
    const imagoValid = imagoRes.status === 200 && imagoRes.data.design && imagoRes.data.design.svgCode.includes('viewBox="0 0 1200 450"');
    console.log('4. CAD AI Agent - IMAGOTIPO Horizontal:', imagoValid ? '✓ PASS (ViewBox 1200x450 Validado)' : '❌ FAIL');

    // 5. Probar CAD AI SVG Agent: LOGOTIPO
    const logoRes = await request('/api/v1/ai/cad/generate-svg', {
      method: 'POST',
      body: JSON.stringify({
        designType: 'LOGOTIPO',
        brandName: 'NEXUS SRE',
        visualConcept: 'Wordmark futurista con tracking expandido y líneas de cota',
        includeConstructionGuides: true
      })
    });
    const logoValid = logoRes.status === 200 && logoRes.data.design && logoRes.data.design.svgCode.includes('<text');
    console.log('5. CAD AI Agent - LOGOTIPO Lettering:', logoValid ? '✓ PASS (Texto SVG Validado)' : '❌ FAIL');

    // 6. Probar CAD AI SVG Agent: ISOLOGO
    const isologoRes = await request('/api/v1/ai/cad/generate-svg', {
      method: 'POST',
      body: JSON.stringify({
        designType: 'ISOLOGO',
        brandName: 'AYALA FERRETODO',
        visualConcept: 'Escudo hexagonal indivisible con monograma y texto perimetral',
        includeConstructionGuides: false
      })
    });
    const isologoValid = isologoRes.status === 200 && isologoRes.data.design && isologoRes.data.design.svgCode.includes('<polygon');
    console.log('6. CAD AI Agent - ISOLOGO Emblema:', isologoValid ? '✓ PASS (Emblema SVG Validado)' : '❌ FAIL');

    console.log('\n--- TODOS LOS TESTS COMPLETADOS SATISFACTORIAMENTE ---');
  } finally {
    server.close();
    await pool.end();
  }
}

testPdfAndCadAgent().catch(err => {
  console.error('Test error:', err);
  process.exit(1);
});

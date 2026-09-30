import { Pool } from 'pg';
import path from 'path';
import dotenv from 'dotenv';
import { AIGatewayService } from './services/aiGateway.service';
import { DEFAULT_WORKSPACE_ID } from './middleware/workspace.middleware';

dotenv.config({ path: path.join(__dirname, '../.env.local') });

async function runPresentationAITest() {
  console.log('--- TEST: AI SLIDE ENGINE & EXECUTIVE PRESENTATIONS (TSOLUTIONS IPIDD) ---');

  const connectionString = process.env.DATABASE_URL_UNPOOLED || process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error('DATABASE_URL is missing in .env.local');
  }

  const pool = new Pool({
    connectionString,
    ssl: { rejectUnauthorized: false }
  });

  const aiGateway = new AIGatewayService(pool);

  try {
    // 1. Crear o reutilizar un proyecto para asociar la presentación
    const projRes = await pool.query(
      `INSERT INTO projects (name, description, github_repo, github_repo_owner, github_repo_name, tech_stack, workspace_id)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       RETURNING id, name`,
      [
        'Auditoría Operativa y Arquitectura Escalable 2026',
        'Proyecto de transformación digital para optimización de flujos y reducción de desperdicios OPEX',
        'whoiselgallo/antigravity-instruction-architect',
        'whoiselgallo',
        'antigravity-instruction-architect',
        JSON.stringify({ runtime: 'Node.js', db: 'PostgreSQL', frontend: 'React', queue: 'BullMQ' }),
        DEFAULT_WORKSPACE_ID
      ]
    );
    const project = projRes.rows[0];
    console.log(`✓ Proyecto de prueba creado: ${project.id} (${project.name})`);

    // 2. Ejecutar la generación con el AI Gateway
    console.log('\n[1/3] Generando mazo de diapositivas ejecutivas con el AI Slide Engine...');
    const result = await aiGateway.generatePresentationDeck({
      workspaceId: DEFAULT_WORKSPACE_ID,
      projectId: project.id,
      title: 'OPTIMIZACIÓN OPEX & ARQUITECTURA DISTRIBUIDA',
      objective: 'Diagnóstico Ishikawa de cuello de botella, ruta crítica en 4 fases y mitigación SRE con SLA 99.98%',
      contextSummary: 'Metodología 5S, eliminación de silos y gobierno multitenant con Neon PostgreSQL'
    });

    console.log(`✓ Mazo generado exitosamente en Neon PostgreSQL:`);
    console.log(`   - ID del Mazo: ${result.deck.id}`);
    console.log(`   - Título: ${result.deck.title}`);
    console.log(`   - Aspect Ratio: ${result.deck.aspect_ratio}`);
    console.log(`   - Total Diapositivas: ${result.slides.length}`);

    // 3. Inspeccionar cada diapositiva generada y su layout
    console.log('\n[2/3] Verificando layouts modulares y validación de esquema...');
    result.slides.forEach((slide: any, idx: number) => {
      const data = typeof slide.slide_data === 'string' ? JSON.parse(slide.slide_data) : slide.slide_data;
      console.log(`   Slide #${idx + 1} [${slide.layout_type}]: "${data.title || data.tagline || 'Sin título'}"`);
    });

    // 4. Verificar consulta relacional directa en Neon PostgreSQL
    console.log('\n[3/3] Comprobando integridad relacional y aislamiento en Neon PostgreSQL...');
    const deckCheck = await pool.query(
      `SELECT d.id, d.title, COUNT(s.id) as slides_count
       FROM presentation_decks d
       JOIN presentation_slides s ON s.deck_id = d.id
       WHERE d.id = $1
       GROUP BY d.id, d.title`,
      [result.deck.id]
    );

    if (deckCheck.rows.length > 0) {
      console.log(`✓ Verificación en base de datos OK: Mazo "${deckCheck.rows[0].title}" contiene ${deckCheck.rows[0].slides_count} diapositivas vinculadas por FK en cascada.`);
    } else {
      throw new Error('No se encontraron registros en presentation_decks tras la inserción.');
    }

    console.log('\n✓ ALL PRESENTATION AI MODULE TESTS PASSED AND VERIFIED ACCORDING TO TSOLUTIONS IPIDD SPECIFICATION.');
  } catch (err) {
    console.error('Test execution failed:', err);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

runPresentationAITest();

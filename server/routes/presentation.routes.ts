import { Router, Request, Response } from 'express';
import { Pool } from 'pg';
import { Server as SocketIOServer } from 'socket.io';
import { AIGatewayService } from '../services/aiGateway.service';
import { DEFAULT_WORKSPACE_ID } from '../middleware/workspace.middleware';
import { SlideLayoutTypeSchema } from '../types/presentation.types';

export function createPresentationRoutes(pool: Pool, io?: SocketIOServer): Router {
  const router = Router();
  const aiGateway = new AIGatewayService(pool, io);

  /**
   * POST /api/v1/presentations/generate
   * Genera mazo completo de diapositivas con IA y persistencia en Neon PostgreSQL
   */
  router.post('/generate', async (req: Request, res: Response): Promise<void> => {
    try {
      const workspaceId = (req as any).workspaceId || req.body.workspace_id || DEFAULT_WORKSPACE_ID;
      const { projectId, title, objective, contextSummary } = req.body;

      if (!title || !objective) {
        res.status(400).json({
          error: 'Parámetros requeridos faltantes: "title" y "objective" son obligatorios.'
        });
        return;
      }

      const result = await aiGateway.generatePresentationDeck({
        workspaceId,
        projectId,
        authorId: (req as any).user?.id || null,
        title,
        objective,
        contextSummary
      });

      res.status(201).json({
        success: true,
        message: 'Mazo de diapositivas ejecutivas generado exitosamente.',
        deck: result.deck,
        slides: result.slides
      });
    } catch (err: unknown) {
      console.error('[AI Presentation Engine Error]:', err);
      res.status(500).json({ error: (err as Error).message });
    }
  });

  /**
   * GET /api/v1/presentations
   * Lista todos los mazos del workspace activo
   */
  router.get('/', async (req: Request, res: Response): Promise<void> => {
    try {
      const workspaceId = (req as any).workspaceId || req.query.workspace_id || DEFAULT_WORKSPACE_ID;
      const projectId = req.query.project_id as string | undefined;

      let query = `
        SELECT d.*, 
               COUNT(s.id)::int as slides_count
        FROM presentation_decks d
        LEFT JOIN presentation_slides s ON s.deck_id = d.id
        WHERE d.workspace_id = $1
      `;
      const params: any[] = [workspaceId];

      if (projectId) {
        params.push(projectId);
        query += ` AND d.project_id = $2`;
      }

      query += ` GROUP BY d.id ORDER BY d.created_at DESC`;

      const result = await pool.query(query, params);
      res.status(200).json(result.rows);
    } catch (err: unknown) {
      console.error('[List Presentations Error]:', err);
      res.status(500).json({ error: (err as Error).message });
    }
  });

  /**
   * GET /api/v1/presentations/:id
   * Obtiene un mazo específico con todas sus diapositivas ordenadas por slide_index
   */
  router.get('/:id', async (req: Request, res: Response): Promise<void> => {
    try {
      const { id } = req.params;
      const workspaceId = (req as any).workspaceId || DEFAULT_WORKSPACE_ID;

      const deckResult = await pool.query(
        `SELECT * FROM presentation_decks WHERE id = $1 AND workspace_id = $2`,
        [id, workspaceId]
      );

      if (deckResult.rows.length === 0) {
        res.status(404).json({ error: 'Mazo de diapositivas no encontrado.' });
        return;
      }

      const slidesResult = await pool.query(
        `SELECT * FROM presentation_slides 
         WHERE deck_id = $1 
         ORDER BY slide_index ASC, created_at ASC`,
        [id]
      );

      res.status(200).json({
        deck: deckResult.rows[0],
        slides: slidesResult.rows
      });
    } catch (err: unknown) {
      console.error('[Get Presentation Detail Error]:', err);
      res.status(500).json({ error: (err as Error).message });
    }
  });

  /**
   * GET /api/v1/presentations/:id/export-pdf
   * Vista de renderizado puro para exportación de alta fidelidad a PDF (16:9 Horizontal)
   */
  router.get('/:id/export-pdf', async (req: Request, res: Response): Promise<void> => {
    try {
      const { id } = req.params;
      const workspaceId = (req as any).workspaceId || DEFAULT_WORKSPACE_ID;

      const deckResult = await pool.query(
        `SELECT * FROM presentation_decks WHERE id = $1 AND workspace_id = $2`,
        [id, workspaceId]
      );

      if (deckResult.rows.length === 0) {
        res.status(404).send('<h1>404: Mazo de presentación no encontrado.</h1>');
        return;
      }

      const deck = deckResult.rows[0];
      const slidesResult = await pool.query(
        `SELECT * FROM presentation_slides 
         WHERE deck_id = $1 
         ORDER BY slide_index ASC, created_at ASC`,
        [id]
      );
      const slides = slidesResult.rows;

      const renderSlideBody = (slide: any) => {
        const d = typeof slide.slide_data === 'string' ? JSON.parse(slide.slide_data) : slide.slide_data;
        const type = slide.layout_type;

        if (type === 'HERO_COVER') {
          return `
            <div class="slide-content hero-layout">
              <div class="badge-pill">
                <span class="hex-icon"></span>
                <span>${d.badgeText || 'AUDITORÍA OPEX 2026'}</span>
              </div>
              <h1 class="hero-title">${d.title}</h1>
              <p class="hero-subtitle">${d.subtitle || ''}</p>
              <div class="meta-strip">
                <div>CONSULTORÍA: <strong>${d.author || 'TSolutions IPIDD'}</strong></div>
                <div>•</div>
                <div>CLIENTE: <strong>${d.client || 'Comité Directivo'}</strong></div>
                <div>•</div>
                <div>FECHA: <span class="cyan-text">${d.date || new Date().toISOString().slice(0, 10)}</span></div>
              </div>
            </div>
          `;
        }

        if (type === 'THREE_CARD_KPI') {
          const cards = d.cards || [];
          return `
            <div class="slide-content">
              <div class="section-heading">
                <h2>${d.title}</h2>
                <p>${d.subtitle || ''}</p>
              </div>
              <div class="kpi-grid">
                ${cards.map((c: any, i: number) => {
                  const borderCol = i === 0 ? '#FF6B00' : (i === 1 ? '#00E5FF' : '#F59E0B');
                  return `
                    <div class="kpi-card" style="border-top-color: ${borderCol}">
                      <div class="kpi-top">
                        <span class="kpi-badge" style="color: ${borderCol}">${c.badge || 'KPI'}</span>
                        <span class="dot" style="background: ${borderCol}"></span>
                      </div>
                      <div class="kpi-value">${c.value}</div>
                      <div class="kpi-label" style="color: ${borderCol}">${c.label}</div>
                      <div class="kpi-desc">${c.description}</div>
                    </div>
                  `;
                }).join('')}
              </div>
            </div>
          `;
        }

        if (type === 'TWO_COLUMN') {
          return `
            <div class="slide-content">
              <div class="section-heading">
                <h2>${d.title}</h2>
                <p>${d.subtitle || ''}</p>
              </div>
              <div class="two-col-grid">
                <div class="col-box orange-box">
                  <span class="col-badge orange-text">${d.leftBadge || 'AS-IS'}</span>
                  <h4>${d.leftTitle}</h4>
                  <ul>
                    ${(d.leftPoints || []).map((p: string) => `<li>${p}</li>`).join('')}
                  </ul>
                </div>
                <div class="col-box cyan-box">
                  <span class="col-badge cyan-text">${d.rightBadge || 'TO-BE'}</span>
                  <h4>${d.rightTitle}</h4>
                  <ul>
                    ${(d.rightPoints || []).map((p: string) => `<li>${p}</li>`).join('')}
                  </ul>
                </div>
              </div>
            </div>
          `;
        }

        if (type === 'TIMELINE_ROADMAP') {
          const phases = d.phases || [];
          return `
            <div class="slide-content">
              <div class="section-heading">
                <h2>${d.title}</h2>
                <p>${d.subtitle || ''}</p>
              </div>
              <div class="timeline-grid">
                ${phases.map((p: any) => {
                  const color = p.status === 'COMPLETED' ? '#00E5FF' : (p.status === 'IN_PROGRESS' ? '#FF6B00' : '#94A3B8');
                  return `
                    <div class="phase-col">
                      <div class="phase-step" style="background: ${color}">${p.step}</div>
                      <div class="phase-card">
                        <div class="phase-duration" style="color: ${color}">${p.duration}</div>
                        <div class="phase-title">${p.phaseName}</div>
                        <div class="phase-deliv">${(p.deliverables || []).join(' • ')}</div>
                      </div>
                    </div>
                  `;
                }).join('')}
              </div>
            </div>
          `;
        }

        // Genérico / Cierre / Conclusión
        return `
          <div class="slide-content center-layout">
            <span class="col-badge orange-text">${type}</span>
            <h2 class="conclusion-title">${d.title}</h2>
            <p class="conclusion-desc">${d.summary || d.problemSummary || ''}</p>
            ${d.ctaButtonText ? `
              <div class="cta-pill">${d.ctaButtonText}</div>
            ` : ''}
          </div>
        `;
      };

      const html = `<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8">
  <title>${deck.title} — Presentación Ejecutiva TSolutions IPIDD</title>
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Bruno+Ace&family=Space+Grotesk:wght@500;700&family=Plus+Jakarta+Sans:wght@400;600;700&family=JetBrains+Mono:wght@400;700&display=swap" rel="stylesheet">
  <style>
    :root {
      --color-primary: #FF6B00;
      --color-cyan: #00E5FF;
      --color-dark: #0A0D14;
      --color-card: #121722;
      --color-white: #FFFFFF;
      --color-pearl: #F8FAFC;
      --color-slate: #94A3B8;
      --font-bruno: 'Bruno Ace', sans-serif;
      --font-heading: 'Space Grotesk', sans-serif;
      --font-sans: 'Plus Jakarta Sans', sans-serif;
      --font-mono: 'JetBrains Mono', monospace;
    }

    * { box-sizing: border-box; margin: 0; padding: 0; }

    body {
      background: #05070B;
      color: var(--color-pearl);
      font-family: var(--font-sans);
      -webkit-print-color-adjust: exact !important;
      print-color-adjust: exact !important;
    }

    /* BARRA DE CONTROL SUPERIOR (NO SE IMPRIME) */
    .no-print-bar {
      position: sticky;
      top: 0;
      z-index: 1000;
      background: rgba(18, 23, 34, 0.95);
      border-bottom: 1px solid rgba(255, 107, 0, 0.3);
      backdrop-filter: blur(8px);
      padding: 12px 24px;
      display: flex;
      justify-content: space-between;
      align-items: center;
      gap: 16px;
      box-shadow: 0 4px 20px rgba(0,0,0,0.6);
    }
    .bar-info {
      display: flex;
      align-items: center;
      gap: 12px;
    }
    .btn-print {
      background: var(--color-primary);
      color: #0A0D14;
      font-family: var(--font-heading);
      font-weight: 800;
      font-size: 13px;
      border: none;
      padding: 10px 20px;
      border-radius: 20px;
      cursor: pointer;
      display: inline-flex;
      align-items: center;
      gap: 8px;
      box-shadow: 0 0 15px rgba(255, 107, 0, 0.4);
      transition: all 0.2s;
    }
    .btn-print:hover {
      transform: translateY(-1px);
      box-shadow: 0 0 25px rgba(255, 107, 0, 0.6);
    }

    /* PÁGINA 16:9 PARA PDF Y PANTALLA */
    .pdf-deck-container {
      display: flex;
      flex-direction: column;
      align-items: center;
      padding: 24px 0;
      gap: 32px;
    }

    .slide-page {
      width: 100%;
      max-width: 1280px;
      aspect-ratio: 16 / 9;
      background: var(--color-dark);
      background-image: 
        linear-gradient(to right, rgba(255, 255, 255, 0.03) 1px, transparent 1px),
        linear-gradient(to bottom, rgba(255, 255, 255, 0.03) 1px, transparent 1px);
      background-size: 36px 36px;
      border: 1px solid rgba(255, 255, 255, 0.12);
      border-radius: 8px;
      box-shadow: 0 12px 40px rgba(0,0,0,0.8);
      display: flex;
      flex-direction: column;
      justify-content: space-between;
      overflow: hidden;
      position: relative;
    }

    /* CABECERA CORPORATIVA DE SLIDE */
    .slide-header {
      padding: 14px 28px;
      border-bottom: 1px solid rgba(255, 255, 255, 0.1);
      display: flex;
      justify-content: space-between;
      align-items: center;
      background: rgba(10, 13, 20, 0.85);
    }
    .brand-brand {
      display: flex;
      align-items: center;
      gap: 10px;
      font-family: var(--font-bruno);
      font-size: 13px;
      color: #FFF;
      letter-spacing: 0.05em;
    }
    .hex-logo {
      width: 20px;
      height: 20px;
      clip-path: polygon(50% 0%, 100% 25%, 100% 75%, 50% 100%, 0% 75%, 0% 25%);
      background: var(--color-primary);
    }
    .layout-badge {
      font-family: var(--font-mono);
      font-size: 10px;
      color: var(--color-cyan);
      background: rgba(0, 229, 255, 0.1);
      border: 1px solid rgba(0, 229, 255, 0.3);
      padding: 2px 8px;
      border-radius: 4px;
      font-weight: 700;
    }
    .slide-number {
      font-family: var(--font-mono);
      font-size: 13px;
      color: var(--color-slate);
    }
    .slide-number strong {
      color: var(--color-primary);
    }

    /* CUERPO CENTRAL DE LA DIAPOSITIVA */
    .slide-content {
      flex: 1;
      display: flex;
      flex-direction: column;
      justify-content: center;
      padding: 24px 36px;
      overflow: hidden;
    }

    .hero-layout {
      align-items: center;
      text-align: center;
    }
    .badge-pill {
      display: inline-flex;
      align-items: center;
      gap: 8px;
      padding: 6px 16px;
      border-radius: 20px;
      background: rgba(255, 107, 0, 0.12);
      border: 1px solid var(--color-primary);
      margin-bottom: 16px;
      font-family: var(--font-mono);
      font-size: 11px;
      color: var(--color-primary);
      font-weight: 800;
      letter-spacing: 0.06em;
    }
    .badge-pill .hex-icon {
      width: 10px;
      height: 10px;
      clip-path: polygon(50% 0%, 100% 25%, 100% 75%, 50% 100%, 0% 75%, 0% 25%);
      background: var(--color-primary);
    }
    .hero-title {
      font-family: var(--font-bruno);
      font-size: 32px;
      color: #FFFFFF;
      margin-bottom: 12px;
      text-transform: uppercase;
      letter-spacing: -0.01em;
      line-height: 1.2;
    }
    .hero-subtitle {
      font-family: var(--font-heading);
      font-size: 15px;
      color: var(--color-cyan);
      margin-bottom: 24px;
      max-width: 750px;
      line-height: 1.5;
    }
    .meta-strip {
      background: var(--color-card);
      border: 1px solid rgba(255, 255, 255, 0.1);
      padding: 10px 24px;
      border-radius: 8px;
      display: flex;
      gap: 20px;
      font-size: 12px;
      color: var(--color-slate);
    }
    .meta-strip strong { color: #FFF; }
    .cyan-text { color: var(--color-cyan); font-weight: 700; }
    .orange-text { color: var(--color-primary); font-weight: 700; }

    /* LAYOUT THREE CARD KPI */
    .section-heading {
      text-align: center;
      margin-bottom: 24px;
    }
    .section-heading h2 {
      font-family: var(--font-bruno);
      font-size: 24px;
      color: #FFF;
      text-transform: uppercase;
      margin-bottom: 6px;
    }
    .section-heading p {
      font-family: var(--font-heading);
      font-size: 13px;
      color: var(--color-cyan);
    }
    .kpi-grid {
      display: grid;
      grid-template-columns: repeat(3, 1fr);
      gap: 20px;
    }
    .kpi-card {
      background: var(--color-card);
      border: 1px solid rgba(255, 255, 255, 0.1);
      border-top: 4px solid var(--color-primary);
      padding: 20px;
      border-radius: 8px;
      display: flex;
      flex-direction: column;
      justify-content: space-between;
    }
    .kpi-top {
      display: flex;
      justify-content: space-between;
      align-items: center;
    }
    .kpi-badge {
      font-size: 11px;
      font-family: var(--font-mono);
      font-weight: 800;
    }
    .kpi-top .dot {
      width: 8px;
      height: 8px;
      border-radius: 50%;
    }
    .kpi-value {
      font-family: var(--font-bruno);
      font-size: 32px;
      color: #FFF;
      margin: 12px 0 4px 0;
    }
    .kpi-label {
      font-family: var(--font-heading);
      font-size: 12px;
      font-weight: 700;
      text-transform: uppercase;
      margin-bottom: 8px;
    }
    .kpi-desc {
      font-size: 11px;
      color: var(--color-pearl);
      line-height: 1.4;
    }

    /* TWO COLUMN */
    .two-col-grid {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 24px;
    }
    .col-box {
      background: var(--color-card);
      border-radius: 8px;
      padding: 20px;
      border: 1px solid rgba(255, 255, 255, 0.1);
    }
    .orange-box { border-color: rgba(255, 107, 0, 0.4); }
    .cyan-box { border-color: rgba(0, 229, 255, 0.4); }
    .col-badge {
      font-size: 10px;
      font-family: var(--font-mono);
      font-weight: 800;
      margin-bottom: 8px;
      display: block;
    }
    .col-box h4 {
      font-family: var(--font-heading);
      font-size: 14px;
      color: #FFF;
      text-transform: uppercase;
      margin-bottom: 12px;
    }
    .col-box ul {
      padding-left: 20px;
      font-size: 12px;
      line-height: 1.5;
      color: var(--color-pearl);
    }
    .col-box li { margin-bottom: 6px; }

    /* TIMELINE */
    .timeline-grid {
      display: grid;
      grid-template-columns: repeat(4, 1fr);
      gap: 16px;
    }
    .phase-col {
      display: flex;
      flex-direction: column;
      align-items: center;
      text-align: center;
    }
    .phase-step {
      width: 36px;
      height: 36px;
      clip-path: polygon(50% 0%, 100% 25%, 100% 75%, 50% 100%, 0% 75%, 0% 25%);
      color: #0A0D14;
      font-family: var(--font-mono);
      font-weight: 800;
      font-size: 13px;
      display: flex;
      align-items: center;
      justify-content: center;
      margin-bottom: 12px;
    }
    .phase-card {
      width: 100%;
      background: var(--color-card);
      border: 1px solid rgba(255, 255, 255, 0.1);
      padding: 12px;
      border-radius: 8px;
      text-align: left;
    }
    .phase-duration {
      font-size: 10px;
      font-family: var(--font-mono);
      font-weight: 700;
    }
    .phase-title {
      font-size: 12px;
      font-weight: 700;
      color: #FFF;
      margin: 4px 0 8px 0;
    }
    .phase-deliv {
      font-size: 11px;
      color: var(--color-slate);
      line-height: 1.4;
    }

    /* CENTER LAYOUT */
    .center-layout {
      align-items: center;
      text-align: center;
      padding: 0 64px;
    }
    .conclusion-title {
      font-family: var(--font-bruno);
      font-size: 26px;
      color: #FFF;
      text-transform: uppercase;
      margin: 12px 0 16px 0;
    }
    .conclusion-desc {
      font-size: 14px;
      color: var(--color-pearl);
      max-width: 700px;
      line-height: 1.6;
      margin-bottom: 24px;
    }
    .cta-pill {
      background: var(--color-primary);
      color: #0A0D14;
      padding: 10px 28px;
      border-radius: 20px;
      font-weight: 800;
      font-family: var(--font-heading);
      font-size: 13px;
      text-transform: uppercase;
      letter-spacing: 0.05em;
    }

    /* PIE FIJO DE DIAPOSITIVA */
    .slide-footer {
      padding: 10px 28px;
      border-top: 1px solid rgba(255, 255, 255, 0.1);
      display: flex;
      justify-content: space-between;
      align-items: center;
      font-size: 11px;
      color: var(--color-slate);
      background: rgba(10, 13, 20, 0.85);
    }
    .footer-watermark {
      display: flex;
      align-items: center;
      gap: 8px;
      font-family: var(--font-mono);
      letter-spacing: 0.05em;
    }
    .dot-orange { width: 7px; height: 7px; border-radius: 50%; background: var(--color-primary); box-shadow: 0 0 10px var(--color-primary); }
    .dot-cyan { width: 7px; height: 7px; border-radius: 50%; background: var(--color-cyan); box-shadow: 0 0 8px var(--color-cyan); }
    .footer-motto {
      font-family: var(--font-mono);
      font-size: 10px;
      opacity: 0.7;
    }

    /* ESTILOS DE IMPRESIÓN PDF NATIVOS 16:9 */
    @page {
      size: landscape;
      margin: 0;
    }

    @media print {
      body {
        background: #0A0D14 !important;
        margin: 0 !important;
        padding: 0 !important;
      }
      .no-print-bar {
        display: none !important;
      }
      .pdf-deck-container {
        padding: 0 !important;
        gap: 0 !important;
      }
      .slide-page {
        width: 100vw !important;
        height: 100vh !important;
        max-width: 100vw !important;
        max-height: 100vh !important;
        margin: 0 !important;
        border: none !important;
        border-radius: 0 !important;
        box-shadow: none !important;
        page-break-after: always !important;
        break-after: page !important;
        background: #0A0D14 !important;
        overflow: hidden !important;
      }
    }
  </style>
</head>
<body>

  <!-- BARRA DE ACCIÓN PREVIA A IMPRESIÓN -->
  <div class="no-print-bar">
    <div class="bar-info">
      <div class="hex-logo"></div>
      <div>
        <strong style="color:#FFF; font-family:var(--font-heading); font-size:14px;">${deck.title}</strong>
        <div style="font-size:11px; color:var(--color-slate); font-family:var(--font-mono);">
          ${slides.length} diapositivas ejecutivas 16:9 • Tokens Oficiales TSolutions IPIDD
        </div>
      </div>
    </div>
    <div style="display:flex; align-items:center; gap:12px;">
      <span style="font-size:11px; color:var(--color-slate);">
        💡 Sugerencia: En el diálogo selecciona <strong>"Guardar como PDF"</strong> y <strong>"Gráficos de fondo"</strong>.
      </span>
      <button class="btn-print" onclick="window.print()">
        <span>🖨️ Exportar / Imprimir PDF</span>
      </button>
    </div>
  </div>

  <!-- CONTENEDOR MULTI-PÁGINA 16:9 -->
  <div class="pdf-deck-container">
    ${slides.map((s: any, idx: number) => `
      <div class="slide-page">
        <!-- CABECERA -->
        <div class="slide-header">
          <div class="brand-brand">
            <div class="hex-logo"></div>
            <span>TSOLUTIONS <span style="color:var(--color-primary)">IPIDD</span></span>
            <span class="layout-badge">${s.layout_type}</span>
          </div>
          <div class="slide-number">
            <strong>${String(idx + 1).padStart(2, '0')}</strong> / ${String(slides.length).padStart(2, '0')}
          </div>
        </div>

        <!-- CONTENIDO -->
        ${renderSlideBody(s)}

        <!-- PIE DE PÁGINA -->
        <div class="slide-footer">
          <div class="footer-watermark">
            <span class="dot-orange"></span>
            <span class="dot-cyan"></span>
            <span>TSOLUTIONS IPIDD • SYSTEM ARCHITECTURE & OPEX</span>
          </div>
          <div class="footer-motto">
            Tecnología instalada. Conocimiento transferido. Negocios escalados.
          </div>
        </div>
      </div>
    `).join('')}
  </div>

</body>
</html>`;

      res.setHeader('Content-Type', 'text/html; charset=utf-8');
      res.send(html);
    } catch (err: unknown) {
      console.error('[Export PDF Presentation Error]:', err);
      res.status(500).send(`<h1>Error al generar vista de exportación: ${(err as Error).message}</h1>`);
    }
  });

  /**
   * POST /api/v1/presentations
   * Creación manual de un mazo de diapositivas
   */
  router.post('/', async (req: Request, res: Response): Promise<void> => {
    try {
      const workspaceId = (req as any).workspaceId || req.body.workspace_id || DEFAULT_WORKSPACE_ID;
      const { projectId, title, description, aspectRatio } = req.body;

      if (!title) {
        res.status(400).json({ error: 'El título del mazo es obligatorio.' });
        return;
      }

      const result = await pool.query(
        `INSERT INTO presentation_decks (workspace_id, project_id, author_id, title, description, aspect_ratio)
         VALUES ($1, $2, $3, $4, $5, $6)
         RETURNING *`,
        [workspaceId, projectId || null, (req as any).user?.id || null, title, description || '', aspectRatio || '16:9']
      );

      res.status(201).json(result.rows[0]);
    } catch (err: unknown) {
      console.error('[Create Presentation Error]:', err);
      res.status(500).json({ error: (err as Error).message });
    }
  });

  /**
   * DELETE /api/v1/presentations/:id
   * Elimina un mazo (las diapositivas se eliminan en cascada)
   */
  router.delete('/:id', async (req: Request, res: Response): Promise<void> => {
    try {
      const { id } = req.params;
      const workspaceId = (req as any).workspaceId || DEFAULT_WORKSPACE_ID;

      const result = await pool.query(
        `DELETE FROM presentation_decks WHERE id = $1 AND workspace_id = $2 RETURNING id`,
        [id, workspaceId]
      );

      if (result.rows.length === 0) {
        res.status(404).json({ error: 'Mazo no encontrado o sin permisos.' });
        return;
      }

      res.status(200).json({ success: true, deletedId: id });
    } catch (err: unknown) {
      console.error('[Delete Presentation Error]:', err);
      res.status(500).json({ error: (err as Error).message });
    }
  });

  /**
   * POST /api/v1/presentations/:id/slides
   * Agrega una diapositiva a un mazo
   */
  router.post('/:id/slides', async (req: Request, res: Response): Promise<void> => {
    try {
      const { id } = req.params;
      const { slideIndex, layoutType, slideData } = req.body;

      const validatedLayout = SlideLayoutTypeSchema.safeParse(layoutType);
      if (!validatedLayout.success) {
        res.status(400).json({ error: `Layout inválido. Permitidos: ${SlideLayoutTypeSchema.options.join(', ')}` });
        return;
      }

      const result = await pool.query(
        `INSERT INTO presentation_slides (deck_id, slide_index, layout_type, slide_data)
         VALUES ($1, $2, $3, $4)
         RETURNING *`,
        [id, slideIndex || 1, validatedLayout.data, JSON.stringify(slideData || {})]
      );

      res.status(201).json(result.rows[0]);
    } catch (err: unknown) {
      console.error('[Add Slide Error]:', err);
      res.status(500).json({ error: (err as Error).message });
    }
  });

  /**
   * PUT /api/v1/presentations/:id/slides/:slideId
   * Actualiza el contenido de una diapositiva
   */
  router.put('/:id/slides/:slideId', async (req: Request, res: Response): Promise<void> => {
    try {
      const { slideId } = req.params;
      const { slideIndex, layoutType, slideData } = req.body;

      const updates: string[] = [];
      const values: any[] = [];
      let valIdx = 1;

      if (slideIndex !== undefined) {
        updates.push(`slide_index = $${valIdx++}`);
        values.push(slideIndex);
      }
      if (layoutType) {
        updates.push(`layout_type = $${valIdx++}`);
        values.push(layoutType);
      }
      if (slideData) {
        updates.push(`slide_data = $${valIdx++}`);
        values.push(JSON.stringify(slideData));
      }

      if (updates.length === 0) {
        res.status(400).json({ error: 'No se enviaron datos para actualizar.' });
        return;
      }

      values.push(slideId);
      const query = `UPDATE presentation_slides SET ${updates.join(', ')} WHERE id = $${valIdx} RETURNING *`;

      const result = await pool.query(query, values);
      if (result.rows.length === 0) {
        res.status(404).json({ error: 'Diapositiva no encontrada.' });
        return;
      }

      res.status(200).json(result.rows[0]);
    } catch (err: unknown) {
      console.error('[Update Slide Error]:', err);
      res.status(500).json({ error: (err as Error).message });
    }
  });

  /**
   * DELETE /api/v1/presentations/:id/slides/:slideId
   * Elimina una diapositiva específica
   */
  router.delete('/:id/slides/:slideId', async (req: Request, res: Response): Promise<void> => {
    try {
      const { slideId } = req.params;
      const result = await pool.query(
        `DELETE FROM presentation_slides WHERE id = $1 RETURNING id`,
        [slideId]
      );

      if (result.rows.length === 0) {
        res.status(404).json({ error: 'Diapositiva no encontrada.' });
        return;
      }

      res.status(200).json({ success: true, deletedId: slideId });
    } catch (err: unknown) {
      console.error('[Delete Slide Error]:', err);
      res.status(500).json({ error: (err as Error).message });
    }
  });

  return router;
}

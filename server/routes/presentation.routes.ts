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

import { Pool } from 'pg';
import { withWorkspaceClient } from '../middleware/workspace.middleware';

export class OpexService {
  constructor(private pool: Pool) {}

  // ==========================================================================
  // 1. 5 PORQUÉS (FIVE WHYS)
  // ==========================================================================

  public async createFiveWhys(
    workspaceId: string,
    projectId: string,
    data: {
      problem: string;
      why_1: string;
      why_2?: string;
      why_3?: string;
      why_4?: string;
      why_5?: string;
      root_cause: string;
      corrective_task_title?: string;
    }
  ) {
    return await withWorkspaceClient(this.pool, workspaceId, async (client) => {
      let correctiveTaskId: string | null = null;

      // Crear automáticamente tarea de acción correctiva en To-Do si se especificó
      if (data.corrective_task_title) {
        const taskRes = await client.query(
          `INSERT INTO project_tasks (workspace_id, project_id, title, description, priority, status)
           VALUES ($1, $2, $3, $4, 'HIGH', 'TODO')
           RETURNING id`,
          [
            workspaceId,
            projectId,
            `[Acción Correctiva 5W] ${data.corrective_task_title}`,
            `Generada automáticamente por análisis de causa raíz: ${data.root_cause}`
          ]
        );
        correctiveTaskId = taskRes.rows[0].id;
      }

      const res = await client.query(
        `INSERT INTO opex_five_whys (
          workspace_id, project_id, problem, why_1, why_2, why_3, why_4, why_5, root_cause, corrective_task_id
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
        RETURNING *`,
        [
          workspaceId,
          projectId,
          data.problem,
          data.why_1,
          data.why_2 || null,
          data.why_3 || null,
          data.why_4 || null,
          data.why_5 || null,
          data.root_cause,
          correctiveTaskId
        ]
      );
      return res.rows[0];
    });
  }

  public async getFiveWhys(workspaceId: string, projectId: string) {
    return await withWorkspaceClient(this.pool, workspaceId, async (client) => {
      const res = await client.query(
        `SELECT fw.*, pt.title as corrective_task_title, pt.status as corrective_task_status
         FROM opex_five_whys fw
         LEFT JOIN project_tasks pt ON fw.corrective_task_id = pt.id
         WHERE fw.workspace_id = $1 AND fw.project_id = $2
         ORDER BY fw.created_at DESC`,
        [workspaceId, projectId]
      );
      return res.rows;
    });
  }

  // ==========================================================================
  // 2. ISHIKAWA (FISHBONE DIAGRAM - 6M)
  // ==========================================================================

  public async createIshikawaDiagram(
    workspaceId: string,
    projectId: string,
    data: { title: string; problem_statement: string }
  ) {
    return await withWorkspaceClient(this.pool, workspaceId, async (client) => {
      const res = await client.query(
        `INSERT INTO opex_ishikawa_diagrams (workspace_id, project_id, title, problem_statement)
         VALUES ($1, $2, $3, $4)
         RETURNING *`,
        [workspaceId, projectId, data.title, data.problem_statement]
      );
      return res.rows[0];
    });
  }

  public async addIshikawaFactor(
    workspaceId: string,
    diagramId: string,
    data: {
      category: 'MANPOWER' | 'MACHINERY' | 'METHODS' | 'MATERIALS' | 'MEASUREMENT' | 'ENVIRONMENT';
      factor_text: string;
      weight?: number;
    }
  ) {
    return await withWorkspaceClient(this.pool, workspaceId, async (client) => {
      const res = await client.query(
        `INSERT INTO opex_ishikawa_factors (diagram_id, workspace_id, category, factor_text, weight)
         VALUES ($1, $2, $3, $4, $5)
         RETURNING *`,
        [diagramId, workspaceId, data.category, data.factor_text, data.weight || 1]
      );
      return res.rows[0];
    });
  }

  public async voteIshikawaFactor(workspaceId: string, factorId: string) {
    return await withWorkspaceClient(this.pool, workspaceId, async (client) => {
      const res = await client.query(
        `UPDATE opex_ishikawa_factors
         SET votes = votes + 1
         WHERE id = $1 AND workspace_id = $2
         RETURNING *`,
        [factorId, workspaceId]
      );
      return res.rows[0];
    });
  }

  public async getIshikawaDiagramDetails(workspaceId: string, diagramId: string) {
    return await withWorkspaceClient(this.pool, workspaceId, async (client) => {
      const diagRes = await client.query(
        `SELECT * FROM opex_ishikawa_diagrams WHERE id = $1 AND workspace_id = $2`,
        [diagramId, workspaceId]
      );

      if (diagRes.rows.length === 0) {
        throw new Error('Ishikawa diagram not found');
      }

      const factorsRes = await client.query(
        `SELECT * FROM opex_ishikawa_factors 
         WHERE diagram_id = $1 AND workspace_id = $2
         ORDER BY category ASC, votes DESC, weight DESC`,
        [diagramId, workspaceId]
      );

      return {
        diagram: diagRes.rows[0],
        factors: factorsRes.rows
      };
    });
  }

  // ==========================================================================
  // 3. FODA (SWOT ITEMS)
  // ==========================================================================

  public async addSwotItem(
    workspaceId: string,
    projectId: string,
    data: {
      type: 'STRENGTH' | 'WEAKNESS' | 'OPPORTUNITY' | 'THREAT';
      description: string;
      impact_level?: string;
      score?: number;
    }
  ) {
    return await withWorkspaceClient(this.pool, workspaceId, async (client) => {
      const res = await client.query(
        `INSERT INTO opex_swot_items (workspace_id, project_id, type, description, impact_level, score)
         VALUES ($1, $2, $3, $4, $5, $6)
         RETURNING *`,
        [
          workspaceId,
          projectId,
          data.type,
          data.description,
          data.impact_level || 'MEDIUM',
          data.score || 1
        ]
      );
      return res.rows[0];
    });
  }

  public async getSwotItems(workspaceId: string, projectId: string) {
    return await withWorkspaceClient(this.pool, workspaceId, async (client) => {
      const res = await client.query(
        `SELECT * FROM opex_swot_items
         WHERE workspace_id = $1 AND project_id = $2
         ORDER BY type ASC, score DESC, created_at DESC`,
        [workspaceId, projectId]
      );
      return res.rows;
    });
  }

  // ==========================================================================
  // 4. ANÁLISIS DE PARETO (80/20)
  // ==========================================================================

  public async recordParetoData(
    workspaceId: string,
    projectId: string,
    data: { category: string; frequency: number; cost?: number }
  ) {
    return await withWorkspaceClient(this.pool, workspaceId, async (client) => {
      const res = await client.query(
        `INSERT INTO opex_pareto_data (workspace_id, project_id, category, frequency, cost)
         VALUES ($1, $2, $3, $4, $5)
         RETURNING *`,
        [workspaceId, projectId, data.category, data.frequency, data.cost || 0]
      );
      return res.rows[0];
    });
  }

  public async getParetoAnalysis(workspaceId: string, projectId: string) {
    return await withWorkspaceClient(this.pool, workspaceId, async (client) => {
      const res = await client.query(
        `SELECT * FROM opex_pareto_data
         WHERE workspace_id = $1 AND project_id = $2
         ORDER BY frequency DESC`,
        [workspaceId, projectId]
      );

      const items = res.rows;
      const totalFrequency = items.reduce((sum, item) => sum + Number(item.frequency), 0);

      let runningCumulative = 0;
      const analyzedItems = items.map(item => {
        const freq = Number(item.frequency);
        runningCumulative += freq;
        const cumulativePercentage = totalFrequency > 0
          ? Math.round((runningCumulative / totalFrequency) * 1000) / 10
          : 0;

        return {
          id: item.id,
          category: item.category,
          frequency: freq,
          cost: Number(item.cost),
          cumulativeFrequency: runningCumulative,
          cumulativePercentage,
          isVital80: cumulativePercentage <= 80.0
        };
      });

      return {
        totalFrequency,
        vitalCount: analyzedItems.filter(i => i.isVital80).length,
        items: analyzedItems
      };
    });
  }
}

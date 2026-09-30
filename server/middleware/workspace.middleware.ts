import { Request, Response, NextFunction } from 'express';
import { Pool, PoolClient } from 'pg';

declare global {
  namespace Express {
    interface Request {
      workspaceId?: string;
    }
  }
}

export const DEFAULT_WORKSPACE_ID = '00000000-0000-0000-0000-000000000001';

/**
 * Middleware para aislamiento multi-tenant estricto de workspaces.
 * Extrae el workspace activo de 'x-workspace-id' o de los claims del JWT,
 * valida los permisos del usuario y rechaza con 403 si el recurso es ajeno.
 */
export function requireWorkspace(pool: Pool) {
  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const headerWs = req.headers['x-workspace-id'] as string;
      const queryWs = req.query.workspace_id as string;
      const userClaimWs = (req.user as any)?.workspace_id || (req.user as any)?.workspaces?.[0];

      const workspaceId = headerWs || queryWs || userClaimWs || DEFAULT_WORKSPACE_ID;

      // Validación de formato UUID
      const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
      if (!uuidRegex.test(workspaceId)) {
        res.status(400).json({
          error: 'Invalid workspace ID format. Must be a valid UUID.'
        });
        return;
      }

      // Si el usuario está autenticado, validar membresía en el workspace
      if (req.user) {
        if (req.user.role !== 'ADMIN') {
          // Si tiene lista de proyectos autorizados o workspaces en JWT, verificar
          const userProjects = req.user.projects || [];
          const userWorkspaces = (req.user as any)?.workspaces || [];

          if (userWorkspaces.length > 0 && !userWorkspaces.includes(workspaceId)) {
            res.status(403).json({
              error: `FORBIDDEN: User does not have access to workspace '${workspaceId}'`
            });
            return;
          }

          // Consultar membresía en tabla workspace_members si no es el workspace default
          if (workspaceId !== DEFAULT_WORKSPACE_ID) {
            const memberCheck = await pool.query(
              `SELECT role FROM workspace_members WHERE workspace_id = $1 AND user_id = $2`,
              [workspaceId, req.user.sub]
            );

            if (memberCheck.rows.length === 0) {
              res.status(403).json({
                error: `FORBIDDEN: Access denied. User '${req.user.email}' is not a member of workspace '${workspaceId}'.`
              });
              return;
            }
          }
        }
      }

      req.workspaceId = workspaceId;
      next();
    } catch (err: any) {
      res.status(500).json({ error: `Workspace isolation error: ${err.message}` });
    }
  };
}

/**
 * Ejecuta operaciones en base de datos estableciendo app.current_workspace_id
 * para respetar las políticas de Row-Level Security (RLS) en PostgreSQL.
 */
export async function withWorkspaceClient<T>(
  pool: Pool,
  workspaceId: string,
  callback: (client: PoolClient) => Promise<T>
): Promise<T> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query(`SELECT set_config('app.current_workspace_id', $1, true)`, [workspaceId]);
    const result = await callback(client);
    await client.query('COMMIT');
    return result;
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

import { Router, Request, Response } from 'express';
import { Pool } from 'pg';
import { Server as SocketIOServer } from 'socket.io';
import { generateNeonAuthToken, authenticateNeonAuth, UserRole } from '../middleware/auth.middleware';
import { DEFAULT_WORKSPACE_ID, withWorkspaceClient } from '../middleware/workspace.middleware';

export function createAuthRouter(pool: Pool, io?: SocketIOServer): Router {
  const router = Router();

  /**
   * Helper para asegurar que exista la audiencia de CRM en marketing_audiences
   */
  async function ensureCrmAudience(client: any, workspaceId: string): Promise<string> {
    const audRes = await client.query(
      `SELECT id FROM marketing_audiences WHERE name = 'CRM Leads vc.tsolutionsipidd.com' LIMIT 1`
    );
    if (audRes.rows.length > 0) {
      return audRes.rows[0].id;
    }

    // Obtener un project_id válido o el primero disponible
    const projRes = await client.query(`SELECT id FROM projects WHERE workspace_id = $1 LIMIT 1`, [workspaceId]);
    const projectId = projRes.rows[0]?.id;

    if (!projectId) {
      return '';
    }

    const newAud = await client.query(
      `INSERT INTO marketing_audiences (project_id, workspace_id, name, description)
       VALUES ($1, $2, 'CRM Leads vc.tsolutionsipidd.com', 'Leads capturados desde la pantalla de bienvenida y signup gratuito')
       RETURNING id`,
      [projectId, workspaceId]
    );
    return newAud.rows[0].id;
  }

  /**
   * Helper para nutrir el CRM de vc.tsolutionsipidd.com
   */
  async function nurtureCrmLead(
    client: any,
    workspaceId: string,
    userData: {
      userId: string;
      email: string;
      name: string;
      role: string;
      company?: string;
      authProvider: string;
    }
  ) {
    try {
      // 1. Registrar en marketing_contacts si existe la audiencia
      const audienceId = await ensureCrmAudience(client, workspaceId);
      if (audienceId) {
        await client.query(
          `INSERT INTO marketing_contacts (audience_id, email, first_name, custom_metadata, is_subscribed)
           VALUES ($1, $2, $3, $4, true)
           ON CONFLICT (audience_id, email) DO UPDATE
           SET first_name = EXCLUDED.first_name,
               custom_metadata = EXCLUDED.custom_metadata`,
          [
            audienceId,
            userData.email,
            userData.name,
            JSON.stringify({
              company: userData.company || 'Independiente / Particular',
              role: userData.role,
              crm_source: 'vc.tsolutionsipidd.com',
              channel: 'NEXUS_SUITE_FREE_ACCESS',
              provider: userData.authProvider,
              registered_at: new Date().toISOString()
            })
          ]
        );
      }

      // 2. Registrar evento formal de auditoría y captación de lead
      await client.query(
        `INSERT INTO audit_events_log (
           workspace_id, user_id, action, resource_type, resource_id, metadata
         ) VALUES ($1, $2, 'CRM_LEAD_NURTURED', 'crm_lead', $3, $4)`,
        [
          workspaceId,
          userData.userId,
          userData.email,
          JSON.stringify({
            crm_target: 'vc.tsolutionsipidd.com',
            user_name: userData.name,
            role: userData.role,
            company: userData.company,
            provider: userData.authProvider,
            legal_consent: true,
            timestamp: new Date().toISOString()
          })
        ]
      );

      // 3. Notificar vía WebSocket a los administradores en vivo
      if (io) {
        io.to(`workspace_${workspaceId}`).emit('CRM_LEAD_CAPTURED', {
          email: userData.email,
          name: userData.name,
          role: userData.role,
          provider: userData.authProvider,
          timestamp: new Date().toISOString()
        });
      }
    } catch (err: any) {
      console.warn('[CRM Sync Warning]:', err.message);
    }
  }

  /**
   * POST /api/v1/auth/signup
   * Registro gratuito abierto a cualquier dominio de correo con consentimiento legal
   */
  router.post('/signup', async (req: Request, res: Response) => {
    try {
      const { name, email, company, role, consent_privacy, consent_data_usage, provider } = req.body;

      if (!email || typeof email !== 'string' || !email.includes('@')) {
        res.status(400).json({ error: 'Proporciona una dirección de correo electrónico válida (cualquier dominio es aceptado).' });
        return;
      }

      if (!name || typeof name !== 'string' || name.trim().length === 0) {
        res.status(400).json({ error: 'El nombre completo es requerido para expedir la credencial gratuita.' });
        return;
      }

      // Requisito Legal Estricto
      if (consent_privacy !== true || consent_data_usage !== true) {
        res.status(400).json({
          error: 'LEGAL_CONSENT_REQUIRED: Es obligatorio aceptar el Aviso de Privacidad y el Consentimiento de Uso de Datos para acceder de forma gratuita y ser registrado en el CRM oficial de vc.tsolutionsipidd.com.'
        });
        return;
      }

      const assignedRole: UserRole = (role === 'ADMIN' || role === 'COLLABORATOR' || role === 'CLIENT')
        ? role
        : 'CLIENT';

      const authProvider = provider || 'neon_oauth';
      const cleanEmail = email.trim().toLowerCase();
      const cleanName = name.trim();
      const cleanCompany = (company || '').trim();

      const user = await withWorkspaceClient(pool, DEFAULT_WORKSPACE_ID, async (client) => {
        // Upsert en tabla users
        const userRes = await client.query(
          `INSERT INTO users (name, email, role, auth_provider, consent_privacy_at, consent_data_usage_at, company)
           VALUES ($1, $2, $3, $4, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, $5)
           ON CONFLICT (email) DO UPDATE
           SET name = EXCLUDED.name,
               role = COALESCE(users.role, EXCLUDED.role),
               auth_provider = EXCLUDED.auth_provider,
               consent_privacy_at = CURRENT_TIMESTAMP,
               consent_data_usage_at = CURRENT_TIMESTAMP,
               company = COALESCE(EXCLUDED.company, users.company)
           RETURNING id, name, email, role, company, auth_provider, created_at`,
          [cleanName, cleanEmail, assignedRole, authProvider, cleanCompany]
        );

        const createdUser = userRes.rows[0];

        // Membresía en workspace predeterminado
        await client.query(
          `INSERT INTO workspace_members (workspace_id, user_id, role)
           VALUES ($1, $2, $3)
           ON CONFLICT (workspace_id, user_id) DO UPDATE SET role = EXCLUDED.role`,
          [DEFAULT_WORKSPACE_ID, createdUser.id, createdUser.role]
        );

        // Nutrir el CRM de vc.tsolutionsipidd.com
        await nurtureCrmLead(client, DEFAULT_WORKSPACE_ID, {
          userId: createdUser.id,
          email: createdUser.email,
          name: createdUser.name,
          role: createdUser.role,
          company: createdUser.company,
          authProvider
        });

        return createdUser;
      });

      // Generar JWT de sesión Neon Auth
      const token = generateNeonAuthToken({
        sub: user.id,
        email: user.email,
        role: user.role,
        projects: ['*']
      });

      res.status(201).json({
        success: true,
        message: 'Acceso gratuito autorizado y perfil registrado en el CRM de vc.tsolutionsipidd.com',
        token,
        user: {
          id: user.id,
          name: user.name,
          email: user.email,
          role: user.role,
          company: user.company,
          auth_provider: user.auth_provider
        }
      });
    } catch (err: any) {
      console.error('[Auth Signup Error]:', err);
      res.status(500).json({ error: err.message || 'Error interno durante el registro' });
    }
  });

  /**
   * POST /api/v1/auth/login
   * Login directo o Instant-Onboarding para cualquier dominio de correo
   */
  router.post('/login', async (req: Request, res: Response) => {
    try {
      const { email, name, consent_privacy, consent_data_usage, provider } = req.body;

      if (!email || typeof email !== 'string' || !email.includes('@')) {
        res.status(400).json({ error: 'Proporciona una dirección de correo válida.' });
        return;
      }

      const cleanEmail = email.trim().toLowerCase();
      const authProvider = provider || 'neon_oauth';

      const user = await withWorkspaceClient(pool, DEFAULT_WORKSPACE_ID, async (client) => {
        const checkRes = await client.query(
          `SELECT id, name, email, role, company, auth_provider FROM users WHERE email = $1`,
          [cleanEmail]
        );

        if (checkRes.rows.length > 0) {
          const existingUser = checkRes.rows[0];
          // Actualizar consentimiento si fue provisto
          if (consent_privacy && consent_data_usage) {
            await client.query(
              `UPDATE users
               SET consent_privacy_at = CURRENT_TIMESTAMP,
                   consent_data_usage_at = CURRENT_TIMESTAMP,
                   auth_provider = $1
               WHERE id = $2`,
              [authProvider, existingUser.id]
            );
          }
          return existingUser;
        }

        // Si no existe, registro instantáneo sin fricción (requiere consentimiento)
        if (consent_privacy !== true || consent_data_usage !== true) {
          throw new Error('FIRST_LOGIN_CONSENT_REQUIRED: Este correo no está registrado aún. Para acceder gratis y vincularte al CRM, acepta el Aviso de Privacidad y Términos.');
        }

        const fallbackName = name ? name.trim() : cleanEmail.split('@')[0];
        const newRes = await client.query(
          `INSERT INTO users (name, email, role, auth_provider, consent_privacy_at, consent_data_usage_at)
           VALUES ($1, $2, 'CLIENT', $3, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
           RETURNING id, name, email, role, company, auth_provider`,
          [fallbackName, cleanEmail, authProvider]
        );
        const newUser = newRes.rows[0];

        await client.query(
          `INSERT INTO workspace_members (workspace_id, user_id, role)
           VALUES ($1, $2, $3)
           ON CONFLICT DO NOTHING`,
          [DEFAULT_WORKSPACE_ID, newUser.id, newUser.role]
        );

        await nurtureCrmLead(client, DEFAULT_WORKSPACE_ID, {
          userId: newUser.id,
          email: newUser.email,
          name: newUser.name,
          role: newUser.role,
          authProvider
        });

        return newUser;
      });

      const token = generateNeonAuthToken({
        sub: user.id,
        email: user.email,
        role: user.role,
        projects: ['*']
      });

      res.json({
        success: true,
        message: 'Sesión iniciada correctamente',
        token,
        user
      });
    } catch (err: any) {
      if (err.message && err.message.startsWith('FIRST_LOGIN_CONSENT_REQUIRED')) {
        res.status(403).json({ error: err.message, code: 'LEGAL_CONSENT_NEEDED' });
        return;
      }
      console.error('[Auth Login Error]:', err);
      res.status(500).json({ error: err.message || 'Error al autenticar' });
    }
  });

  /**
   * POST /api/v1/auth/neon-oauth
   * Callback unificado para proveedores OAuth (Google, GitHub, Neon Social)
   */
  router.post('/neon-oauth', async (req: Request, res: Response) => {
    try {
      const { provider, email, name, avatar_url, consent_privacy, consent_data_usage } = req.body;

      if (!email || !email.includes('@')) {
        res.status(400).json({ error: 'El proveedor OAuth no retornó un correo electrónico válido.' });
        return;
      }

      if (consent_privacy !== true || consent_data_usage !== true) {
        res.status(400).json({
          error: 'LEGAL_CONSENT_REQUIRED: Para continuar con el acceso gratuito mediante OAuth, debes autorizar el Aviso de Privacidad y el Uso de Datos para el CRM.'
        });
        return;
      }

      const cleanEmail = email.trim().toLowerCase();
      const userName = (name || cleanEmail.split('@')[0]).trim();
      const authProvider = provider || 'neon_oauth';

      const user = await withWorkspaceClient(pool, DEFAULT_WORKSPACE_ID, async (client) => {
        const userRes = await client.query(
          `INSERT INTO users (name, email, role, auth_provider, consent_privacy_at, consent_data_usage_at)
           VALUES ($1, $2, 'CLIENT', $3, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
           ON CONFLICT (email) DO UPDATE
           SET name = COALESCE(EXCLUDED.name, users.name),
               auth_provider = EXCLUDED.auth_provider,
               consent_privacy_at = CURRENT_TIMESTAMP,
               consent_data_usage_at = CURRENT_TIMESTAMP
           RETURNING id, name, email, role, company, auth_provider`,
          [userName, cleanEmail, authProvider]
        );

        const oauthUser = userRes.rows[0];

        await client.query(
          `INSERT INTO workspace_members (workspace_id, user_id, role)
           VALUES ($1, $2, $3)
           ON CONFLICT (workspace_id, user_id) DO UPDATE SET role = EXCLUDED.role`,
          [DEFAULT_WORKSPACE_ID, oauthUser.id, oauthUser.role]
        );

        await nurtureCrmLead(client, DEFAULT_WORKSPACE_ID, {
          userId: oauthUser.id,
          email: oauthUser.email,
          name: oauthUser.name,
          role: oauthUser.role,
          authProvider
        });

        return oauthUser;
      });

      const token = generateNeonAuthToken({
        sub: user.id,
        email: user.email,
        role: user.role,
        projects: ['*']
      });

      res.json({
        success: true,
        message: `Autenticación OAuth (${authProvider}) exitosa`,
        token,
        user
      });
    } catch (err: any) {
      console.error('[OAuth Callback Error]:', err);
      res.status(500).json({ error: err.message || 'Error en autenticación OAuth' });
    }
  });

  /**
   * GET /api/v1/auth/me
   * Retorna el perfil autenticado actual
   */
  router.get('/me', authenticateNeonAuth, async (req: Request, res: Response) => {
    try {
      const userId = req.user?.sub;
      const email = req.user?.email;

      const userRes = await pool.query(
        `SELECT id, name, email, role, company, auth_provider, consent_privacy_at, created_at
         FROM users
         WHERE id::text = $1 OR email = $2
         LIMIT 1`,
        [userId, email]
      );

      if (userRes.rows.length === 0) {
        res.json({
          authenticated: true,
          user: req.user
        });
        return;
      }

      res.json({
        authenticated: true,
        user: userRes.rows[0]
      });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  /**
   * GET /api/v1/auth/legal
   * Textos oficiales e inmutables del Aviso de Privacidad y Términos de Uso de Datos
   */
  router.get('/legal', (_req: Request, res: Response) => {
    res.json({
      entity: 'TSolutions IPIDD • Tecnologías y Soluciones Integrales IPIDD S.A.S. de C.V.',
      platforms: ['Nexus Architect Suite', 'Rose vCard (vc.tsolutionsipidd.com)', 'Identidad (identidad.tsolutionsipidd.com)'],
      crm_target: 'vc.tsolutionsipidd.com',
      last_updated: '2026-10-04',
      privacy_notice_short: 'Tus datos están protegidos bajo la LFPDPPP y estándares internacionales. El acceso a la plataforma es 100% gratuito. Al registrarte autorizas la vinculación de tu contacto al CRM oficial de TSolutions IPIDD para recibir valor, soporte y seguimiento.',
      terms_short: 'Acceso irrestricto y gratuito para exploración técnica, DAG de arquitectura y asistentes de IA. Desuscripción disponible en cualquier momento con 1 clic conforme a RFC 8058.'
    });
  });

  return router;
}

import fs from 'fs';
import path from 'path';
import { Router, Request, Response } from 'express';
import { Pool } from 'pg';
import { Server as SocketIOServer } from 'socket.io';
import multer from 'multer';
import { IntegrationHubService } from '../services/integrationHub.service';
import { UniversalImportService } from '../services/universalImport.service';
import { NexusBrainService } from '../services/nexusBrain.service';
import { createDocumentIngestionQueue } from '../workers/documentIngestion.worker';
import { authenticateNeonAuth } from '../middleware/auth.middleware';
import { validateBody } from '../middleware/validate.middleware';
import { withWorkspaceClient, DEFAULT_WORKSPACE_ID } from '../middleware/workspace.middleware';
import {
  ConnectIntegrationSchema,
  LinkGitHubRepoSchema,
  LinkGitLabProjectSchema,
  ImportPayloadSchema,
  NexusQuerySchema
} from '../validation/schemas';

// Configuración de Multer para almacenamiento seguro en disco con límite de 25 MB
const uploadDir = path.join(process.cwd(), 'uploads', 'documents');
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => {
    cb(null, uploadDir);
  },
  filename: (_req, file, cb) => {
    const uniqueSuffix = `${Date.now()}-${Math.round(Math.random() * 1e9)}`;
    const ext = path.extname(file.originalname);
    cb(null, `doc-${uniqueSuffix}${ext}`);
  }
});

const upload = multer({
  storage,
  limits: {
    fileSize: 25 * 1024 * 1024 // 25 MB máximo
  },
  fileFilter: (_req, file, cb) => {
    const allowedMimes = [
      'application/pdf',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'application/msword',
      'text/plain',
      'text/markdown',
      'application/json',
      'application/x-yaml',
      'text/yaml'
    ];
    const allowedExtensions = ['.pdf', '.docx', '.doc', '.txt', '.md', '.json', '.yaml', '.yml'];
    const ext = path.extname(file.originalname).toLowerCase();

    if (allowedMimes.includes(file.mimetype) || allowedExtensions.includes(ext)) {
      cb(null, true);
    } else {
      cb(new Error('Tipo de archivo no permitido. Solo se admiten PDF, DOCX, TXT, MD, JSON y YAML.'));
    }
  }
});

export function createNexusStudioRouter(
  pool: Pool,
  io?: SocketIOServer,
  redisUrl?: string
): Router {
  const router = Router();
  const integrationHub = new IntegrationHubService(pool, io);
  const universalImport = new UniversalImportService(pool, io);
  const nexusBrain = new NexusBrainService(pool, io);
  const docQueue = createDocumentIngestionQueue(redisUrl);

  // ==========================================================================
  // 1. HUB DE INTEGRACIONES (GITHUB, GITLAB, GOOGLE TASKS)
  // ==========================================================================

  router.post(
    '/integrations/connect',
    authenticateNeonAuth,
    validateBody(ConnectIntegrationSchema),
    async (req: Request, res: Response) => {
      const wsId = req.workspaceId || DEFAULT_WORKSPACE_ID;
      const { provider, credentials, metadata } = req.body;

      try {
        const record = await integrationHub.saveIntegration(wsId, provider, credentials, metadata);
        res.status(201).json({
          success: true,
          message: `Integración con ${provider} conectada y cifrada con éxito.`,
          integration: record
        });
      } catch (err: unknown) {
        res.status(500).json({ error: (err as Error).message });
      }
    }
  );

  router.get('/integrations', authenticateNeonAuth, async (req: Request, res: Response) => {
    const wsId = req.workspaceId || DEFAULT_WORKSPACE_ID;
    try {
      const integrations = await integrationHub.listIntegrations(wsId);
      res.json(integrations);
    } catch (err: unknown) {
      res.status(500).json({ error: (err as Error).message });
    }
  });

  router.post(
    '/integrations/github/link-repo',
    authenticateNeonAuth,
    validateBody(LinkGitHubRepoSchema),
    async (req: Request, res: Response) => {
      const wsId = req.workspaceId || DEFAULT_WORKSPACE_ID;
      const { project_id, owner, repo_name } = req.body;

      try {
        const result = await integrationHub.linkGitHubRepo(wsId, project_id, owner, repo_name);
        res.json(result);
      } catch (err: unknown) {
        res.status(500).json({ error: (err as Error).message });
      }
    }
  );

  router.post(
    '/integrations/gitlab/link-project',
    authenticateNeonAuth,
    validateBody(LinkGitLabProjectSchema),
    async (req: Request, res: Response) => {
      const wsId = req.workspaceId || DEFAULT_WORKSPACE_ID;
      const { project_id, gitlab_path } = req.body;

      try {
        const result = await integrationHub.linkGitLabProject(wsId, project_id, gitlab_path);
        res.json(result);
      } catch (err: unknown) {
        res.status(500).json({ error: (err as Error).message });
      }
    }
  );

  router.post(
    '/integrations/google-tasks/sync',
    authenticateNeonAuth,
    async (req: Request, res: Response) => {
      const wsId = req.workspaceId || DEFAULT_WORKSPACE_ID;
      const { taskId, title, dueDate, status } = req.body;

      if (!taskId || !title) {
        res.status(400).json({ error: 'taskId and title are required' });
        return;
      }

      try {
        const result = await integrationHub.syncTaskToGoogleTasks(wsId, taskId, {
          title,
          due_date: dueDate,
          status: status || 'TODO'
        });
        res.json(result);
      } catch (err: unknown) {
        res.status(500).json({ error: (err as Error).message });
      }
    }
  );

  // ==========================================================================
  // 2. MOTOR DE IMPORTACIÓN UNIVERSAL DE PROYECTOS & TAREAS
  // ==========================================================================

  router.post(
    '/projects/import/preflight',
    authenticateNeonAuth,
    async (req: Request, res: Response) => {
      try {
        const result = await universalImport.preflightValidation(req.body);
        res.json(result);
      } catch (err: unknown) {
        res.status(500).json({ error: (err as Error).message });
      }
    }
  );

  router.post(
    '/projects/import',
    authenticateNeonAuth,
    validateBody(ImportPayloadSchema),
    async (req: Request, res: Response) => {
      const wsId = req.workspaceId || DEFAULT_WORKSPACE_ID;
      const { project_id, format, data, mapping } = req.body;

      try {
        const result = await universalImport.executeImport(wsId, project_id, {
          format,
          data,
          mapping
        });
        res.status(201).json({
          success: true,
          message: `Se importaron ${result.importedCount} tareas exitosamente.`,
          result
        });
      } catch (err: unknown) {
        res.status(500).json({ error: (err as Error).message });
      }
    }
  );

  router.get('/projects/import/logs', authenticateNeonAuth, async (req: Request, res: Response) => {
    const wsId = req.workspaceId || DEFAULT_WORKSPACE_ID;
    const projectId = req.query.project_id as string | undefined;

    try {
      const logs = await withWorkspaceClient(pool, wsId, async (client) => {
        let query = `SELECT * FROM project_imports_log WHERE workspace_id = $1`;
        const params: any[] = [wsId];

        if (projectId) {
          query += ` AND project_id = $2`;
          params.push(projectId);
        }

        query += ` ORDER BY created_at DESC LIMIT 50`;
        const res = await client.query(query, params);
        return res.rows;
      });

      res.json(logs);
    } catch (err: unknown) {
      res.status(500).json({ error: (err as Error).message });
    }
  });

  // ==========================================================================
  // 3. PIPELINE DE CARGA Y ASIMILACIÓN DOCUMENTAL
  // ==========================================================================

  router.post(
    '/documents/upload',
    authenticateNeonAuth,
    upload.single('file'),
    async (req: Request, res: Response): Promise<void> => {
      const wsId = req.workspaceId || DEFAULT_WORKSPACE_ID;
      const file = req.file;

      if (!file) {
        res.status(400).json({ error: 'No se subió ningún archivo o el archivo excede los 25 MB.' });
        return;
      }

      const projectId = (req.body.project_id as string) || null;
      const title = (req.body.title as string) || file.originalname;

      try {
        const docRecord = await withWorkspaceClient(pool, wsId, async (client) => {
          const insertRes = await client.query(
            `INSERT INTO workspace_documents (
               workspace_id, project_id, title, filename, mime_type, file_size_bytes, storage_path, parsing_status
             ) VALUES ($1, $2, $3, $4, $5, $6, $7, 'PENDING')
             RETURNING *`,
            [
              wsId,
              projectId,
              title,
              file.originalname,
              file.mimetype,
              file.size,
              file.path
            ]
          );
          return insertRes.rows[0];
        });

        // Encolar trabajo de ingestión y vectorización
        await docQueue.add('ingest-doc', {
          documentId: docRecord.id,
          workspaceId: wsId,
          projectId,
          filename: file.originalname,
          mimeType: file.mimetype,
          storagePath: file.path
        });

        res.status(202).json({
          success: true,
          message: 'Documento recibido y encolado para asimilación semántica en Nexus.',
          document: docRecord
        });
      } catch (err: unknown) {
        res.status(500).json({ error: (err as Error).message });
      }
    }
  );

  router.get('/documents', authenticateNeonAuth, async (req: Request, res: Response) => {
    const wsId = req.workspaceId || DEFAULT_WORKSPACE_ID;
    const projectId = req.query.project_id as string | undefined;

    try {
      const docs = await withWorkspaceClient(pool, wsId, async (client) => {
        let query = `SELECT * FROM workspace_documents WHERE workspace_id = $1`;
        const params: any[] = [wsId];

        if (projectId) {
          query += ` AND project_id = $2`;
          params.push(projectId);
        }

        query += ` ORDER BY created_at DESC`;
        const res = await client.query(query, params);
        return res.rows;
      });

      res.json(docs);
    } catch (err: unknown) {
      res.status(500).json({ error: (err as Error).message });
    }
  });

  // ==========================================================================
  // 4. CHAT ASISTIDO POR IA NEXUS (RAG CON DOCUMENTOS Y PROYECTOS ARCHIVADOS)
  // ==========================================================================

  router.post(
    '/nexus/ask',
    authenticateNeonAuth,
    validateBody(NexusQuerySchema),
    async (req: Request, res: Response) => {
      const wsId = req.workspaceId || DEFAULT_WORKSPACE_ID;
      const { query, min_similarity, domain_filter } = req.body;

      try {
        const result = await nexusBrain.queryNexus(wsId, query, min_similarity, domain_filter);
        res.json(result);
      } catch (err: unknown) {
        res.status(500).json({ error: (err as Error).message });
      }
    }
  );

  return router;
}

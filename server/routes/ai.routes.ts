import { Router, Request, Response } from 'express';
import { Pool } from 'pg';
import { Server as SocketIOServer } from 'socket.io';
import { AIGatewayService } from '../services/aiGateway.service';

export function createAIRoutes(pool: Pool, io?: SocketIOServer): Router {
  const router = Router();
  const aiGateway = new AIGatewayService(pool, io);

  // 1. Blueprint Engine AI
  const handleBlueprint = async (req: Request, res: Response): Promise<void> => {
    try {
      const { projectId, projectDescription, techStack } = req.body;
      if (!projectId || !projectDescription) {
        res.status(400).json({ error: 'Missing projectId or projectDescription.' });
        return;
      }
      const dag = await aiGateway.generateBlueprintDAG(projectId, projectDescription, techStack || {});
      res.status(200).json({ success: true, dag });
    } catch (err: unknown) {
      console.error('[AI Gateway Blueprint Error]:', err);
      res.status(500).json({ error: (err as Error).message });
    }
  };
  router.post('/blueprint/generate', handleBlueprint);
  router.post('/blueprint', handleBlueprint);

  // 2. DevOps Triage AI
  const handleTriage = async (req: Request, res: Response): Promise<void> => {
    try {
      const { projectId, failureLog, workflowPath, commitMessage } = req.body;
      if (!projectId || !failureLog) {
        res.status(400).json({ error: 'Missing projectId or failureLog.' });
        return;
      }
      const triage = await aiGateway.triageDevOpsFailure(
        projectId,
        failureLog,
        workflowPath || '.github/workflows/ci.yml',
        commitMessage || 'Automated build execution'
      );
      res.status(200).json({ success: true, triage });
    } catch (err: unknown) {
      console.error('[AI Gateway Triage Error]:', err);
      res.status(500).json({ error: (err as Error).message });
    }
  };
  router.post('/triage/analyze', handleTriage);
  router.post('/devops-triage', handleTriage);

  // 3. Task Planner AI
  const handleTaskBreakdown = async (req: Request, res: Response): Promise<void> => {
    try {
      const { projectId, taskTitle, taskDescription } = req.body;
      if (!projectId || !taskTitle) {
        res.status(400).json({ error: 'Missing projectId or taskTitle.' });
        return;
      }
      const plan = await aiGateway.planTaskBreakdown(projectId, taskTitle, taskDescription || '');
      res.status(200).json({ success: true, plan });
    } catch (err: unknown) {
      console.error('[AI Gateway Tasks Error]:', err);
      res.status(500).json({ error: (err as Error).message });
    }
  };
  router.post('/tasks/breakdown', handleTaskBreakdown);
  router.post('/decompose-task', handleTaskBreakdown);

  // 4. Marketing Email Copy AI
  const handleMarketingCopy = async (req: Request, res: Response): Promise<void> => {
    try {
      const { projectId, campaignGoal, targetAudience, tone } = req.body;
      if (!projectId || !campaignGoal || !targetAudience) {
        res.status(400).json({ error: 'Missing projectId, campaignGoal, or targetAudience.' });
        return;
      }
      const copy = await aiGateway.generateEmailMarketingCopy(projectId, campaignGoal, targetAudience, tone);
      res.status(200).json({ success: true, copy });
    } catch (err: unknown) {
      console.error('[AI Gateway Marketing Error]:', err);
      res.status(500).json({ error: (err as Error).message });
    }
  };
  router.post('/marketing/generate-copy', handleMarketingCopy);
  router.post('/marketing-copy', handleMarketingCopy);
  router.post('/email-copy', handleMarketingCopy);

  // 5. Executive Status Report AI
  const handleExecutiveReport = async (req: Request, res: Response): Promise<void> => {
    try {
      const projectId = req.params.projectId || req.body.projectId;
      if (!projectId) {
        res.status(400).json({ error: 'Missing projectId parameter or body field.' });
        return;
      }
      const report = await aiGateway.generateExecutiveStatusReport(projectId);
      res.status(200).json({ success: true, report });
    } catch (err: unknown) {
      console.error('[AI Gateway Executive Report Error]:', err);
      res.status(500).json({ error: (err as Error).message });
    }
  };
  router.get('/executive-report/:projectId', handleExecutiveReport);
  router.post('/executive-report', handleExecutiveReport);

  return router;
}

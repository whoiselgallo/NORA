import { z } from 'zod';

// ==========================================
// 1. BLUEPRINT ENGINE AI (DAG SCHEMA)
// ==========================================
export const BlueprintNodeTaskSchema = z.object({
  title: z.string().min(1),
  description: z.string().min(1),
});

export const BlueprintNodeSchema = z.object({
  id: z.string().min(1),
  title: z.string().min(1),
  category: z.enum(['infra', 'backend', 'frontend', 'devops', 'qa', 'marketing']),
  position_x: z.number(),
  position_y: z.number(),
  is_automated_github: z.boolean(),
  github_trigger_event: z.string().nullable(),
  tasks: z.array(BlueprintNodeTaskSchema).min(1),
});

export const BlueprintEdgeSchema = z.object({
  source: z.string().min(1),
  target: z.string().min(1),
});

export const BlueprintDAGSchema = z.object({
  nodes: z.array(BlueprintNodeSchema).min(1),
  edges: z.array(BlueprintEdgeSchema),
});

export type BlueprintDAG = z.infer<typeof BlueprintDAGSchema>;
export type BlueprintNode = z.infer<typeof BlueprintNodeSchema>;
export type BlueprintEdge = z.infer<typeof BlueprintEdgeSchema>;

// ==========================================
// 2. DEVOPS TRIAGE AI (CI/CD FAILURE DIAGNOSIS)
// ==========================================
export const DevOpsTriageSchema = z.object({
  root_cause: z.string().min(1),
  severity: z.enum(['CRITICAL', 'HIGH', 'MEDIUM']),
  suggested_fix: z.string().min(1),
  client_friendly_summary: z.string().min(1),
});

export type DevOpsTriage = z.infer<typeof DevOpsTriageSchema>;

// ==========================================
// 3. TASK PLANNER AI (SUBTASK BREAKDOWN)
// ==========================================
export const SubtaskItemSchema = z.object({
  title: z.string().min(1),
  acceptance_criteria: z.string().min(1),
  suggested_role: z.enum(['ADMIN', 'COLLABORATOR', 'CLIENT']),
});

export const TaskPlannerSchema = z.object({
  subtasks: z.array(SubtaskItemSchema).min(2).max(7),
  estimated_complexity: z.enum(['LOW', 'MEDIUM', 'HIGH']),
});

export type TaskPlanner = z.infer<typeof TaskPlannerSchema>;
export type SubtaskItem = z.infer<typeof SubtaskItemSchema>;

// ==========================================
// 4. EMAIL MARKETING AI (COPY & DELIVERABILITY)
// ==========================================
export const EmailMarketingCopySchema = z.object({
  subject_lines: z.array(z.string()).min(2),
  preview_text: z.string().max(120),
  html_body: z.string().min(10),
  plain_text_body: z.string().min(10),
  spam_risk_score: z.number().min(1).max(10),
  spam_warnings: z.array(z.string()),
});

export type EmailMarketingCopy = z.infer<typeof EmailMarketingCopySchema>;

// ==========================================
// 5. EXECUTIVE STATUS AI (CLIENT TRANSLATION)
// ==========================================
export const ExecutiveStatusReportSchema = z.object({
  executive_summary: z.string().min(1),
  overall_health: z.enum(['ON_TRACK', 'NEEDS_ATTENTION', 'AT_RISK']),
  completed_milestones: z.array(z.string()),
  upcoming_focus: z.array(z.string()),
  business_impact: z.string().min(1),
});

export type ExecutiveStatusReport = z.infer<typeof ExecutiveStatusReportSchema>;

// ==========================================
// GATEWAY CALL CONTEXT
// ==========================================
export interface OperationalProjectContext {
  projectId: string;
  projectName: string;
  description: string;
  techStack: Record<string, unknown>;
  githubRepo: {
    owner: string;
    name: string;
  };
  nodes: Array<{
    id: string;
    title: string;
    category: string;
    status: 'RED' | 'GREEN';
    tasksCount: number;
    completedTasksCount: number;
  }>;
  recentTelemetry: Array<{
    eventType: string;
    status: string;
    commitSha: string;
    durationSeconds: number;
    receivedAt: string;
  }>;
  collaborators: Array<{
    id: string;
    name: string;
    role: string;
    activeTasks: number;
  }>;
}

// ==========================================
// 6. CAD SVG VECTOR DESIGN AGENT
// ==========================================
export const CadSvgDesignSchema = z.object({
  svgCode: z.string().min(1),
  designType: z.enum(['ISOTIPO', 'LOGOTIPO', 'IMAGOTIPO', 'ISOLOGO']),
  brandName: z.string().min(1),
  conceptRationale: z.string().min(1),
  geometricFormulas: z.string().min(1),
  viewBox: z.string().min(1),
  colorPalette: z.array(z.string()).min(1),
  cssFontImport: z.string().optional(),
  suggestedUse: z.string().optional()
});

export type CadSvgDesign = z.infer<typeof CadSvgDesignSchema>;


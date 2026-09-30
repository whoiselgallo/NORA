import { z } from 'zod';

/**
 * Esquema estricto para mutación y creación de tareas del proyecto
 * Requisitos:
 * - title: min 3, max 200 caracteres
 * - description: opcional / nullable
 * - status: valores estrictos 'TODO' | 'IN_PROGRESS' | 'REVIEW' | 'DONE'
 * - priority: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL'
 * - assigned_to: formato UUID
 * - due_date: formato fecha ISO (ISO 8601)
 */
export const TaskMutationSchema = z.object({
  title: z
    .string({ required_error: 'Title is required' })
    .trim()
    .min(3, 'Title must be at least 3 characters long')
    .max(200, 'Title cannot exceed 200 characters'),
  description: z.string().max(2000).optional().nullable(),
  status: z.enum(['TODO', 'IN_PROGRESS', 'REVIEW', 'DONE'], {
    errorMap: () => ({ message: 'Status must be one of: TODO, IN_PROGRESS, REVIEW, DONE' })
  }),
  priority: z.enum(['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'], {
    errorMap: () => ({ message: 'Priority must be one of: LOW, MEDIUM, HIGH, CRITICAL' })
  }),
  assigned_to: z.string().uuid('assigned_to must be a valid UUID').optional().nullable(),
  due_date: z
    .string()
    .datetime({ message: 'due_date must be a valid ISO 8601 datetime string' })
    .optional()
    .nullable(),
  node_id: z.string().uuid('node_id must be a valid UUID').optional().nullable()
});

export const TaskCreateSchema = TaskMutationSchema.extend({
  status: z.enum(['TODO', 'IN_PROGRESS', 'REVIEW', 'DONE']).default('TODO'),
  priority: z.enum(['LOW', 'MEDIUM', 'HIGH', 'CRITICAL']).default('MEDIUM')
});

export const TaskStatusUpdateSchema = z.object({
  status: z.enum(['TODO', 'IN_PROGRESS', 'REVIEW', 'DONE'], {
    errorMap: () => ({ message: 'Status must be one of: TODO, IN_PROGRESS, REVIEW, DONE' })
  })
});

/**
 * Esquemas para tipar y validar Webhooks de GitHub
 * Valida workflow_run, push, pull_request asegurando identificadores numéricos, commit sha, ramas y conclusiones
 */
const WorkflowRunEventSchema = z.object({
  action: z.string().optional(),
  workflow_run: z.object({
    id: z.number({ required_error: 'workflow_run.id (numeric) is required' }),
    name: z.string().optional(),
    head_sha: z.string({ required_error: 'workflow_run.head_sha (commit SHA) is required' }).min(7),
    head_branch: z.string({ required_error: 'workflow_run.head_branch (branch name) is required' }).min(1),
    conclusion: z.string().nullable().optional(),
    status: z.string().optional(),
    created_at: z.string().optional(),
    updated_at: z.string().optional()
  }),
  repository: z.object({
    id: z.number({ required_error: 'repository.id (numeric) is required' }),
    name: z.string(),
    full_name: z.string({ required_error: 'repository.full_name is required' }),
    owner: z.object({
      login: z.string()
    }).optional()
  })
});

const PushEventSchema = z.object({
  ref: z.string({ required_error: 'ref (branch) is required' }).min(1),
  before: z.string({ required_error: 'before commit sha is required' }),
  after: z.string({ required_error: 'after commit sha is required' }),
  commits: z.array(
    z.object({
      id: z.string(),
      message: z.string(),
      timestamp: z.string().optional()
    })
  ).optional(),
  repository: z.object({
    id: z.number({ required_error: 'repository.id (numeric) is required' }),
    name: z.string(),
    full_name: z.string({ required_error: 'repository.full_name is required' })
  })
});

const PullRequestEventSchema = z.object({
  action: z.string({ required_error: 'action is required' }),
  number: z.number({ required_error: 'pull_request.number (numeric) is required' }),
  pull_request: z.object({
    id: z.number({ required_error: 'pull_request.id (numeric) is required' }),
    head: z.object({
      sha: z.string({ required_error: 'pull_request.head.sha is required' }),
      ref: z.string({ required_error: 'pull_request.head.ref (branch) is required' })
    }),
    base: z.object({
      sha: z.string(),
      ref: z.string()
    }),
    state: z.string(),
    merged: z.boolean().optional(),
    conclusion: z.string().nullable().optional()
  }),
  repository: z.object({
    id: z.number({ required_error: 'repository.id (numeric) is required' }),
    name: z.string(),
    full_name: z.string({ required_error: 'repository.full_name is required' })
  })
});

const PingEventSchema = z.object({
  zen: z.string().optional(),
  hook_id: z.number().optional()
});

export const GitHubWebhookSchema = z.union([
  WorkflowRunEventSchema,
  PushEventSchema,
  PullRequestEventSchema,
  PingEventSchema
]);

/**
 * Esquemas de Validación para Campañas de Marketing y Suscripciones
 */
export const CreateCampaignSchema = z.object({
  name: z.string().trim().min(3, 'Campaign name must be at least 3 characters long').max(255),
  template_id: z.string().uuid('template_id must be a valid UUID'),
  audience_id: z.string().uuid('audience_id must be a valid UUID'),
  project_id: z.string().uuid('project_id must be a valid UUID')
});

export const CreateTemplateSchema = z.object({
  project_id: z.string().uuid('project_id must be a valid UUID'),
  name: z.string().trim().min(3, 'Template name must be at least 3 characters long').max(255),
  subject: z.string().trim().min(1, 'Subject cannot be empty').max(255),
  preview_text: z.string().max(255).optional().nullable(),
  html_body: z.string().min(5, 'html_body must contain valid HTML content'),
  plain_text_body: z.string().optional().nullable()
});

export const SubscribeContactSchema = z.object({
  audience_id: z.string().uuid('audience_id must be a valid UUID'),
  email: z.string().trim().email('Valid email address is required').max(255),
  first_name: z.string().trim().max(100).optional().nullable(),
  last_name: z.string().trim().max(100).optional().nullable(),
  custom_metadata: z.record(z.unknown()).optional().default({})
});

export const ProviderWebhookSchema = z.object({
  event: z.string({ required_error: 'event is required' }),
  email: z.string({ required_error: 'email is required' }).trim().email('Valid email address is required'),
  reason: z.string().optional()
});

export const CreateProjectSchema = z.object({
  name: z.string().trim().min(3, 'Project name must be at least 3 characters long').max(255),
  description: z.string().max(2000).optional().nullable(),
  github_repo: z.string().optional(),
  github_repo_owner: z.string().optional(),
  github_repo_name: z.string().optional(),
  tech_stack: z.record(z.unknown()).optional().default({})
});

export type TaskMutation = z.infer<typeof TaskMutationSchema>;
export type TaskCreate = z.infer<typeof TaskCreateSchema>;
export type GitHubWebhookPayload = z.infer<typeof GitHubWebhookSchema>;
export type CreateCampaignInput = z.infer<typeof CreateCampaignSchema>;
export type CreateTemplateInput = z.infer<typeof CreateTemplateSchema>;
export type SubscribeContactInput = z.infer<typeof SubscribeContactSchema>;

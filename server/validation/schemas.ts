import { z } from 'zod';

/**
 * Esquema estricto para mutación y creación de tareas del proyecto
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
  sprint_id: z.string().uuid().optional().nullable(),
  story_points: z.number().int().min(0).default(0),
  start_date: z.string().datetime().optional().nullable(),
  due_date: z
    .string()
    .datetime({ message: 'due_date must be a valid ISO 8601 datetime string' })
    .optional()
    .nullable(),
  node_id: z.string().uuid('node_id must be a valid UUID').optional().nullable(),
  workspace_id: z.string().uuid().optional()
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
  project_id: z.string().uuid('project_id must be a valid UUID'),
  workspace_id: z.string().uuid().optional()
});

export const CreateTemplateSchema = z.object({
  project_id: z.string().uuid('project_id must be a valid UUID'),
  workspace_id: z.string().uuid().optional(),
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
  tech_stack: z.record(z.unknown()).optional().default({}),
  workspace_id: z.string().uuid().optional()
});

/**
 * ----------------------------------------------------------------------------
 * ESQUEMAS PARA MULTI-WORKSPACE, CALENDARIO, ÁGILE, OPEX Y NOTAS
 * ----------------------------------------------------------------------------
 */

// Workspaces
export const CreateWorkspaceSchema = z.object({
  name: z.string().trim().min(2).max(255),
  slug: z.string().trim().min(2).max(100).regex(/^[a-z0-9-]+$/, 'Slug must be URL-safe (lowercase, digits, hyphens)'),
  description: z.string().max(1000).optional().nullable()
});

// Calendario Maestro
export const CreateCalendarEventSchema = z.object({
  project_id: z.string().uuid().optional().nullable(),
  title: z.string().trim().min(2).max(255),
  description: z.string().optional().nullable(),
  start_date: z.string().datetime(),
  due_date: z.string().datetime(),
  event_type: z.enum(['TASK', 'GANTT_MILESTONE', 'SPRINT', 'CUSTOM']).default('CUSTOM'),
  priority: z.enum(['LOW', 'MEDIUM', 'HIGH', 'CRITICAL']).default('MEDIUM')
});

// Scrum Sprints
export const CreateSprintSchema = z.object({
  project_id: z.string().uuid('project_id must be a valid UUID'),
  name: z.string().trim().min(2).max(255),
  goal: z.string().max(2000).optional().nullable(),
  start_date: z.string().datetime(),
  end_date: z.string().datetime()
});

// Kanban Card Movement
export const MoveKanbanCardSchema = z.object({
  task_id: z.string().uuid('task_id must be a valid UUID'),
  target_column_id: z.string().uuid('target_column_id must be a valid UUID'),
  new_position: z.number().int().min(0).default(0)
});

// Gantt Dependencies & Reschedule
export const CreateGanttDependencySchema = z.object({
  predecessor_id: z.string().uuid('predecessor_id must be a valid UUID'),
  successor_id: z.string().uuid('successor_id must be a valid UUID'),
  dependency_type: z.enum(['FS', 'SS', 'FF', 'SF']).default('FS'),
  lag_days: z.number().int().default(0)
});

export const RescheduleGanttTaskSchema = z.object({
  new_start_date: z.string().datetime(),
  new_due_date: z.string().datetime()
});

// OPEX: 5 Porqués
export const CreateFiveWhysSchema = z.object({
  project_id: z.string().uuid('project_id must be a valid UUID'),
  problem: z.string().trim().min(5).max(2000),
  why_1: z.string().trim().min(2).max(1000),
  why_2: z.string().trim().max(1000).optional().nullable(),
  why_3: z.string().trim().max(1000).optional().nullable(),
  why_4: z.string().trim().max(1000).optional().nullable(),
  why_5: z.string().trim().max(1000).optional().nullable(),
  root_cause: z.string().trim().min(5).max(2000),
  corrective_task_title: z.string().trim().max(255).optional().nullable()
});

// OPEX: Ishikawa
export const CreateIshikawaDiagramSchema = z.object({
  project_id: z.string().uuid('project_id must be a valid UUID'),
  title: z.string().trim().min(3).max(255),
  problem_statement: z.string().trim().min(5).max(2000)
});

export const AddIshikawaFactorSchema = z.object({
  category: z.enum(['MANPOWER', 'MACHINERY', 'METHODS', 'MATERIALS', 'MEASUREMENT', 'ENVIRONMENT']),
  factor_text: z.string().trim().min(2).max(1000),
  weight: z.number().int().min(1).max(10).default(1)
});

// OPEX: FODA (SWOT)
export const CreateSwotItemSchema = z.object({
  project_id: z.string().uuid('project_id must be a valid UUID'),
  type: z.enum(['STRENGTH', 'WEAKNESS', 'OPPORTUNITY', 'THREAT']),
  description: z.string().trim().min(2).max(2000),
  impact_level: z.enum(['LOW', 'MEDIUM', 'HIGH', 'CRITICAL']).default('MEDIUM'),
  score: z.number().int().min(1).max(10).default(1)
});

// OPEX: Pareto
export const CreateParetoDataSchema = z.object({
  project_id: z.string().uuid('project_id must be a valid UUID'),
  category: z.string().trim().min(2).max(100),
  frequency: z.number().int().min(1),
  cost: z.number().min(0).default(0)
});

// Notes
export const CreateNoteSchema = z.object({
  title: z.string().trim().min(1).max(255),
  content: z.string().default(''),
  tags: z.array(z.string().trim()).default([]),
  is_pinned: z.boolean().default(false)
});

export const UpdateNoteSchema = z.object({
  title: z.string().trim().min(1).max(255).optional(),
  content: z.string().optional(),
  tags: z.array(z.string().trim()).optional(),
  is_pinned: z.boolean().optional()
});

// Webhook Master Telemetry Payload
export const MasterWebhookPayloadSchema = z.object({
  event: z.string({ required_error: 'event identifier is required' }),
  routingKey: z.string().optional(),
  commit_sha: z.string().optional(),
  branch: z.string().optional(),
  author: z.string().optional(),
  workflow_status: z.enum(['success', 'failure', 'cancelled']).optional(),
  phases_detail: z.array(z.record(z.unknown())).optional(),
  timestamp: z.string().optional(),
  projectId: z.string().uuid().optional(),
  workspaceId: z.string().uuid().optional(),
  eventId: z.string().uuid().optional(),
  title: z.string().optional(),
  dueDate: z.string().optional(),
  priority: z.string().optional(),
  isOverdue: z.boolean().optional()
});

// Subdominios Hijos Integrados al Webhook Master
export const SupportedChildSubdomainsEnum = z.enum([
  'vc.tsolutionsipidd.com',
  'tsolutionsipidd.com',
  'admin.lacuevadelguero.com',
  's.tsolutionsipidd.com',
  'm.tsolutionsipidd.com',
  'lacuevadelguero.com',
  's.lacuevadelguero.com'
]);

export const ChildSubdomainKeyEnum = z.enum([
  'vc',
  'main_tsolutions',
  'admin_lacueva',
  's_tsolutions',
  'm_tsolutions',
  'main_lacueva',
  's_lacueva'
]);

export const ChildWebhookPayloadSchema = z.object({
  domain: SupportedChildSubdomainsEnum.optional(),
  subdomain_key: ChildSubdomainKeyEnum.optional(),
  event: z.string().optional(),
  event_type: z.string().optional(),
  timestamp: z.string().optional(),
  source: z.string().optional(),
  workspace_id: z.string().uuid().optional(),
  project_id: z.string().uuid().optional(),
  signature: z.string().optional(),
  data: z.record(z.unknown()).optional(),
  payload: z.record(z.unknown()).optional()
}).passthrough();

export type ChildWebhookPayload = z.infer<typeof ChildWebhookPayloadSchema>;

// DMAIC & OPEX Corrective Action Schemas
export const UpdateDmaicPhaseSchema = z.object({
  charter_problem_statement: z.string().optional(),
  charter_business_case: z.string().optional(),
  charter_goal: z.string().optional(),
  charter_scope: z.string().optional(),
  sipoc_data: z.record(z.unknown()).optional(),
  measure_baseline_metrics: z.record(z.unknown()).optional(),
  analyze_findings: z.record(z.unknown()).optional(),
  improve_action_plan: z.record(z.unknown()).optional(),
  control_plan: z.record(z.unknown()).optional()
});

export const ApproveTollgateSchema = z.object({
  approved_by: z.string().uuid().optional().nullable()
});

export const CreateCorrectiveActionSchema = z.object({
  title: z.string().trim().min(3).max(255),
  description: z.string().optional(),
  failedNodeId: z.string().uuid().optional(),
  fiveWhysId: z.string().uuid().optional(),
  ishikawaFactorId: z.string().uuid().optional(),
  startDate: z.string().datetime().optional(),
  dueDate: z.string().datetime().optional()
});

export const CompileDeliverableSchema = z.object({
  author_id: z.string().uuid().optional().nullable()
});

/**
 * Esquemas para Cierre Formal de Proyectos y Consulta Asistida en Nexus
 */
export const ProjectCloseSchema = z.object({
  client_sign_off_name: z
    .string({ required_error: 'client_sign_off_name is required' })
    .trim()
    .min(2, 'client_sign_off_name must have at least 2 characters'),
  client_feedback_rating: z
    .number({ required_error: 'client_feedback_rating is required' })
    .int()
    .min(1, 'Rating must be at least 1')
    .max(5, 'Rating cannot exceed 5'),
  client_comments: z.string().max(2000).optional().nullable(),
  final_roi_amount: z.number().nonnegative().optional(),
  final_cycle_time_days: z.number().nonnegative().optional(),
  final_sigma_level: z.number().min(1).max(6).optional()
});

export const NexusQuerySchema = z.object({
  query: z
    .string({ required_error: 'query is required' })
    .trim()
    .min(2, 'query must be at least 2 characters long'),
  min_similarity: z.number().min(0).max(1).default(0.75).optional(),
  domain_filter: z
    .enum(['ARCHITECTURE_STACK', 'OPEX_ROOT_CAUSE', 'METRICS_AND_ROI', 'LESSONS_LEARNED', 'SOP_PROCEDURES', 'DOCUMENT_INGESTION'])
    .optional()
});

// Nexus Architect Studio: Integraciones & Importador Universal
export const ConnectIntegrationSchema = z.object({
  provider: z.enum(['github', 'gitlab', 'google_tasks']),
  credentials: z.object({
    accessToken: z.string().min(1, 'accessToken is required'),
    refreshToken: z.string().optional(),
    webhookSecret: z.string().optional(),
    tokenType: z.string().optional()
  }).passthrough(),
  metadata: z.record(z.unknown()).optional().default({})
});

export const LinkGitHubRepoSchema = z.object({
  project_id: z.string().uuid(),
  owner: z.string().min(1),
  repo_name: z.string().min(1)
});

export const LinkGitLabProjectSchema = z.object({
  project_id: z.string().uuid(),
  gitlab_path: z.string().min(1)
});

export const ImportPayloadSchema = z.object({
  project_id: z.string().uuid(),
  format: z.enum(['JSON', 'CSV', 'TRELLO', 'MONDAY', 'ASANA', 'JIRA']),
  data: z.union([z.array(z.record(z.unknown())), z.string()]),
  mapping: z.object({
    titleColumn: z.string().optional(),
    descriptionColumn: z.string().optional(),
    priorityColumn: z.string().optional(),
    statusColumn: z.string().optional(),
    dueDateColumn: z.string().optional(),
    assigneeColumn: z.string().optional()
  }).optional()
});

export const NexusOnboardingSessionSchema = z.object({
  // Vector 1: Arquetipo de Proyecto
  archetype: z.enum([
    'BIOLINK',
    'LANDING_PAGE',
    'DIGITAL_MENU',
    'BRAND_IDENTITY',
    'CORPORATE_WEB',
    'WEB_WITH_API',
    'ECOMMERCE',
    'SAAS_WEBAPP',
    'OPEX_MANAGEMENT'
  ]),

  // Vector 2: Datos del Propietario (Cliente)
  client_name: z.string().trim().min(2, 'El nombre o razón social debe tener al menos 2 caracteres').max(255),
  client_email: z.string().trim().email('Correo electrónico del representante no es válido'),
  company_name: z.string().trim().max(255).optional().nullable(),
  target_domain: z.string().trim().max(255).optional().nullable(),

  // Vector 3: Matriz RACI del Equipo de Trabajo
  raci: z.object({
    tech_lead_name: z.string().trim().max(255).optional().nullable(),
    tech_lead_email: z.string().trim().email().optional().nullable(),
    project_manager_name: z.string().trim().max(255).optional().nullable(),
    project_manager_email: z.string().trim().email().optional().nullable(),
    collaborators: z.array(z.object({
      name: z.string().trim().min(2),
      email: z.string().trim().email()
    })).optional().default([])
  }).optional().default({}),

  // Vector 4: Requerimientos Técnicos e Integraciones
  technical: z.object({
    repository_provider: z.enum(['GITHUB', 'GITLAB', 'BLUEPRINT_GENERATED']).default('BLUEPRINT_GENERATED'),
    github_repo: z.string().trim().max(255).optional().nullable(),
    payment_gateway: z.enum(['NONE', 'STRIPE', 'CLIP', 'MERCADOPAGO']).default('NONE'),
    enable_google_tasks: z.boolean().default(false)
  }).optional().default({}),

  // Vector 5: Marco Comercial & Modelo de Contratación
  commercial: z.object({
    package_code: z.string().trim().min(2, 'Debe especificar el código del paquete de servicio'),
    payment_terms: z.enum(['50/50', '30/30/40', 'MONTHLY_LICENSE', 'ANNUAL']).default('50/50'),
    target_delivery_date: z.string().optional().nullable(),
    custom_price: z.number().positive().optional().nullable()
  }),

  // Metadatos adicionales del proyecto
  project_name: z.string().trim().min(3, 'El nombre del proyecto debe tener al menos 3 caracteres').max(255),
  project_description: z.string().trim().max(2000).optional().nullable()
});

export type TaskMutation = z.infer<typeof TaskMutationSchema>;
export type TaskCreate = z.infer<typeof TaskCreateSchema>;
export type GitHubWebhookPayload = z.infer<typeof GitHubWebhookSchema>;
export type CreateCampaignInput = z.infer<typeof CreateCampaignSchema>;
export type CreateTemplateInput = z.infer<typeof CreateTemplateSchema>;
export type SubscribeContactInput = z.infer<typeof SubscribeContactSchema>;
export type ProjectCloseInput = z.infer<typeof ProjectCloseSchema>;
export type NexusQueryInput = z.infer<typeof NexusQuerySchema>;
export type NexusOnboardingSessionInput = z.infer<typeof NexusOnboardingSessionSchema>;




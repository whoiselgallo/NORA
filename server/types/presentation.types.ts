import { z } from 'zod';

export const SlideLayoutTypeSchema = z.enum([
  'HERO_COVER',
  'TWO_COLUMN',
  'THREE_CARD_KPI',
  'TIMELINE_ROADMAP',
  'OPEX_PROBLEM_STATEMENT',
  'CODE_AND_ARCHITECTURE',
  'CONCLUSION_CTA'
]);

export type SlideLayoutType = z.infer<typeof SlideLayoutTypeSchema>;

// Payloads tipados para cada Layout
export const HeroCoverPayloadSchema = z.object({
  tagline: z.string().default('TSOLUTIONS IPIDD • SYSTEM ARCHITECTURE & OPEX'),
  title: z.string().min(1),
  subtitle: z.string().min(1),
  author: z.string().default('Soluciones Tecnológicas & Arquitectura de Software'),
  client: z.string().default('Comité Directivo & Stakeholders'),
  date: z.string().default(new Date().toISOString().split('T')[0]),
  badgeText: z.string().default('PROYECTO AUDITADO 2026')
});

export const TwoColumnPayloadSchema = z.object({
  title: z.string().min(1),
  subtitle: z.string().default(''),
  leftTitle: z.string().min(1),
  leftBadge: z.string().default('PROBLEMA / AS-IS'),
  leftPoints: z.array(z.string()).min(1),
  rightTitle: z.string().min(1),
  rightBadge: z.string().default('SOLUCIÓN / TO-BE'),
  rightPoints: z.array(z.string()).min(1)
});

export const ThreeCardKpiCardSchema = z.object({
  label: z.string().min(1),
  value: z.string().min(1),
  description: z.string().min(1),
  accent: z.enum(['energy', 'turquesa', 'gold']).default('energy'),
  badge: z.string().default('KPI VERIFICADO')
});

export const ThreeCardKpiPayloadSchema = z.object({
  title: z.string().min(1),
  subtitle: z.string().default(''),
  cards: z.array(ThreeCardKpiCardSchema).min(2).max(4)
});

export const TimelineRoadmapPhaseSchema = z.object({
  step: z.string().min(1),
  phaseName: z.string().min(1),
  duration: z.string().min(1),
  deliverables: z.array(z.string()).min(1),
  status: z.enum(['COMPLETED', 'IN_PROGRESS', 'PLANNED']).default('PLANNED')
});

export const TimelineRoadmapPayloadSchema = z.object({
  title: z.string().min(1),
  subtitle: z.string().default(''),
  phases: z.array(TimelineRoadmapPhaseSchema).min(3).max(5)
});

export const OpexProblemStatementSchema = z.object({
  title: z.string().min(1),
  problemSummary: z.string().min(1),
  rootCauses: z.array(z.object({
    category: z.string().min(1),
    factor: z.string().min(1),
    impact: z.string().min(1)
  })).min(2),
  countermeasure: z.string().min(1),
  expectedGain: z.string().min(1)
});

export const CodeAndArchitecturePayloadSchema = z.object({
  title: z.string().min(1),
  subtitle: z.string().default(''),
  language: z.string().default('typescript'),
  codeSnippet: z.string().min(1),
  architectureNotes: z.array(z.string()).min(1),
  keyComponents: z.array(z.object({
    name: z.string().min(1),
    purpose: z.string().min(1)
  })).min(1)
});

export const ConclusionCtaPayloadSchema = z.object({
  title: z.string().min(1),
  summary: z.string().min(1),
  keyTakeaways: z.array(z.string()).min(2),
  ctaButtonText: z.string().default('APROBAR RUTA CRÍTICA & DESPLIEGUE'),
  motto: z.string().default('Tecnología instalada. Conocimiento transferido. Negocios escalados.')
});

// Estructura general de una Diapositiva generada
export const GeneratedSlideSchema = z.object({
  slideIndex: z.number(),
  layoutType: SlideLayoutTypeSchema,
  headerTag: z.string().default('TSOLUTIONS ARQUITECTURA'),
  slideData: z.record(z.any()),
  speakerNotes: z.string().optional()
});

export type GeneratedSlide = z.infer<typeof GeneratedSlideSchema>;

export const GeneratedPresentationSchema = z.object({
  title: z.string().min(1),
  description: z.string().min(1),
  aspectRatio: z.string().default('16:9'),
  slides: z.array(GeneratedSlideSchema).min(3)
});

export type GeneratedPresentation = z.infer<typeof GeneratedPresentationSchema>;

// Interfaz para la Base de Datos
export interface PresentationDeckRow {
  id: string;
  workspace_id: string;
  project_id?: string | null;
  author_id?: string | null;
  title: string;
  description?: string | null;
  aspect_ratio: string;
  created_at: string;
  updated_at: string;
}

export interface PresentationSlideRow {
  id: string;
  deck_id: string;
  slide_index: number;
  layout_type: SlideLayoutType;
  slide_data: any;
  created_at: string;
}

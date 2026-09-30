import React from 'react';
import { SlideShell } from './SlideShell';
import { HeroCover } from './layouts/HeroCover';
import { ThreeCardKpi } from './layouts/ThreeCardKpi';
import { TwoColumn } from './layouts/TwoColumn';
import { TimelineRoadmap } from './layouts/TimelineRoadmap';
import { OpexProblemStatement } from './layouts/OpexProblemStatement';
import { CodeAndArchitecture } from './layouts/CodeAndArchitecture';
import { ConclusionCta } from './layouts/ConclusionCta';
import { SlideLayoutType } from '../../types/presentation.types';

export interface SlideDataModel {
  id?: string;
  slide_index: number;
  layout_type: SlideLayoutType;
  slide_data: any;
  headerTag?: string;
}

export interface SlideRendererProps {
  slide: SlideDataModel;
  currentSlide: number;
  totalSlides: number;
  aspectRatio?: string;
}

export const SlideRenderer: React.FC<SlideRendererProps> = ({
  slide,
  currentSlide,
  totalSlides,
  aspectRatio = '16:9'
}) => {
  const renderLayoutContent = () => {
    const data = typeof slide.slide_data === 'string' ? JSON.parse(slide.slide_data) : slide.slide_data;

    switch (slide.layout_type) {
      case 'HERO_COVER':
        return <HeroCover data={data} />;
      case 'THREE_CARD_KPI':
        return <ThreeCardKpi data={data} />;
      case 'TWO_COLUMN':
        return <TwoColumn data={data} />;
      case 'TIMELINE_ROADMAP':
        return <TimelineRoadmap data={data} />;
      case 'OPEX_PROBLEM_STATEMENT':
        return <OpexProblemStatement data={data} />;
      case 'CODE_AND_ARCHITECTURE':
        return <CodeAndArchitecture data={data} />;
      case 'CONCLUSION_CTA':
        return <ConclusionCta data={data} />;
      default:
        return (
          <div className="text-center py-12">
            <h3 className="text-xl font-bold mb-2">Diapositiva Desconocida</h3>
            <pre className="text-xs font-mono bg-black/40 p-4 rounded text-left overflow-auto max-w-xl mx-auto">
              {JSON.stringify(data, null, 2)}
            </pre>
          </div>
        );
    }
  };

  const getHeaderTag = () => {
    switch (slide.layout_type) {
      case 'HERO_COVER':
        return 'TSOLUTIONS VISIÓN';
      case 'OPEX_PROBLEM_STATEMENT':
        return 'OPEX DIAGNOSIS';
      case 'THREE_CARD_KPI':
        return 'MÉTRICAS & ROI';
      case 'TWO_COLUMN':
        return 'ARQUITECTURA COMPARATIVA';
      case 'TIMELINE_ROADMAP':
        return 'RUTA CRÍTICA';
      case 'CODE_AND_ARCHITECTURE':
        return 'SRE & TELEMETRÍA';
      case 'CONCLUSION_CTA':
        return 'ACUERDO DIRECTIVO';
      default:
        return 'TSOLUTIONS IPIDD';
    }
  };

  return (
    <SlideShell
      currentSlide={currentSlide}
      totalSlides={totalSlides}
      headerTag={slide.headerTag || getHeaderTag()}
      aspectRatio={aspectRatio}
    >
      {renderLayoutContent()}
    </SlideShell>
  );
};

export default SlideRenderer;

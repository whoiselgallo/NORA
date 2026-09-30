import React from 'react';
import { TS_TOKENS } from '../../../styles/theme.tokens';

export interface TimelineRoadmapProps {
  data: {
    title: string;
    subtitle?: string;
    phases: Array<{
      step: string;
      phaseName: string;
      duration: string;
      deliverables: string[];
      status: 'COMPLETED' | 'IN_PROGRESS' | 'PLANNED';
    }>;
  };
}

export const TimelineRoadmap: React.FC<TimelineRoadmapProps> = ({ data }) => {
  return (
    <div className="w-full max-w-5xl mx-auto flex flex-col justify-center h-full">
      {/* Encabezado */}
      <div className="mb-6 text-center">
        <h2
          className="text-2xl md:text-3xl font-extrabold uppercase tracking-tight mb-2"
          style={{
            fontFamily: TS_TOKENS.typography.fontBruno,
            color: TS_TOKENS.colors.blancoPuro
          }}
        >
          {data.title}
        </h2>
        {data.subtitle && (
          <p
            className="text-sm md:text-base font-medium"
            style={{
              fontFamily: TS_TOKENS.typography.fontHeading,
              color: TS_TOKENS.colors.aquaTurquesa
            }}
          >
            {data.subtitle}
          </p>
        )}
      </div>

      {/* Contenedor de la Línea de Tiempo */}
      <div className="relative pt-6 pb-2">
        {/* Línea horizontal continua de fondo */}
        <div
          className="absolute top-11 left-6 right-6 h-0.5 z-0"
          style={{ backgroundColor: 'rgba(255, 255, 255, 0.15)' }}
        />

        {/* Fases secuenciales con nodos hexagonales */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4 relative z-10">
          {data.phases.map((phase, idx) => {
            const isCompleted = phase.status === 'COMPLETED';
            const isInProgress = phase.status === 'IN_PROGRESS';

            const activeColor = isCompleted
              ? TS_TOKENS.colors.aquaTurquesa
              : isInProgress
              ? TS_TOKENS.colors.naranjaEnergy
              : TS_TOKENS.colors.humoSlate;

            const glowEffect = isCompleted
              ? TS_TOKENS.glows.glowTurquesaSoft
              : isInProgress
              ? TS_TOKENS.glows.glowEnergy
              : 'none';

            return (
              <div key={idx} className="flex flex-col items-center text-center">
                {/* Nodo Hexagonal */}
                <div
                  className="w-12 h-12 flex items-center justify-center font-mono font-bold text-sm mb-4 transition-transform hover:scale-105"
                  style={{
                    clipPath: TS_TOKENS.geometry.clipHexagon,
                    backgroundColor: activeColor,
                    color: TS_TOKENS.colors.negroProfundo,
                    boxShadow: glowEffect
                  }}
                >
                  {phase.step}
                </div>

                {/* Tarjeta de Fase Midnight Panel */}
                <div
                  className="w-full p-4 flex flex-col text-left flex-1"
                  style={{
                    backgroundColor: TS_TOKENS.colors.midnightPanel,
                    border: `1px solid ${activeColor}40`,
                    borderRadius: TS_TOKENS.radii.radiusMedium,
                    boxShadow: TS_TOKENS.glows.shadowCard
                  }}
                >
                  <div className="flex items-center justify-between mb-2">
                    <span
                      className="text-[9px] font-mono font-bold uppercase px-1.5 py-0.5 rounded"
                      style={{
                        backgroundColor: `${activeColor}15`,
                        color: activeColor
                      }}
                    >
                      {phase.duration}
                    </span>
                    <span
                      className="text-[9px] font-mono font-bold uppercase"
                      style={{ color: activeColor }}
                    >
                      {phase.status}
                    </span>
                  </div>

                  <h4
                    className="text-xs font-bold uppercase tracking-tight mb-2 line-clamp-2"
                    style={{
                      fontFamily: TS_TOKENS.typography.fontHeading,
                      color: TS_TOKENS.colors.blancoPuro
                    }}
                  >
                    {phase.phaseName}
                  </h4>

                  <ul className="space-y-1.5 mt-auto">
                    {phase.deliverables.map((item, dIdx) => (
                      <li key={dIdx} className="flex items-start gap-1.5 text-[11px] leading-tight" style={{ color: TS_TOKENS.colors.blancoPerla }}>
                        <span className="w-1 h-1 rounded-full mt-1 flex-shrink-0" style={{ backgroundColor: activeColor }} />
                        <span>{item}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
};

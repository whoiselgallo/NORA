import React from 'react';
import { TS_TOKENS } from '../../../styles/theme.tokens';

export interface TwoColumnProps {
  data: {
    title: string;
    subtitle?: string;
    leftTitle: string;
    leftBadge?: string;
    leftPoints: string[];
    rightTitle: string;
    rightBadge?: string;
    rightPoints: string[];
  };
}

export const TwoColumn: React.FC<TwoColumnProps> = ({ data }) => {
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

      {/* Columnas Comparativas (Izquierda: Naranja Energy / Derecha: Aqua Turquesa) */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Columna Izquierda (Problema / As-Is) */}
        <div
          className="p-6 flex flex-col relative overflow-hidden"
          style={{
            backgroundColor: TS_TOKENS.colors.midnightPanel,
            border: `1px solid rgba(255, 107, 0, 0.40)`,
            borderRadius: TS_TOKENS.radii.radiusLarge,
            boxShadow: TS_TOKENS.glows.shadowCard
          }}
        >
          <div className="flex items-center justify-between mb-4">
            <span
              className="text-[10px] font-mono font-bold tracking-wider px-2 py-0.5 rounded"
              style={{
                backgroundColor: 'rgba(255, 107, 0, 0.12)',
                color: TS_TOKENS.colors.naranjaEnergy,
                border: '1px solid rgba(255, 107, 0, 0.30)'
              }}
            >
              {data.leftBadge || 'PROBLEMA / AS-IS'}
            </span>
            <span
              className="w-2.5 h-2.5 rounded-full inline-block"
              style={{
                backgroundColor: TS_TOKENS.colors.naranjaEnergy,
                boxShadow: TS_TOKENS.glows.glowEnergy
              }}
            />
          </div>

          <h3
            className="text-lg font-bold uppercase tracking-tight mb-4"
            style={{
              fontFamily: TS_TOKENS.typography.fontHeading,
              color: TS_TOKENS.colors.blancoPuro
            }}
          >
            {data.leftTitle}
          </h3>

          <ul className="space-y-3 flex-1">
            {data.leftPoints.map((point, idx) => (
              <li key={idx} className="flex items-start gap-3 text-xs leading-relaxed text-slate-300">
                <span
                  className="w-1.5 h-1.5 rounded-full mt-1.5 flex-shrink-0"
                  style={{ backgroundColor: TS_TOKENS.colors.naranjaEnergy }}
                />
                <span style={{ color: TS_TOKENS.colors.blancoPerla }}>{point}</span>
              </li>
            ))}
          </ul>
        </div>

        {/* Columna Derecha (Solución / To-Be) */}
        <div
          className="p-6 flex flex-col relative overflow-hidden"
          style={{
            backgroundColor: TS_TOKENS.colors.midnightPanel,
            border: `1px solid rgba(0, 229, 255, 0.40)`,
            borderRadius: TS_TOKENS.radii.radiusLarge,
            boxShadow: TS_TOKENS.glows.shadowCard
          }}
        >
          <div className="flex items-center justify-between mb-4">
            <span
              className="text-[10px] font-mono font-bold tracking-wider px-2 py-0.5 rounded"
              style={{
                backgroundColor: 'rgba(0, 229, 255, 0.12)',
                color: TS_TOKENS.colors.aquaTurquesa,
                border: '1px solid rgba(0, 229, 255, 0.30)'
              }}
            >
              {data.rightBadge || 'SOLUCIÓN / TO-BE'}
            </span>
            <span
              className="w-2.5 h-2.5 rounded-full inline-block"
              style={{
                backgroundColor: TS_TOKENS.colors.aquaTurquesa,
                boxShadow: TS_TOKENS.glows.glowTurquesaSoft
              }}
            />
          </div>

          <h3
            className="text-lg font-bold uppercase tracking-tight mb-4"
            style={{
              fontFamily: TS_TOKENS.typography.fontHeading,
              color: TS_TOKENS.colors.blancoPuro
            }}
          >
            {data.rightTitle}
          </h3>

          <ul className="space-y-3 flex-1">
            {data.rightPoints.map((point, idx) => (
              <li key={idx} className="flex items-start gap-3 text-xs leading-relaxed">
                <span
                  className="w-1.5 h-1.5 rounded-full mt-1.5 flex-shrink-0"
                  style={{ backgroundColor: TS_TOKENS.colors.aquaTurquesa }}
                />
                <span style={{ color: TS_TOKENS.colors.blancoPerla }}>{point}</span>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </div>
  );
};

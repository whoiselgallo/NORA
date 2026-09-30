import React from 'react';
import { TS_TOKENS } from '../../../styles/theme.tokens';

export interface OpexProblemStatementProps {
  data: {
    title: string;
    problemSummary: string;
    rootCauses: Array<{
      category: string;
      factor: string;
      impact: string;
    }>;
    countermeasure: string;
    expectedGain: string;
  };
}

export const OpexProblemStatement: React.FC<OpexProblemStatementProps> = ({ data }) => {
  return (
    <div className="w-full max-w-5xl mx-auto flex flex-col justify-center h-full">
      {/* Encabezado */}
      <div className="mb-4 text-center">
        <span
          className="text-xs font-mono font-bold tracking-widest px-2.5 py-1 rounded inline-block mb-2"
          style={{
            backgroundColor: 'rgba(255, 107, 0, 0.12)',
            color: TS_TOKENS.colors.naranjaEnergy,
            border: '1px solid rgba(255, 107, 0, 0.30)'
          }}
        >
          METODOLOGÍA OPEX & CAUSA RAÍZ
        </span>
        <h2
          className="text-2xl md:text-3xl font-extrabold uppercase tracking-tight"
          style={{
            fontFamily: TS_TOKENS.typography.fontBruno,
            color: TS_TOKENS.colors.blancoPuro
          }}
        >
          {data.title}
        </h2>
      </div>

      {/* Problema As-Is Declarado */}
      <div
        className="p-4 mb-4 rounded-lg flex items-center gap-4"
        style={{
          backgroundColor: 'rgba(255, 107, 0, 0.08)',
          borderLeft: `4px solid ${TS_TOKENS.colors.naranjaEnergy}`,
          borderRight: `1px solid ${TS_TOKENS.colors.bordeCorporativo}`,
          borderTop: `1px solid ${TS_TOKENS.colors.bordeCorporativo}`,
          borderBottom: `1px solid ${TS_TOKENS.colors.bordeCorporativo}`
        }}
      >
        <span
          className="font-mono text-xs font-bold px-2 py-1 rounded tracking-wider flex-shrink-0"
          style={{
            backgroundColor: TS_TOKENS.colors.naranjaEnergy,
            color: TS_TOKENS.colors.negroProfundo
          }}
        >
          SÍNTOMA CRÍTICO
        </span>
        <p
          className="text-xs md:text-sm font-medium leading-relaxed"
          style={{ color: TS_TOKENS.colors.blancoPerla }}
        >
          {data.problemSummary}
        </p>
      </div>

      {/* Grid de Causas Raíz (Ishikawa / 5 Whys) */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
        {data.rootCauses.map((rc, idx) => (
          <div
            key={idx}
            className="p-3.5 flex flex-col justify-between"
            style={{
              backgroundColor: TS_TOKENS.colors.midnightPanel,
              border: `1px solid ${TS_TOKENS.colors.bordeCorporativo}`,
              borderRadius: TS_TOKENS.radii.radiusMedium,
              boxShadow: TS_TOKENS.glows.shadowCard
            }}
          >
            <div>
              <span
                className="text-[10px] font-mono font-bold tracking-wider px-1.5 py-0.5 rounded uppercase"
                style={{
                  backgroundColor: 'rgba(0, 229, 255, 0.12)',
                  color: TS_TOKENS.colors.aquaTurquesa,
                  border: '1px solid rgba(0, 229, 255, 0.3)'
                }}
              >
                CATEGORÍA: {rc.category}
              </span>
              <p
                className="text-xs font-semibold mt-2.5 leading-snug"
                style={{
                  fontFamily: TS_TOKENS.typography.fontHeading,
                  color: TS_TOKENS.colors.blancoPuro
                }}
              >
                {rc.factor}
              </p>
            </div>

            <div
              className="mt-3 pt-2 text-[11px] font-mono"
              style={{
                borderTop: '1px solid rgba(255, 255, 255, 0.08)',
                color: TS_TOKENS.colors.humoSlate
              }}
            >
              <span className="font-bold" style={{ color: TS_TOKENS.colors.naranjaEnergy }}>
                Impacto:{' '}
              </span>
              {rc.impact}
            </div>
          </div>
        ))}
      </div>

      {/* Contramedida y Ganancia Proyectada */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div
          className="p-3.5 rounded-lg flex flex-col justify-center"
          style={{
            backgroundColor: TS_TOKENS.colors.midnightPanel,
            border: `1px solid rgba(0, 229, 255, 0.35)`
          }}
        >
          <span
            className="text-[10px] font-mono font-bold tracking-wider uppercase mb-1"
            style={{ color: TS_TOKENS.colors.aquaTurquesa }}
          >
            CONTRAMEDIDA DE ARQUITECTURA
          </span>
          <p className="text-xs font-medium" style={{ color: TS_TOKENS.colors.blancoPerla }}>
            {data.countermeasure}
          </p>
        </div>

        <div
          className="p-3.5 rounded-lg flex flex-col justify-center"
          style={{
            backgroundColor: TS_TOKENS.colors.midnightPanel,
            border: `1px solid rgba(245, 158, 11, 0.35)`
          }}
        >
          <span
            className="text-[10px] font-mono font-bold tracking-wider uppercase mb-1"
            style={{ color: TS_TOKENS.colors.doradoPrestigio }}
          >
            BENEFICIO OPERATIVO PROYECTADO
          </span>
          <p className="text-xs font-medium" style={{ color: TS_TOKENS.colors.blancoPerla }}>
            {data.expectedGain}
          </p>
        </div>
      </div>
    </div>
  );
};

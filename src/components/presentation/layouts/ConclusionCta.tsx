import React from 'react';
import { TS_TOKENS } from '../../../styles/theme.tokens';

export interface ConclusionCtaProps {
  data: {
    title: string;
    summary: string;
    keyTakeaways: string[];
    ctaButtonText?: string;
    motto?: string;
  };
}

export const ConclusionCta: React.FC<ConclusionCtaProps> = ({ data }) => {
  return (
    <div className="w-full max-w-4xl mx-auto flex flex-col items-center justify-center text-center h-full py-4">
      {/* Badge de Cierre */}
      <div
        className="px-4 py-1 rounded-full text-xs font-mono font-bold tracking-widest uppercase mb-4"
        style={{
          backgroundColor: 'rgba(0, 229, 255, 0.12)',
          color: TS_TOKENS.colors.aquaTurquesa,
          border: '1px solid rgba(0, 229, 255, 0.35)',
          boxShadow: TS_TOKENS.glows.glowTurquesaSoft
        }}
      >
        DICTAMEN & ACUERDO DIRECTIVO
      </div>

      {/* Título en Bruno Ace */}
      <h2
        className="text-3xl md:text-4xl font-extrabold uppercase tracking-tight mb-4"
        style={{
          fontFamily: TS_TOKENS.typography.fontBruno,
          color: TS_TOKENS.colors.blancoPuro
        }}
      >
        {data.title}
      </h2>

      {/* Resumen Ejecutivo */}
      <p
        className="text-sm md:text-base font-medium max-w-2xl mb-6 leading-relaxed"
        style={{
          fontFamily: TS_TOKENS.typography.fontHeading,
          color: TS_TOKENS.colors.blancoPerla
        }}
      >
        {data.summary}
      </p>

      {/* Conclusiones Clave */}
      <div
        className="w-full max-w-2xl p-5 mb-6 text-left"
        style={{
          backgroundColor: TS_TOKENS.colors.midnightPanel,
          border: `1px solid ${TS_TOKENS.colors.bordeCorporativo}`,
          borderRadius: TS_TOKENS.radii.radiusLarge,
          boxShadow: TS_TOKENS.glows.shadowCard
        }}
      >
        <h4
          className="text-xs font-mono font-bold tracking-wider uppercase mb-3"
          style={{ color: TS_TOKENS.colors.naranjaEnergy }}
        >
          COMPROMISOS CLAVE DE TRANSFERENCIA
        </h4>
        <div className="space-y-2.5">
          {data.keyTakeaways.map((point, idx) => (
            <div key={idx} className="flex items-start gap-3 text-xs">
              <span
                className="w-2 h-2 rounded-full mt-1.5 flex-shrink-0"
                style={{
                  backgroundColor: TS_TOKENS.colors.naranjaEnergy,
                  boxShadow: TS_TOKENS.glows.glowEnergy
                }}
              />
              <span style={{ color: TS_TOKENS.colors.blancoPerla }}>{point}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Botón CTA Principal con Glow Energy */}
      <button
        className="px-8 py-3.5 rounded-full font-bold text-sm tracking-wider uppercase transition-all duration-300 transform hover:scale-105 active:scale-95 cursor-pointer flex items-center gap-3"
        style={{
          backgroundColor: TS_TOKENS.colors.naranjaEnergy,
          color: TS_TOKENS.colors.negroProfundo,
          boxShadow: TS_TOKENS.glows.glowEnergy,
          fontFamily: TS_TOKENS.typography.fontHeading
        }}
        onClick={() => {
          alert('Acuerdo y ruta crítica aprobados. Procediendo a despliegue y telemetría continua.');
        }}
      >
        <span
          className="w-3.5 h-3.5 inline-block"
          style={{
            clipPath: TS_TOKENS.geometry.clipHexagon,
            backgroundColor: TS_TOKENS.colors.negroProfundo
          }}
        />
        <span>{data.ctaButtonText || 'AUTORIZAR DESPLIEGUE & OPEX'}</span>
      </button>

      {/* Lema Rector TSolutions */}
      <p
        className="mt-6 text-xs font-mono tracking-widest uppercase opacity-75"
        style={{ color: TS_TOKENS.colors.humoSlate }}
      >
        {data.motto || TS_TOKENS.motto}
      </p>
    </div>
  );
};

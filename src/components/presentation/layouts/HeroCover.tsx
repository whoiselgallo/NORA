import React from 'react';
import { TS_TOKENS } from '../../../styles/theme.tokens';

export interface HeroCoverProps {
  data: {
    tagline?: string;
    title: string;
    subtitle?: string;
    author?: string;
    client?: string;
    date?: string;
    badgeText?: string;
  };
}

export const HeroCover: React.FC<HeroCoverProps> = ({ data }) => {
  return (
    <div className="flex flex-col items-center justify-center text-center max-w-4xl mx-auto py-6">
      {/* Badge Corporativo Hexagonal */}
      <div className="inline-flex items-center gap-3 px-4 py-1.5 rounded-full mb-6"
        style={{
          backgroundColor: 'rgba(255, 107, 0, 0.10)',
          border: `1px solid ${TS_TOKENS.colors.naranjaEnergy}`,
          boxShadow: TS_TOKENS.glows.glowEnergy
        }}
      >
        <span
          className="w-4 h-4 inline-block"
          style={{
            clipPath: TS_TOKENS.geometry.clipHexagon,
            backgroundColor: TS_TOKENS.colors.naranjaEnergy
          }}
        />
        <span
          className="text-xs font-mono font-bold tracking-widest uppercase"
          style={{ color: TS_TOKENS.colors.naranjaEnergy }}
        >
          {data.badgeText || 'PROYECTO DE ARQUITECTURA VERIFICADO'}
        </span>
      </div>

      {/* Título en gran formato Bruno Ace */}
      <h1
        className="text-4xl md:text-5xl lg:text-6xl font-extrabold uppercase tracking-tight mb-4 leading-tight"
        style={{
          fontFamily: TS_TOKENS.typography.fontBruno,
          color: TS_TOKENS.colors.blancoPuro,
          textShadow: '0 2px 20px rgba(0, 0, 0, 0.8)'
        }}
      >
        {data.title}
      </h1>

      {/* Subtítulo en Space Grotesk Aqua Turquesa */}
      <p
        className="text-lg md:text-xl font-medium max-w-2xl mb-8 leading-relaxed"
        style={{
          fontFamily: TS_TOKENS.typography.fontHeading,
          color: TS_TOKENS.colors.aquaTurquesa,
          textShadow: TS_TOKENS.glows.glowTurquesaSoft
        }}
      >
        {data.subtitle || TS_TOKENS.motto}
      </p>

      {/* Tarjeta de Metadatos Midnight Panel */}
      <div
        className="w-full max-w-2xl px-6 py-4 flex items-center justify-between text-xs"
        style={{
          backgroundColor: TS_TOKENS.colors.midnightPanel,
          border: `1px solid ${TS_TOKENS.colors.bordeCorporativo}`,
          borderRadius: TS_TOKENS.radii.radiusMedium,
          boxShadow: TS_TOKENS.glows.shadowCard
        }}
      >
        <div className="text-left">
          <span className="block font-mono text-[10px] uppercase tracking-wider" style={{ color: TS_TOKENS.colors.humoSlate }}>
            CONSULTORÍA & ARQUITECTURA
          </span>
          <span className="font-semibold text-sm" style={{ color: TS_TOKENS.colors.blancoPerla }}>
            {data.author || 'TSolutions IPIDD Solution Architect'}
          </span>
        </div>

        <div className="h-8 w-px bg-white/10" />

        <div className="text-center">
          <span className="block font-mono text-[10px] uppercase tracking-wider" style={{ color: TS_TOKENS.colors.humoSlate }}>
            DIRIGIDO A
          </span>
          <span className="font-semibold text-sm" style={{ color: TS_TOKENS.colors.blancoPerla }}>
            {data.client || 'Comité Directivo'}
          </span>
        </div>

        <div className="h-8 w-px bg-white/10" />

        <div className="text-right">
          <span className="block font-mono text-[10px] uppercase tracking-wider" style={{ color: TS_TOKENS.colors.humoSlate }}>
            FECHA DE AUDITORÍA
          </span>
          <span className="font-mono text-sm font-bold" style={{ color: TS_TOKENS.colors.aquaTurquesa }}>
            {data.date || new Date().toISOString().split('T')[0]}
          </span>
        </div>
      </div>
    </div>
  );
};

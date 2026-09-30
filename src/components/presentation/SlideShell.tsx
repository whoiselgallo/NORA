import React from 'react';
import { TS_TOKENS } from '../../styles/theme.tokens';

export interface SlideShellProps {
  currentSlide: number;
  totalSlides: number;
  headerTag?: string;
  children: React.ReactNode;
  aspectRatio?: string;
}

export const SlideShell: React.FC<SlideShellProps> = ({
  currentSlide,
  totalSlides,
  headerTag = 'TSOLUTIONS ARQUITECTURA',
  children,
  aspectRatio = '16:9'
}) => {
  return (
    <div
      className="ts-slide-shell relative w-full aspect-video overflow-hidden flex flex-col justify-between select-none"
      style={{
        backgroundColor: TS_TOKENS.colors.negroProfundo,
        backgroundImage: `
          linear-gradient(to right, ${TS_TOKENS.colors.deepGrid} 1px, transparent 1px),
          linear-gradient(to bottom, ${TS_TOKENS.colors.deepGrid} 1px, transparent 1px)
        `,
        backgroundSize: '32px 32px',
        color: TS_TOKENS.colors.blancoPuro,
        fontFamily: TS_TOKENS.typography.fontSans,
        boxShadow: TS_TOKENS.glows.shadowCard,
        border: `1px solid ${TS_TOKENS.colors.bordeCorporativo}`,
        borderRadius: TS_TOKENS.radii.radiusMedium
      }}
    >
      {/* CABECERA FIJA */}
      <header
        className="w-full px-8 py-4 flex items-center justify-between z-10"
        style={{
          borderBottom: `1px solid ${TS_TOKENS.colors.bordeCorporativo}`,
          background: 'rgba(10, 13, 20, 0.75)',
          backdropFilter: 'blur(8px)'
        }}
      >
        <div className="flex items-center gap-3">
          {/* Hexágono Logotipo Oficial */}
          <div
            className="w-8 h-8 flex items-center justify-center relative"
            style={{
              clipPath: TS_TOKENS.geometry.clipHexagon,
              background: `linear-gradient(135deg, ${TS_TOKENS.colors.naranjaEnergy}, #FF8C33)`,
              boxShadow: TS_TOKENS.glows.glowBlancoPulse
            }}
          >
            <img
              src={TS_TOKENS.assets.logoSvg}
              alt="TSolutions Logo"
              className="w-6 h-6 object-contain"
              onError={(e) => {
                // Fallback elegante en caso de carga directa
                (e.currentTarget as HTMLElement).style.display = 'none';
              }}
            />
          </div>

          <div className="flex items-baseline gap-2">
            <span
              className="text-base font-extrabold tracking-wider"
              style={{
                fontFamily: TS_TOKENS.typography.fontBruno,
                color: TS_TOKENS.colors.blancoPuro
              }}
            >
              TSOLUTIONS <span style={{ color: TS_TOKENS.colors.naranjaEnergy }}>IPIDD</span>
            </span>
            <span
              className="text-xs px-2 py-0.5 rounded font-mono font-bold tracking-wider"
              style={{
                backgroundColor: 'rgba(0, 229, 255, 0.12)',
                color: TS_TOKENS.colors.aquaTurquesa,
                border: `1px solid rgba(0, 229, 255, 0.3)`
              }}
            >
              {headerTag}
            </span>
          </div>
        </div>

        {/* Contador de Diapositivas */}
        <div
          className="text-xs font-bold tracking-widest px-3 py-1 rounded"
          style={{
            fontFamily: TS_TOKENS.typography.fontMono,
            color: TS_TOKENS.colors.humoSlate,
            backgroundColor: 'rgba(255, 255, 255, 0.05)',
            border: `1px solid ${TS_TOKENS.colors.bordeCorporativo}`
          }}
        >
          <span style={{ color: TS_TOKENS.colors.naranjaEnergy }}>
            {String(currentSlide).padStart(2, '0')}
          </span>{' '}
          / {String(totalSlides).padStart(2, '0')}
        </div>
      </header>

      {/* ÁREA CENTRAL DINÁMICA DE LA DIAPOSITIVA */}
      <main className="w-full flex-1 px-8 py-6 flex flex-col justify-center overflow-hidden z-10">
        {children}
      </main>

      {/* PIE FIJO CON MARCA DE AGUA E INDICADORES LUMÍNICOS */}
      <footer
        className="w-full px-8 py-3 flex items-center justify-between text-xs tracking-wider z-10"
        style={{
          borderTop: `1px solid ${TS_TOKENS.colors.bordeCorporativo}`,
          background: 'rgba(10, 13, 20, 0.75)',
          backdropFilter: 'blur(8px)',
          color: TS_TOKENS.colors.humoSlate
        }}
      >
        <div className="flex items-center gap-2">
          {/* Indicador lumínico Naranja Energy */}
          <span
            className="w-2.5 h-2.5 rounded-full inline-block"
            style={{
              backgroundColor: TS_TOKENS.colors.naranjaEnergy,
              boxShadow: TS_TOKENS.glows.glowEnergy
            }}
          />
          {/* Indicador lumínico Aqua Turquesa */}
          <span
            className="w-2.5 h-2.5 rounded-full inline-block"
            style={{
              backgroundColor: TS_TOKENS.colors.aquaTurquesa,
              boxShadow: TS_TOKENS.glows.glowTurquesaSoft
            }}
          />
          <span className="font-mono font-medium text-[11px] ml-1">
            {TS_TOKENS.watermark}
          </span>
        </div>

        <div className="font-mono text-[10px] opacity-75">
          {TS_TOKENS.motto}
        </div>
      </footer>
    </div>
  );
};

export default SlideShell;

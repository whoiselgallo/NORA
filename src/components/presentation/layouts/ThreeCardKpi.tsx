import React from 'react';
import { TS_TOKENS } from '../../../styles/theme.tokens';

export interface ThreeCardKpiProps {
  data: {
    title: string;
    subtitle?: string;
    cards: Array<{
      label: string;
      value: string;
      description: string;
      accent?: 'energy' | 'turquesa' | 'gold';
      badge?: string;
    }>;
  };
}

export const ThreeCardKpi: React.FC<ThreeCardKpiProps> = ({ data }) => {
  return (
    <div className="w-full max-w-5xl mx-auto flex flex-col justify-center h-full">
      {/* Encabezado del Módulo */}
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

      {/* Grid de 3 Tarjetas Midnight Panel */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {data.cards.map((card, idx) => {
          const isEnergy = card.accent === 'energy' || idx === 0;
          const isTurquesa = card.accent === 'turquesa' || idx === 1;
          const isGold = card.accent === 'gold' || idx === 2;

          const accentColor = isEnergy
            ? TS_TOKENS.colors.naranjaEnergy
            : isTurquesa
            ? TS_TOKENS.colors.aquaTurquesa
            : TS_TOKENS.colors.doradoPrestigio;

          const glowStyle = isEnergy
            ? TS_TOKENS.glows.glowEnergy
            : isTurquesa
            ? TS_TOKENS.glows.glowTurquesaSoft
            : '0 0 16px rgba(245, 158, 11, 0.40)';

          return (
            <div
              key={idx}
              className="p-6 flex flex-col justify-between transition-all duration-300 relative overflow-hidden"
              style={{
                backgroundColor: TS_TOKENS.colors.midnightPanel,
                border: `1px solid ${TS_TOKENS.colors.bordeCorporativo}`,
                borderRadius: TS_TOKENS.radii.radiusLarge,
                boxShadow: TS_TOKENS.glows.shadowCard
              }}
            >
              {/* Borde sutil superior con el color de acento */}
              <div
                className="absolute top-0 left-0 right-0 h-1"
                style={{ backgroundColor: accentColor, boxShadow: glowStyle }}
              />

              <div>
                {/* Badge Superior */}
                <div className="flex items-center justify-between mb-4">
                  <span
                    className="text-[10px] font-mono font-bold tracking-wider px-2 py-0.5 rounded"
                    style={{
                      backgroundColor: `${accentColor}18`,
                      color: accentColor,
                      border: `1px solid ${accentColor}40`
                    }}
                  >
                    {card.badge || 'KPI VERIFICADO'}
                  </span>
                  <span
                    className="w-2.5 h-2.5 rounded-full inline-block"
                    style={{ backgroundColor: accentColor, boxShadow: glowStyle }}
                  />
                </div>

                {/* Valor en Gran Escala (Bruno Ace) */}
                <div
                  className="text-4xl md:text-5xl font-extrabold tracking-tight mb-2"
                  style={{
                    fontFamily: TS_TOKENS.typography.fontBruno,
                    color: TS_TOKENS.colors.blancoPuro,
                    textShadow: glowStyle
                  }}
                >
                  {card.value}
                </div>

                {/* Etiqueta del Indicador */}
                <h3
                  className="text-sm font-bold uppercase tracking-wider mb-3"
                  style={{
                    fontFamily: TS_TOKENS.typography.fontHeading,
                    color: accentColor
                  }}
                >
                  {card.label}
                </h3>
              </div>

              {/* Descripción en Blanco Perla */}
              <p
                className="text-xs leading-relaxed"
                style={{
                  fontFamily: TS_TOKENS.typography.fontSans,
                  color: TS_TOKENS.colors.blancoPerla
                }}
              >
                {card.description}
              </p>
            </div>
          );
        })}
      </div>
    </div>
  );
};

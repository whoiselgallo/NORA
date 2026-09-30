import React, { useState, useEffect, useCallback, useRef } from 'react';
import { SlideRenderer, SlideDataModel } from './SlideRenderer';
import { TS_TOKENS } from '../../styles/theme.tokens';

export interface FullscreenRunnerProps {
  slides: SlideDataModel[];
  deckTitle: string;
  isOpen: boolean;
  onClose: () => void;
  initialSlideIndex?: number;
}

export const FullscreenRunner: React.FC<FullscreenRunnerProps> = ({
  slides,
  deckTitle,
  isOpen,
  onClose,
  initialSlideIndex = 0
}) => {
  const [currentIndex, setCurrentIndex] = useState(initialSlideIndex);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  const totalSlides = slides.length;

  const nextSlide = useCallback(() => {
    setCurrentIndex(prev => (prev < totalSlides - 1 ? prev + 1 : prev));
  }, [totalSlides]);

  const prevSlide = useCallback(() => {
    setCurrentIndex(prev => (prev > 0 ? prev - 1 : prev));
  }, []);

  const toggleBrowserFullscreen = useCallback(() => {
    if (!document.fullscreenElement) {
      containerRef.current?.requestFullscreen().catch(() => {});
      setIsFullscreen(true);
    } else {
      document.exitFullscreen().catch(() => {});
      setIsFullscreen(false);
    }
  }, []);

  // Controladores de Teclado (F, Flecha Derecha, Espacio, Flecha Izquierda, Escape)
  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'ArrowRight' || e.key === ' ' || e.key === 'PageDown') {
        e.preventDefault();
        nextSlide();
      } else if (e.key === 'ArrowLeft' || e.key === 'PageUp') {
        e.preventDefault();
        prevSlide();
      } else if (e.key === 'f' || e.key === 'F') {
        e.preventDefault();
        toggleBrowserFullscreen();
      } else if (e.key === 'Escape') {
        if (!document.fullscreenElement) {
          onClose();
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, nextSlide, prevSlide, toggleBrowserFullscreen, onClose]);

  const handlePrintPdf = () => {
    window.print();
  };

  if (!isOpen || slides.length === 0) return null;

  const activeSlide = slides[currentIndex];

  return (
    <div
      ref={containerRef}
      className="ts-presentation-runner fixed inset-0 z-50 flex flex-col items-center justify-center p-4 md:p-8"
      style={{
        backgroundColor: '#05070B',
        color: TS_TOKENS.colors.blancoPuro,
        fontFamily: TS_TOKENS.typography.fontSans
      }}
    >
      {/* ESTILOS @MEDIA PRINT PARA EXPORTACIÓN VECTORIZADA A PDF EN 16:9 */}
      <style>{`
        @media print {
          body, html {
            background-color: #0A0D14 !important;
            margin: 0 !important;
            padding: 0 !important;
            -webkit-print-color-adjust: exact !important;
            print-color-adjust: exact !important;
          }
          .ts-no-print {
            display: none !important;
          }
          .ts-presentation-runner {
            position: static !important;
            padding: 0 !important;
            background-color: transparent !important;
          }
          .ts-slide-print-wrapper {
            page-break-after: always;
            break-after: page;
            width: 100vw !important;
            height: 56.25vw !important; /* Proporción exacta 16:9 */
            max-height: 100vh !important;
            margin: 0 !important;
            box-sizing: border-box;
          }
          @page {
            size: landscape;
            margin: 0;
          }
        }
      `}</style>

      {/* BARRA SUPERIOR DE HERRAMIENTAS (OCULTA AL IMPRIMIR) */}
      <div className="ts-no-print w-full max-w-6xl flex items-center justify-between mb-3 px-2 text-xs">
        <div className="flex items-center gap-3">
          <span
            className="font-bold text-sm tracking-wider uppercase"
            style={{
              fontFamily: TS_TOKENS.typography.fontBruno,
              color: TS_TOKENS.colors.blancoPuro
            }}
          >
            {deckTitle}
          </span>
          <span
            className="px-2 py-0.5 rounded text-[10px] font-mono"
            style={{
              backgroundColor: 'rgba(255, 107, 0, 0.15)',
              color: TS_TOKENS.colors.naranjaEnergy,
              border: `1px solid ${TS_TOKENS.colors.naranjaEnergy}40`
            }}
          >
            MODO PRESENTACIÓN
          </span>
        </div>

        {/* Acciones: Pantalla completa, Imprimir PDF, Cerrar */}
        <div className="flex items-center gap-2">
          <button
            onClick={toggleBrowserFullscreen}
            className="px-3 py-1.5 rounded font-mono text-xs flex items-center gap-1.5 transition-colors cursor-pointer"
            style={{
              backgroundColor: TS_TOKENS.colors.midnightPanel,
              border: `1px solid ${TS_TOKENS.colors.bordeCorporativo}`,
              color: TS_TOKENS.colors.aquaTurquesa
            }}
            title="Presiona 'F' para alternar pantalla completa"
          >
            <span>⛶</span> {isFullscreen ? 'Ventana' : 'Pantalla Completa [F]'}
          </button>

          <button
            onClick={handlePrintPdf}
            className="px-3 py-1.5 rounded font-mono text-xs flex items-center gap-1.5 transition-colors cursor-pointer"
            style={{
              backgroundColor: 'rgba(255, 107, 0, 0.15)',
              border: `1px solid ${TS_TOKENS.colors.naranjaEnergy}`,
              color: TS_TOKENS.colors.naranjaEnergy
            }}
            title="Exportar todas las diapositivas a PDF vectorizado apaisado"
          >
            <span>🖨</span> Exportar PDF
          </button>

          <button
            onClick={onClose}
            className="px-3 py-1.5 rounded font-mono text-xs transition-colors cursor-pointer hover:bg-red-500/20 text-slate-300 hover:text-white"
            style={{
              backgroundColor: TS_TOKENS.colors.midnightPanel,
              border: `1px solid ${TS_TOKENS.colors.bordeCorporativo}`
            }}
            title="Salir [Esc]"
          >
            ✕ Salir
          </button>
        </div>
      </div>

      {/* CONTENEDOR CENTRAL 16:9 CON TRANSICIONES SUAVES */}
      <div className="w-full max-w-6xl aspect-video relative flex items-center justify-center">
        <div
          key={currentIndex}
          className="w-full h-full transition-all duration-300 ease-in-out transform"
          style={{
            animation: 'fadeInSlide 0.35s cubic-bezier(0.16, 1, 0.3, 1)'
          }}
        >
          <SlideRenderer
            slide={activeSlide}
            currentSlide={currentIndex + 1}
            totalSlides={totalSlides}
            aspectRatio="16:9"
          />
        </div>
      </div>

      {/* BARRA INFERIOR DE NAVEGACIÓN (OCULTA AL IMPRIMIR) */}
      <div className="ts-no-print w-full max-w-6xl flex items-center justify-between mt-3 px-2">
        <div className="flex items-center gap-2">
          <button
            onClick={prevSlide}
            disabled={currentIndex === 0}
            className="px-4 py-1.5 rounded text-xs font-mono font-bold flex items-center gap-1 disabled:opacity-30 disabled:cursor-not-allowed cursor-pointer transition-all"
            style={{
              backgroundColor: TS_TOKENS.colors.midnightPanel,
              border: `1px solid ${TS_TOKENS.colors.bordeCorporativo}`,
              color: TS_TOKENS.colors.blancoPuro
            }}
          >
            ◀ Anterior
          </button>

          <button
            onClick={nextSlide}
            disabled={currentIndex === totalSlides - 1}
            className="px-4 py-1.5 rounded text-xs font-mono font-bold flex items-center gap-1 disabled:opacity-30 disabled:cursor-not-allowed cursor-pointer transition-all"
            style={{
              backgroundColor: TS_TOKENS.colors.naranjaEnergy,
              color: TS_TOKENS.colors.negroProfundo,
              boxShadow: TS_TOKENS.glows.glowEnergy
            }}
          >
            Siguiente ▶
          </button>
        </div>

        {/* Puntos de navegación directa */}
        <div className="flex items-center gap-1.5">
          {slides.map((_, sIdx) => (
            <button
              key={sIdx}
              onClick={() => setCurrentIndex(sIdx)}
              className="w-3 h-3 rounded-full transition-all cursor-pointer"
              style={{
                backgroundColor: sIdx === currentIndex ? TS_TOKENS.colors.naranjaEnergy : 'rgba(255, 255, 255, 0.20)',
                boxShadow: sIdx === currentIndex ? TS_TOKENS.glows.glowEnergy : 'none',
                transform: sIdx === currentIndex ? 'scale(1.2)' : 'scale(1)'
              }}
              title={`Ir a diapositiva ${sIdx + 1}`}
            />
          ))}
        </div>

        <div className="text-[11px] font-mono" style={{ color: TS_TOKENS.colors.humoSlate }}>
          Atajos: <kbd className="px-1 py-0.5 rounded bg-white/10">Espacio</kbd> avanzar •{' '}
          <kbd className="px-1 py-0.5 rounded bg-white/10">F</kbd> pantalla completa •{' '}
          <kbd className="px-1 py-0.5 rounded bg-white/10">Esc</kbd> salir
        </div>
      </div>
    </div>
  );
};

export default FullscreenRunner;

import React, { useState, useEffect } from 'react';
import { TS_TOKENS } from '../../styles/theme.tokens';
import { FullscreenRunner } from './FullscreenRunner';
import { SlideRenderer, SlideDataModel } from './SlideRenderer';

export interface DeckItem {
  id: string;
  title: string;
  description: string;
  aspect_ratio: string;
  created_at: string;
  slides_count?: number;
}

export const PresentationManager: React.FC<{ projectId?: string; workspaceId?: string }> = ({
  projectId,
  workspaceId
}) => {
  const [decks, setDecks] = useState<DeckItem[]>([]);
  const [selectedDeck, setSelectedDeck] = useState<DeckItem | null>(null);
  const [slides, setSlides] = useState<SlideDataModel[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);
  const [isFullscreenOpen, setIsFullscreenOpen] = useState(false);
  const [isGeneratorModalOpen, setIsGeneratorModalOpen] = useState(false);

  // Formulario de generación por IA
  const [aiTitle, setAiTitle] = useState('Transformación Digital & Arquitectura Escalable');
  const [aiObjective, setAiObjective] = useState(
    'Optimización operativa, diagnóstico OPEX con causa raíz y despliegue de infraestructura reactiva de alta disponibilidad.'
  );
  const [aiContext, setAiContext] = useState('');

  // Cargar lista de mazos
  const fetchDecks = async () => {
    setIsLoading(true);
    try {
      const url = projectId
        ? `/api/v1/presentations?project_id=${projectId}`
        : `/api/v1/presentations`;
      const res = await fetch(url);
      if (res.ok) {
        const data = await res.json();
        setDecks(data);
        if (data.length > 0 && !selectedDeck) {
          loadDeckDetails(data[0].id);
        }
      }
    } catch (err) {
      console.error('Error fetching decks:', err);
    } finally {
      setIsLoading(false);
    }
  };

  const loadDeckDetails = async (deckId: string) => {
    try {
      const res = await fetch(`/api/v1/presentations/${deckId}`);
      if (res.ok) {
        const data = await res.json();
        setSelectedDeck(data.deck);
        setSlides(data.slides);
      }
    } catch (err) {
      console.error('Error loading deck details:', err);
    }
  };

  useEffect(() => {
    fetchDecks();
  }, [projectId]);

  const handleGenerateAI = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!aiTitle.trim() || !aiObjective.trim()) return;

    setIsGenerating(true);
    try {
      const res = await fetch('/api/v1/presentations/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          projectId,
          title: aiTitle,
          objective: aiObjective,
          contextSummary: aiContext
        })
      });

      if (res.ok) {
        const data = await res.json();
        setIsGeneratorModalOpen(false);
        await fetchDecks();
        if (data.deck) {
          await loadDeckDetails(data.deck.id);
        }
      } else {
        const errData = await res.json();
        alert(`Error al generar: ${errData.error || 'Respuesta inesperada'}`);
      }
    } catch (err: any) {
      alert(`Error en la llamada a la IA: ${err.message}`);
    } finally {
      setIsGenerating(false);
    }
  };

  const handleDeleteDeck = async (deckId: string) => {
    if (!confirm('¿Estás seguro de eliminar este mazo de diapositivas?')) return;
    try {
      const res = await fetch(`/api/v1/presentations/${deckId}`, { method: 'DELETE' });
      if (res.ok) {
        if (selectedDeck?.id === deckId) {
          setSelectedDeck(null);
          setSlides([]);
        }
        await fetchDecks();
      }
    } catch (err) {
      console.error('Error deleting deck:', err);
    }
  };

  return (
    <div
      className="ts-presentation-manager w-full rounded-2xl p-6 relative overflow-hidden"
      style={{
        backgroundColor: TS_TOKENS.colors.negroProfundo,
        border: `1px solid ${TS_TOKENS.colors.bordeCorporativo}`,
        color: TS_TOKENS.colors.blancoPuro,
        fontFamily: TS_TOKENS.typography.fontSans
      }}
    >
      {/* CABECERA DEL MÓDULO */}
      <div className="flex flex-col md:flex-row md:items-center justify-between pb-6 mb-6 border-b border-white/10 gap-4">
        <div>
          <div className="flex items-center gap-2.5 mb-1.5">
            <span
              className="w-3.5 h-3.5 inline-block"
              style={{
                clipPath: TS_TOKENS.geometry.clipHexagon,
                backgroundColor: TS_TOKENS.colors.naranjaEnergy
              }}
            />
            <h2
              className="text-xl md:text-2xl font-extrabold uppercase tracking-tight"
              style={{ fontFamily: TS_TOKENS.typography.fontBruno }}
            >
              DIAPOSITIVAS EJECUTIVAS{' '}
              <span style={{ color: TS_TOKENS.colors.aquaTurquesa }}>TSOLUTIONS IPIDD</span>
            </h2>
          </div>
          <p className="text-xs" style={{ color: TS_TOKENS.colors.humoSlate }}>
            Generación y presentación de diapositivas de alta dirección asistidas por IA (Estilo Tera AI / Gamma)
          </p>
        </div>

        {/* BOTONES DE ACCIÓN */}
        <div className="flex items-center gap-3">
          <button
            onClick={() => setIsGeneratorModalOpen(true)}
            className="px-4 py-2 rounded-full font-bold text-xs tracking-wider uppercase flex items-center gap-2 cursor-pointer transition-all hover:scale-105"
            style={{
              backgroundColor: TS_TOKENS.colors.naranjaEnergy,
              color: TS_TOKENS.colors.negroProfundo,
              boxShadow: TS_TOKENS.glows.glowEnergy,
              fontFamily: TS_TOKENS.typography.fontHeading
            }}
          >
            <span>✨</span> Generar con IA
          </button>

          {slides.length > 0 && (
            <button
              onClick={() => setIsFullscreenOpen(true)}
              className="px-4 py-2 rounded-full font-bold text-xs tracking-wider uppercase flex items-center gap-2 cursor-pointer transition-all hover:scale-105"
              style={{
                backgroundColor: 'rgba(0, 229, 255, 0.15)',
                border: `1px solid ${TS_TOKENS.colors.aquaTurquesa}`,
                color: TS_TOKENS.colors.aquaTurquesa,
                boxShadow: TS_TOKENS.glows.glowTurquesaSoft,
                fontFamily: TS_TOKENS.typography.fontHeading
              }}
            >
              <span>▶</span> Presentar [F]
            </button>
          )}
        </div>
      </div>

      {/* CONTENIDO PRINCIPAL: LISTADO LATERAL + VISTA PREVIA */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* COLUMNA IZQUIERDA: LISTA DE MAZOS */}
        <div className="lg:col-span-4 flex flex-col gap-3">
          <div className="flex items-center justify-between text-xs font-mono mb-1" style={{ color: TS_TOKENS.colors.humoSlate }}>
            <span>MAZOS REGISTRADOS ({decks.length})</span>
            <button onClick={fetchDecks} className="hover:text-white cursor-pointer">↻ Actualizar</button>
          </div>

          <div className="space-y-2.5 max-h-[500px] overflow-y-auto pr-1">
            {decks.map(deck => {
              const isSelected = selectedDeck?.id === deck.id;
              return (
                <div
                  key={deck.id}
                  onClick={() => loadDeckDetails(deck.id)}
                  className="p-3.5 rounded-xl cursor-pointer transition-all flex items-start justify-between"
                  style={{
                    backgroundColor: isSelected ? TS_TOKENS.colors.midnightPanel : 'rgba(18, 23, 34, 0.5)',
                    border: `1px solid ${isSelected ? TS_TOKENS.colors.naranjaEnergy : TS_TOKENS.colors.bordeCorporativo}`,
                    boxShadow: isSelected ? TS_TOKENS.glows.shadowCard : 'none'
                  }}
                >
                  <div className="flex-1 mr-2">
                    <h4
                      className="text-xs font-bold uppercase tracking-tight mb-1"
                      style={{
                        fontFamily: TS_TOKENS.typography.fontHeading,
                        color: isSelected ? TS_TOKENS.colors.blancoPuro : TS_TOKENS.colors.blancoPerla
                      }}
                    >
                      {deck.title}
                    </h4>
                    <p className="text-[11px] line-clamp-2" style={{ color: TS_TOKENS.colors.humoSlate }}>
                      {deck.description || 'Sin descripción'}
                    </p>
                    <div className="flex items-center gap-2 mt-2 text-[10px] font-mono">
                      <span style={{ color: TS_TOKENS.colors.aquaTurquesa }}>
                        {deck.slides_count || 0} diapositivas
                      </span>
                      <span className="text-white/20">•</span>
                      <span style={{ color: TS_TOKENS.colors.humoSlate }}>
                        {new Date(deck.created_at).toLocaleDateString()}
                      </span>
                    </div>
                  </div>

                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      handleDeleteDeck(deck.id);
                    }}
                    className="text-slate-500 hover:text-red-400 p-1 text-xs cursor-pointer"
                    title="Eliminar mazo"
                  >
                    🗑
                  </button>
                </div>
              );
            })}

            {decks.length === 0 && !isLoading && (
              <div
                className="p-6 text-center rounded-xl"
                style={{
                  backgroundColor: TS_TOKENS.colors.midnightPanel,
                  border: `1px dashed ${TS_TOKENS.colors.bordeCorporativo}`
                }}
              >
                <p className="text-xs text-slate-400 mb-3">No hay mazos de diapositivas aún.</p>
                <button
                  onClick={() => setIsGeneratorModalOpen(true)}
                  className="px-3 py-1.5 rounded-full text-xs font-bold"
                  style={{
                    backgroundColor: TS_TOKENS.colors.naranjaEnergy,
                    color: TS_TOKENS.colors.negroProfundo
                  }}
                >
                  Crear Primer Mazo con IA
                </button>
              </div>
            )}
          </div>
        </div>

        {/* COLUMNA DERECHA: VISTA PREVIA DEL MAZO SELECCIONADO */}
        <div className="lg:col-span-8 flex flex-col gap-4">
          {selectedDeck && slides.length > 0 ? (
            <div className="flex flex-col gap-3">
              <div className="flex items-center justify-between">
                <span className="text-xs font-mono" style={{ color: TS_TOKENS.colors.aquaTurquesa }}>
                  VISTA PREVIA ACTIVA • 16:9 CORPORATIVO
                </span>
                <button
                  onClick={() => setIsFullscreenOpen(true)}
                  className="text-xs font-mono hover:underline cursor-pointer"
                  style={{ color: TS_TOKENS.colors.naranjaEnergy }}
                >
                  Abrir Pantalla Completa ↗
                </button>
              </div>

              {/* Contenedor del Slide Activo */}
              <div className="rounded-xl overflow-hidden shadow-2xl">
                <SlideRenderer
                  slide={slides[0]}
                  currentSlide={1}
                  totalSlides={slides.length}
                />
              </div>

              {/* Tiras de Miniaturas */}
              <div className="flex items-center gap-3 overflow-x-auto py-2">
                {slides.map((s, idx) => (
                  <div
                    key={s.id || idx}
                    className="flex-shrink-0 w-36 aspect-video rounded-lg p-2 flex flex-col justify-between cursor-pointer border hover:border-orange-500 transition-all"
                    style={{
                      backgroundColor: TS_TOKENS.colors.midnightPanel,
                      borderColor: TS_TOKENS.colors.bordeCorporativo
                    }}
                    onClick={() => setIsFullscreenOpen(true)}
                  >
                    <span className="text-[9px] font-mono" style={{ color: TS_TOKENS.colors.humoSlate }}>
                      #{idx + 1} • {s.layout_type}
                    </span>
                    <span className="text-[10px] font-bold line-clamp-1 text-white">
                      {(s.slide_data as any)?.title || 'Slide'}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <div
              className="h-[360px] flex flex-col items-center justify-center text-center p-8 rounded-2xl"
              style={{
                backgroundColor: TS_TOKENS.colors.midnightPanel,
                border: `1px dashed ${TS_TOKENS.colors.bordeCorporativo}`
              }}
            >
              <div
                className="w-12 h-12 flex items-center justify-center mb-3"
                style={{
                  clipPath: TS_TOKENS.geometry.clipHexagon,
                  backgroundColor: 'rgba(255, 107, 0, 0.2)',
                  color: TS_TOKENS.colors.naranjaEnergy
                }}
              >
                ✨
              </div>
              <h3 className="text-base font-bold mb-1" style={{ fontFamily: TS_TOKENS.typography.fontHeading }}>
                Selecciona o genera un mazo de diapositivas
              </h3>
              <p className="text-xs max-w-md text-slate-400 mb-4">
                El AI Slide Engine de TSolutions IPIDD estructurará automáticamente diagnósticos OPEX, KPIs de impacto y rutas críticas.
              </p>
              <button
                onClick={() => setIsGeneratorModalOpen(true)}
                className="px-5 py-2 rounded-full font-bold text-xs uppercase cursor-pointer"
                style={{
                  backgroundColor: TS_TOKENS.colors.naranjaEnergy,
                  color: TS_TOKENS.colors.negroProfundo,
                  boxShadow: TS_TOKENS.glows.glowEnergy
                }}
              >
                Iniciar Generador IA
              </button>
            </div>
          )}
        </div>
      </div>

      {/* MODAL DE GENERACIÓN ASISTIDA POR IA */}
      {isGeneratorModalOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm"
          onClick={() => !isGenerating && setIsGeneratorModalOpen(false)}
        >
          <div
            className="w-full max-w-lg p-6 rounded-2xl relative"
            style={{
              backgroundColor: TS_TOKENS.colors.midnightPanel,
              border: `1px solid ${TS_TOKENS.colors.naranjaEnergy}`,
              boxShadow: TS_TOKENS.glows.glowEnergyHover
            }}
            onClick={e => e.stopPropagation()}
          >
            <div className="flex items-center justify-between pb-4 mb-4 border-b border-white/10">
              <div className="flex items-center gap-2">
                <span
                  className="w-3 h-3 inline-block"
                  style={{
                    clipPath: TS_TOKENS.geometry.clipHexagon,
                    backgroundColor: TS_TOKENS.colors.naranjaEnergy
                  }}
                />
                <h3
                  className="text-base font-bold uppercase tracking-tight"
                  style={{ fontFamily: TS_TOKENS.typography.fontBruno }}
                >
                  GENERAR DIAPOSITIVAS CON IA
                </h3>
              </div>
              <button
                onClick={() => !isGenerating && setIsGeneratorModalOpen(false)}
                className="text-slate-400 hover:text-white cursor-pointer"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleGenerateAI} className="space-y-4">
              <div>
                <label className="block text-xs font-mono font-bold uppercase mb-1" style={{ color: TS_TOKENS.colors.aquaTurquesa }}>
                  TÍTULO DE LA PRESENTACIÓN
                </label>
                <input
                  type="text"
                  value={aiTitle}
                  onChange={e => setAiTitle(e.target.value)}
                  className="w-full px-3.5 py-2.5 rounded-lg text-xs outline-none text-white font-medium"
                  style={{
                    backgroundColor: '#0A0D14',
                    border: `1px solid ${TS_TOKENS.colors.bordeCorporativo}`
                  }}
                  required
                />
              </div>

              <div>
                <label className="block text-xs font-mono font-bold uppercase mb-1" style={{ color: TS_TOKENS.colors.aquaTurquesa }}>
                  OBJETIVO ESTRATÉGICO / ALCANCE
                </label>
                <textarea
                  rows={3}
                  value={aiObjective}
                  onChange={e => setAiObjective(e.target.value)}
                  className="w-full px-3.5 py-2.5 rounded-lg text-xs outline-none text-white font-medium"
                  style={{
                    backgroundColor: '#0A0D14',
                    border: `1px solid ${TS_TOKENS.colors.bordeCorporativo}`
                  }}
                  required
                />
              </div>

              <div>
                <label className="block text-xs font-mono font-bold uppercase mb-1" style={{ color: TS_TOKENS.colors.humoSlate }}>
                  CONTEXTO ADICIONAL (OPCIONAL)
                </label>
                <input
                  type="text"
                  placeholder="Ej: Metodología 5S, reducción de tiempo en pasarela de pagos"
                  value={aiContext}
                  onChange={e => setAiContext(e.target.value)}
                  className="w-full px-3.5 py-2 rounded-lg text-xs outline-none text-white"
                  style={{
                    backgroundColor: '#0A0D14',
                    border: `1px solid ${TS_TOKENS.colors.bordeCorporativo}`
                  }}
                />
              </div>

              <div className="pt-2 flex items-center justify-end gap-3">
                <button
                  type="button"
                  disabled={isGenerating}
                  onClick={() => setIsGeneratorModalOpen(false)}
                  className="px-4 py-2 rounded-full text-xs font-bold text-slate-400 hover:text-white"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={isGenerating}
                  className="px-6 py-2.5 rounded-full font-bold text-xs uppercase tracking-wider flex items-center gap-2 cursor-pointer transition-all"
                  style={{
                    backgroundColor: TS_TOKENS.colors.naranjaEnergy,
                    color: TS_TOKENS.colors.negroProfundo,
                    boxShadow: TS_TOKENS.glows.glowEnergy
                  }}
                >
                  {isGenerating ? (
                    <>
                      <span className="animate-spin inline-block">↻</span> Generando mazo con IA...
                    </>
                  ) : (
                    <>✨ Generar Mazo Completo</>
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* VISUALIZADOR FULLSCREEN RUNNER */}
      {selectedDeck && (
        <FullscreenRunner
          isOpen={isFullscreenOpen}
          onClose={() => setIsFullscreenOpen(false)}
          deckTitle={selectedDeck.title}
          slides={slides}
        />
      )}
    </div>
  );
};

export default PresentationManager;

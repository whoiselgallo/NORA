/**
 * TOKENS OFICIALES E INMUTABLES - TSOLUTIONS IPIDD
 * Lema Rector: "Tecnología instalada. Conocimiento transferido. Negocios escalados."
 * 
 * Regla de Oro de Marca: Bloqueado estrictamente bajo el tema corporativo Dark Tech.
 * No se permite la alteración o sustitución de estos tokens por temas externos.
 */

export const TS_TOKENS = {
  motto: 'Tecnología instalada. Conocimiento transferido. Negocios escalados.',
  watermark: 'TSOLUTIONS IPIDD • SYSTEM ARCHITECTURE & OPEX',

  // 1. PALETA CROMÁTICA OFICIAL
  colors: {
    naranjaEnergy: '#FF6B00',      // Acento Primario, CTAs principales, badges destacados y precios
    aquaTurquesa: '#00E5FF',       // Acento Tecnológico, subtítulos clave, IA y estados activos
    negroProfundo: '#0A0D14',      // Fondo Principal de la interfaz Dark Tech
    midnightPanel: '#121722',      // Superficie de Tarjetas, contenedores, modales y formularios
    blancoPuro: '#FFFFFF',         // Texto Primario, encabezados de impacto H1/H2 y cifras
    blancoPerla: '#F8FAFC',        // Texto de Lectura, párrafos y descripciones
    humoSlate: '#94A3B8',          // Texto Secundario, notas técnicas y metadatos
    deepGrid: 'rgba(255, 255, 255, 0.03)', // Rejilla de fondo
    doradoPrestigio: '#F59E0B',    // Distintivos especiales y badges VIP
    bordeCorporativo: 'rgba(255, 255, 255, 0.10)', // Divisores y marcos
  },

  // 2. SOMBRAS Y RESPLANDORES (GLOWS)
  glows: {
    glowEnergy: '0 0 20px rgba(255, 107, 0, 0.45)',
    glowEnergyHover: '0 0 35px rgba(255, 107, 0, 0.70)',
    glowTurquesaSoft: '0 0 12px rgba(0, 229, 255, 0.30)',
    glowTurquesaHover: '0 0 20px rgba(0, 229, 255, 0.55)',
    glowBlancoPulse: '0 0 10px rgba(255, 255, 255, 0.80)',
    shadowCard: '0 4px 20px rgba(0, 0, 0, 0.40)',
  },

  // 3. JERARQUÍA TIPOGRÁFICA
  typography: {
    fontBruno: "'Bruno Ace', sans-serif",
    fontHeading: "'Space Grotesk', sans-serif",
    fontSans: "'Plus Jakarta Sans', 'Inter', sans-serif",
    fontMono: "monospace",
  },

  // 4. RADIOS DE CURVATURA
  radii: {
    radiusSoft: '4px',             // Badges pequeños y chips
    radiusMedium: '10px',          // Inputs, botones y tarjetas secundarias (8px a 12px)
    radiusLarge: '20px',           // Tarjetas maestras y modales (16px a 24px)
    radiusFull: '9999px',          // Píldoras y botones circulares
  },

  // 5. GEOMETRÍA Y LOGOTIPO OFICIAL
  geometry: {
    clipHexagon: 'polygon(50% 0%, 100% 25%, 100% 75%, 50% 100%, 0% 75%, 0% 25%)',
    borderHexagon: '2px solid #FF6B00',
    hexagonShadow: '0 0 10px rgba(255, 255, 255, 0.80)',
  },

  // 6. RUTAS DE ACTIVOS OFICIALES
  assets: {
    logoSvg: '/assets/TSolutionslogo/logoTSVG.svg',
    logoWebp: '/assets/TSolutionslogo/logoWEBP.webp',
    logoPng: '/assets/TSolutionslogo/logoTPNG.png',
  }
} as const;

export type TsTokens = typeof TS_TOKENS;
export default TS_TOKENS;

import React from 'react';
import { TS_TOKENS } from '../../../styles/theme.tokens';

export interface CodeAndArchitectureProps {
  data: {
    title: string;
    subtitle?: string;
    language?: string;
    codeSnippet: string;
    architectureNotes: string[];
    keyComponents: Array<{
      name: string;
      purpose: string;
    }>;
  };
}

export const CodeAndArchitecture: React.FC<CodeAndArchitectureProps> = ({ data }) => {
  return (
    <div className="w-full max-w-5xl mx-auto flex flex-col justify-center h-full">
      {/* Encabezado */}
      <div className="mb-4 text-center">
        <h2
          className="text-2xl md:text-3xl font-extrabold uppercase tracking-tight mb-1"
          style={{
            fontFamily: TS_TOKENS.typography.fontBruno,
            color: TS_TOKENS.colors.blancoPuro
          }}
        >
          {data.title}
        </h2>
        {data.subtitle && (
          <p
            className="text-xs md:text-sm font-medium"
            style={{
              fontFamily: TS_TOKENS.typography.fontHeading,
              color: TS_TOKENS.colors.aquaTurquesa
            }}
          >
            {data.subtitle}
          </p>
        )}
      </div>

      {/* Grid: Código a la Izquierda / Componentes y Notas a la Derecha */}
      <div className="grid grid-cols-1 md:grid-cols-12 gap-5 items-stretch">
        {/* Bloque de Código en font-mono */}
        <div
          className="md:col-span-7 p-4 flex flex-col rounded-lg overflow-hidden"
          style={{
            backgroundColor: '#07090E',
            border: `1px solid ${TS_TOKENS.colors.bordeCorporativo}`,
            boxShadow: TS_TOKENS.glows.shadowCard
          }}
        >
          <div className="flex items-center justify-between pb-2 mb-2 border-b border-white/10 text-[10px] font-mono">
            <div className="flex items-center gap-1.5">
              <span className="w-2.5 h-2.5 rounded-full bg-red-500/80 inline-block" />
              <span className="w-2.5 h-2.5 rounded-full bg-yellow-500/80 inline-block" />
              <span className="w-2.5 h-2.5 rounded-full bg-green-500/80 inline-block" />
              <span className="ml-2 text-slate-400 font-bold uppercase">{data.language || 'typescript'}</span>
            </div>
            <span style={{ color: TS_TOKENS.colors.aquaTurquesa }}>TSOLUTIONS IPIDD ENGINE</span>
          </div>

          <pre
            className="font-mono text-[11px] leading-relaxed overflow-x-auto text-emerald-400 flex-1 whitespace-pre"
            style={{
              fontFamily: TS_TOKENS.typography.fontMono
            }}
          >
            <code>{data.codeSnippet}</code>
          </pre>
        </div>

        {/* Bloque Arquitectónico */}
        <div className="md:col-span-5 flex flex-col gap-3 justify-between">
          <div
            className="p-4 rounded-lg flex-1"
            style={{
              backgroundColor: TS_TOKENS.colors.midnightPanel,
              border: `1px solid ${TS_TOKENS.colors.bordeCorporativo}`
            }}
          >
            <h4
              className="text-xs font-mono font-bold uppercase tracking-wider mb-2.5"
              style={{ color: TS_TOKENS.colors.naranjaEnergy }}
            >
              COMPONENTES CLAVE
            </h4>
            <div className="space-y-2">
              {data.keyComponents.map((comp, idx) => (
                <div key={idx} className="text-xs">
                  <span className="font-bold text-white font-mono">{comp.name}: </span>
                  <span style={{ color: TS_TOKENS.colors.humoSlate }}>{comp.purpose}</span>
                </div>
              ))}
            </div>
          </div>

          <div
            className="p-4 rounded-lg"
            style={{
              backgroundColor: TS_TOKENS.colors.midnightPanel,
              border: `1px solid rgba(0, 229, 255, 0.25)`
            }}
          >
            <h4
              className="text-xs font-mono font-bold uppercase tracking-wider mb-2"
              style={{ color: TS_TOKENS.colors.aquaTurquesa }}
            >
              DECISIONES TÉCNICAS SRE
            </h4>
            <ul className="space-y-1.5 text-[11px]">
              {data.architectureNotes.map((note, idx) => (
                <li key={idx} className="flex items-start gap-2" style={{ color: TS_TOKENS.colors.blancoPerla }}>
                  <span className="w-1.5 h-1.5 rounded-full mt-1 flex-shrink-0" style={{ backgroundColor: TS_TOKENS.colors.aquaTurquesa }} />
                  <span>{note}</span>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </div>
    </div>
  );
};

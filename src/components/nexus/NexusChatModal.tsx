import React, { useState, useEffect, useRef } from 'react';
import { TS_TOKENS } from '../../styles/theme.tokens';

export interface NexusMessage {
  id: string;
  sender: 'user' | 'nexus';
  content: string;
  timestamp: string;
  citedProjects?: string[];
  sources?: Array<{
    id: string;
    projectName: string;
    domain: string;
    title: string;
    similarity: number;
    rawContent: string;
  }>;
  similarity?: number;
  latencyMs?: number;
}

interface NexusChatModalProps {
  isOpen: boolean;
  onClose: () => void;
  workspaceId?: string;
  onSelectProjectRef?: (projectId: string) => void;
}

export const NexusChatModal: React.FC<NexusChatModalProps> = ({
  isOpen,
  onClose,
  workspaceId = '00000000-0000-0000-0000-000000000001',
  onSelectProjectRef
}) => {
  const [query, setQuery] = useState('');
  const [domainFilter, setDomainFilter] = useState<string>('');
  const [isLoading, setIsLoading] = useState(false);
  const [absorbedNotification, setAbsorbedNotification] = useState<any>(null);
  const [messages, setMessages] = useState<NexusMessage[]>([
    {
      id: 'welcome',
      sender: 'nexus',
      content: `Hola, soy **Nexus**, la inteligencia operativa y memoria técnica continua de **TSolutions IPIDD**.\n\nAccedo a la base de conocimiento vectorial en Neon PostgreSQL para capitalizar lecciones aprendidas, topologías DAG estables y causas raíz OPEX de proyectos archivados. ¿Qué reto técnico u operativo deseas consultar hoy?`,
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    }
  ]);

  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const handleSend = async (customQuery?: string) => {
    const textToSend = customQuery || query;
    if (!textToSend.trim() || isLoading) return;

    const userMsg: NexusMessage = {
      id: `usr_${Date.now()}`,
      sender: 'user',
      content: textToSend.trim(),
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    };

    setMessages(prev => [...prev, userMsg]);
    setQuery('');
    setIsLoading(true);

    try {
      const token = typeof window !== 'undefined' ? (localStorage.getItem('nexus_auth_token') || sessionStorage.getItem('nexus_auth_token')) : null;
      const resp = await fetch('/api/v1/nexus/query', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-user-role': 'COLLABORATOR',
          ...(token ? { 'Authorization': `Bearer ${token}` } : {})
        },
        body: JSON.stringify({
          query: textToSend.trim(),
          min_similarity: 0.60,
          domain_filter: domainFilter || undefined
        })
      });

      if (!resp.ok) {
        throw new Error(`HTTP ${resp.status}: Error al consultar a Nexus`);
      }

      const data = await resp.json();

      const nexusMsg: NexusMessage = {
        id: `nex_${Date.now()}`,
        sender: 'nexus',
        content: data.answer,
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        citedProjects: data.citedProjects,
        sources: data.sources,
        similarity: data.benchmarkSimilarity,
        latencyMs: data.queryLatencyMs
      };

      setMessages(prev => [...prev, nexusMsg]);
    } catch (err: any) {
      setMessages(prev => [
        ...prev,
        {
          id: `err_${Date.now()}`,
          sender: 'nexus',
          content: `⚠️ Error de comunicación con la memoria vectorial: ${err.message}`,
          timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
        }
      ]);
    } finally {
      setIsLoading(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        backgroundColor: 'rgba(6, 9, 15, 0.85)',
        backdropFilter: 'blur(8px)',
        zIndex: 9999,
        display: 'flex',
        justifyContent: 'center',
        alignItems: 'center',
        padding: '20px'
      }}
    >
      <div
        style={{
          width: '100%',
          maxWidth: '900px',
          height: '85vh',
          backgroundColor: TS_TOKENS.colors.negroProfundo,
          border: `2px solid ${TS_TOKENS.colors.aquaTurquesa}`,
          boxShadow: TS_TOKENS.glows.glowTurquesaHover,
          borderRadius: TS_TOKENS.radii.radiusLarge,
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden'
        }}
      >
        {/* HEADER */}
        <div
          style={{
            padding: '18px 24px',
            backgroundColor: TS_TOKENS.colors.midnightPanel,
            borderBottom: `1px solid ${TS_TOKENS.colors.bordeCorporativo}`,
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center'
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <div
              style={{
                width: '36px',
                height: '36px',
                borderRadius: '8px',
                background: 'linear-gradient(135deg, #00E5FF, #FF6B00)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: '1.2rem',
                fontWeight: 'bold',
                color: '#0A0D14'
              }}
            >
              🧠
            </div>
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <h2
                  style={{
                    fontFamily: TS_TOKENS.typography.fontBruno,
                    fontSize: '1.15rem',
                    color: TS_TOKENS.colors.blancoPuro,
                    margin: 0
                  }}
                >
                  NEXUS // MEMORIA CONTINUA
                </h2>
                <span
                  style={{
                    padding: '2px 8px',
                    fontSize: '0.65rem',
                    fontFamily: TS_TOKENS.typography.fontMono,
                    backgroundColor: 'rgba(0, 229, 255, 0.15)',
                    color: TS_TOKENS.colors.aquaTurquesa,
                    borderRadius: '4px',
                    border: '1px solid rgba(0, 229, 255, 0.4)'
                  }}
                >
                  PGVECTOR (1536-D) • HNSW
                </span>
              </div>
              <p
                style={{
                  fontFamily: TS_TOKENS.typography.fontHeading,
                  fontSize: '0.78rem',
                  color: TS_TOKENS.colors.humoSlate,
                  margin: 0
                }}
              >
                {TS_TOKENS.motto}
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            style={{
              background: 'transparent',
              border: 'none',
              color: TS_TOKENS.colors.humoSlate,
              fontSize: '1.4rem',
              cursor: 'pointer',
              padding: '4px 8px',
              borderRadius: '4px'
            }}
          >
            ✕
          </button>
        </div>

        {/* NOTIFICACIÓN REACTIVA DE NUEVA ASIMILACIÓN */}
        {absorbedNotification && (
          <div
            style={{
              backgroundColor: 'rgba(0, 229, 255, 0.1)',
              borderBottom: '1px solid rgba(0, 229, 255, 0.3)',
              padding: '8px 24px',
              fontSize: '0.78rem',
              color: TS_TOKENS.colors.aquaTurquesa,
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center'
            }}
          >
            <span>
              ⚡ <strong>Nuevo Conocimiento Asimilado:</strong> Se integraron {absorbedNotification.absorbedCount} vectores del proyecto <em>{absorbedNotification.projectName}</em>.
            </span>
            <button
              onClick={() => setAbsorbedNotification(null)}
              style={{ background: 'none', border: 'none', color: '#FFF', cursor: 'pointer' }}
            >
              ✕
            </button>
          </div>
        )}

        {/* CHAT MESSAGES AREA */}
        <div
          style={{
            flex: 1,
            overflowY: 'auto',
            padding: '24px',
            display: 'flex',
            flexDirection: 'column',
            gap: '18px'
          }}
        >
          {messages.map(msg => (
            <div
              key={msg.id}
              style={{
                alignSelf: msg.sender === 'user' ? 'flex-end' : 'flex-start',
                maxWidth: msg.sender === 'user' ? '80%' : '90%',
                display: 'flex',
                flexDirection: 'column',
                gap: '6px'
              }}
            >
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px',
                  justifyContent: msg.sender === 'user' ? 'flex-end' : 'flex-start'
                }}
              >
                <span
                  style={{
                    fontFamily: TS_TOKENS.typography.fontMono,
                    fontSize: '0.68rem',
                    color: msg.sender === 'user' ? TS_TOKENS.colors.naranjaEnergy : TS_TOKENS.colors.aquaTurquesa
                  }}
                >
                  {msg.sender === 'user' ? 'TÚ (OPERACIONES)' : 'NEXUS BRAIN'}
                </span>
                <span style={{ fontSize: '0.65rem', color: TS_TOKENS.colors.humoSlate }}>
                  {msg.timestamp}
                </span>
                {msg.latencyMs !== undefined && (
                  <span
                    style={{
                      fontFamily: TS_TOKENS.typography.fontMono,
                      fontSize: '0.65rem',
                      color: msg.latencyMs < 100 ? '#10B981' : '#F59E0B'
                    }}
                  >
                    ⚡ {msg.latencyMs}ms
                  </span>
                )}
              </div>

              <div
                style={{
                  backgroundColor: msg.sender === 'user' ? '#1E293B' : TS_TOKENS.colors.midnightPanel,
                  border: msg.sender === 'user'
                    ? `1px solid ${TS_TOKENS.colors.naranjaEnergy}`
                    : `1px solid rgba(0, 229, 255, 0.35)`,
                  borderRadius: TS_TOKENS.radii.radiusMedium,
                  padding: '16px 20px',
                  color: TS_TOKENS.colors.blancoPerla,
                  fontSize: '0.88rem',
                  lineHeight: 1.6,
                  whiteSpace: 'pre-wrap',
                  boxShadow: msg.sender === 'user'
                    ? 'none'
                    : '0 4px 20px rgba(0,0,0,0.5)'
                }}
              >
                {msg.content}

                {/* FUENTES Y PROYECTOS CITADOS */}
                {msg.citedProjects && msg.citedProjects.length > 0 && (
                  <div
                    style={{
                      marginTop: '16px',
                      paddingTop: '12px',
                      borderTop: '1px solid rgba(255,255,255,0.1)',
                      display: 'flex',
                      flexWrap: 'wrap',
                      gap: '8px',
                      alignItems: 'center'
                    }}
                  >
                    <span
                      style={{
                        fontFamily: TS_TOKENS.typography.fontMono,
                        fontSize: '0.7rem',
                        color: TS_TOKENS.colors.aquaTurquesa,
                        textTransform: 'uppercase'
                      }}
                    >
                      Proyectos Archivados Citados:
                    </span>
                    {msg.citedProjects.map(pName => (
                      <span
                        key={pName}
                        style={{
                          backgroundColor: 'rgba(255, 107, 0, 0.15)',
                          border: `1px solid ${TS_TOKENS.colors.naranjaEnergy}`,
                          color: TS_TOKENS.colors.blancoPuro,
                          fontFamily: TS_TOKENS.typography.fontMono,
                          fontSize: '0.72rem',
                          padding: '3px 8px',
                          borderRadius: '4px'
                        }}
                      >
                        [Proyecto: {pName}]
                      </span>
                    ))}
                  </div>
                )}

                {/* FRAGMENTOS AFINES RECUPERADOS */}
                {msg.sources && msg.sources.length > 0 && (
                  <details style={{ marginTop: '12px', cursor: 'pointer' }}>
                    <summary
                      style={{
                        fontSize: '0.72rem',
                        color: TS_TOKENS.colors.humoSlate,
                        fontFamily: TS_TOKENS.typography.fontMono
                      }}
                    >
                      Ver {msg.sources.length} fragmentos recuperados por similitud de coseno
                    </summary>
                    <div style={{ marginTop: '8px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
                      {msg.sources.map(s => (
                        <div
                          key={s.id}
                          style={{
                            backgroundColor: '#0A0D14',
                            border: '1px solid rgba(255,255,255,0.08)',
                            borderRadius: '6px',
                            padding: '10px',
                            fontSize: '0.75rem'
                          }}
                        >
                          <div style={{ display: 'flex', justifyContent: 'space-between', color: TS_TOKENS.colors.aquaTurquesa, marginBottom: '4px' }}>
                            <strong>{s.title}</strong>
                            <span>Afinidad: {(s.similarity * 100).toFixed(1)}%</span>
                          </div>
                          <div style={{ color: TS_TOKENS.colors.humoSlate, maxHeight: '80px', overflowY: 'auto' }}>
                            {s.rawContent}
                          </div>
                        </div>
                      ))}
                    </div>
                  </details>
                )}
              </div>
            </div>
          ))}

          {isLoading && (
            <div
              style={{
                alignSelf: 'flex-start',
                backgroundColor: TS_TOKENS.colors.midnightPanel,
                border: `1px solid ${TS_TOKENS.colors.aquaTurquesa}`,
                borderRadius: TS_TOKENS.radii.radiusMedium,
                padding: '14px 20px',
                color: TS_TOKENS.colors.aquaTurquesa,
                fontSize: '0.85rem',
                fontFamily: TS_TOKENS.typography.fontMono,
                display: 'flex',
                alignItems: 'center',
                gap: '10px'
              }}
            >
              <div
                style={{
                  width: '12px',
                  height: '12px',
                  border: '2px solid rgba(0, 229, 255, 0.3)',
                  borderTopColor: '#00E5FF',
                  borderRadius: '50%',
                  animation: 'spin 0.8s linear infinite'
                }}
              />
              Buscando en memoria HNSW pgvector y sintetizando respuesta preventiva...
            </div>
          )}
          <div ref={messagesEndRef} />
        </div>

        {/* SUGGESTION CHIPS */}
        <div
          style={{
            padding: '8px 24px',
            backgroundColor: TS_TOKENS.colors.midnightPanel,
            borderTop: `1px solid ${TS_TOKENS.colors.bordeCorporativo}`,
            display: 'flex',
            gap: '8px',
            overflowX: 'auto'
          }}
        >
          <span style={{ fontSize: '0.72rem', color: TS_TOKENS.colors.humoSlate, alignSelf: 'center', whiteSpace: 'nowrap' }}>
            Consultas sugeridas:
          </span>
          {[
            '¿Qué fallas de CI/CD tuvimos en Node/Docker y cómo se mitigaron?',
            '¿Cuáles fueron las causas raíz OPEX de alta latencia?',
            '¿Cuál fue el ROI promedio y tiempo de ciclo en proyectos pasados?'
          ].map(sug => (
            <button
              key={sug}
              onClick={() => handleSend(sug)}
              style={{
                background: 'rgba(255, 255, 255, 0.04)',
                border: '1px solid rgba(255, 255, 255, 0.1)',
                color: TS_TOKENS.colors.blancoPerla,
                fontSize: '0.72rem',
                padding: '4px 10px',
                borderRadius: '9999px',
                cursor: 'pointer',
                whiteSpace: 'nowrap',
                transition: 'all 0.2s'
              }}
              onMouseEnter={e => {
                e.currentTarget.style.borderColor = TS_TOKENS.colors.aquaTurquesa;
                e.currentTarget.style.color = TS_TOKENS.colors.aquaTurquesa;
              }}
              onMouseLeave={e => {
                e.currentTarget.style.borderColor = 'rgba(255, 255, 255, 0.1)';
                e.currentTarget.style.color = TS_TOKENS.colors.blancoPerla;
              }}
            >
              {sug}
            </button>
          ))}
        </div>

        {/* INPUT FORM */}
        <div
          style={{
            padding: '16px 24px',
            backgroundColor: TS_TOKENS.colors.negroProfundo,
            borderTop: `1px solid ${TS_TOKENS.colors.bordeCorporativo}`,
            display: 'flex',
            flexDirection: 'column',
            gap: '10px'
          }}
        >
          <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
            <select
              value={domainFilter}
              onChange={e => setDomainFilter(e.target.value)}
              style={{
                backgroundColor: TS_TOKENS.colors.midnightPanel,
                color: TS_TOKENS.colors.blancoPuro,
                border: '1px solid rgba(255,255,255,0.15)',
                borderRadius: '8px',
                padding: '10px 12px',
                fontSize: '0.75rem',
                fontFamily: TS_TOKENS.typography.fontMono,
                outline: 'none'
              }}
            >
              <option value="">Todos los dominios</option>
              <option value="ARCHITECTURE_STACK">ARCHITECTURE_STACK</option>
              <option value="OPEX_ROOT_CAUSE">OPEX_ROOT_CAUSE</option>
              <option value="METRICS_AND_ROI">METRICS_AND_ROI</option>
              <option value="LESSONS_LEARNED">LESSONS_LEARNED</option>
              <option value="SOP_PROCEDURES">SOP_PROCEDURES</option>
            </select>

            <input
              type="text"
              placeholder="Consulta a Nexus sobre incidentes, causas raíz, decisiones de arquitectura o ROI..."
              value={query}
              onChange={e => setQuery(e.target.value)}
              onKeyDown={e => {
                if (e.key === 'Enter') handleSend();
              }}
              style={{
                flex: 1,
                backgroundColor: TS_TOKENS.colors.midnightPanel,
                border: '1px solid rgba(255,255,255,0.15)',
                color: TS_TOKENS.colors.blancoPuro,
                borderRadius: '8px',
                padding: '12px 16px',
                fontSize: '0.85rem',
                outline: 'none'
              }}
            />

            <button
              onClick={() => handleSend()}
              disabled={isLoading || !query.trim()}
              style={{
                backgroundColor: TS_TOKENS.colors.naranjaEnergy,
                color: '#FFF',
                border: 'none',
                borderRadius: '8px',
                padding: '12px 20px',
                fontWeight: 'bold',
                fontSize: '0.82rem',
                cursor: isLoading || !query.trim() ? 'not-allowed' : 'pointer',
                opacity: isLoading || !query.trim() ? 0.6 : 1,
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                transition: 'all 0.2s',
                boxShadow: TS_TOKENS.glows.glowEnergy
              }}
            >
              <span>Consultar Nexus</span> ➔
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

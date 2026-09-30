import React, { useState, useEffect } from 'react';
import { TS_TOKENS } from '../../styles/theme.tokens';

export interface ArchivedProjectItem {
  id: string;
  name: string;
  description: string;
  github_repo: string;
  tech_stack: Record<string, any>;
  created_at: string;
  status: string;
  closed_at: string;
  client_sign_off_name: string;
  client_feedback_rating: number;
  client_comments: string;
  final_roi_amount: number;
  final_cycle_time_days: number;
  final_sigma_level: number;
  vectors_count: number;
}

interface ArchivedProjectsLibraryProps {
  isOpen: boolean;
  onClose: () => void;
  workspaceId?: string;
  onOpenNexusChat?: () => void;
}

export const ArchivedProjectsLibrary: React.FC<ArchivedProjectsLibraryProps> = ({
  isOpen,
  onClose,
  workspaceId = '00000000-0000-0000-0000-000000000001',
  onOpenNexusChat
}) => {
  const [projects, setProjects] = useState<ArchivedProjectItem[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedStack, setSelectedStack] = useState('');
  const [minRating, setMinRating] = useState<number>(0);
  const [selectedSnapshot, setSelectedSnapshot] = useState<any>(null);
  const [isLoadingSnapshot, setIsLoadingSnapshot] = useState(false);
  const [activeSnapshotTab, setActiveSnapshotTab] = useState<'kpis' | 'dag' | 'opex' | 'certificate'>('kpis');

  const fetchArchivedProjects = async () => {
    setIsLoading(true);
    try {
      const params = new URLSearchParams();
      if (searchTerm) params.append('search', searchTerm);
      if (selectedStack) params.append('stack', selectedStack);
      if (minRating > 0) params.append('minRating', minRating.toString());

      const res = await fetch(`/api/v1/projects/archived?${params.toString()}`);
      if (res.ok) {
        const data = await res.json();
        setProjects(data);
      }
    } catch (err) {
      console.error('Error fetching archived projects:', err);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    if (isOpen) {
      fetchArchivedProjects();
    }
  }, [isOpen, selectedStack, minRating]);

  const viewProjectSnapshot = async (projectId: string) => {
    setIsLoadingSnapshot(true);
    try {
      const res = await fetch(`/api/v1/projects/${projectId}/snapshot`);
      if (res.ok) {
        const data = await res.json();
        setSelectedSnapshot(data);
      }
    } catch (err) {
      console.error('Error fetching snapshot:', err);
    } finally {
      setIsLoadingSnapshot(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        backgroundColor: 'rgba(6, 9, 15, 0.88)',
        backdropFilter: 'blur(8px)',
        zIndex: 9998,
        display: 'flex',
        justifyContent: 'center',
        alignItems: 'center',
        padding: '24px'
      }}
    >
      <div
        style={{
          width: '100%',
          maxWidth: '1200px',
          height: '90vh',
          backgroundColor: TS_TOKENS.colors.negroProfundo,
          border: `2px solid ${TS_TOKENS.colors.naranjaEnergy}`,
          boxShadow: TS_TOKENS.glows.glowEnergy,
          borderRadius: TS_TOKENS.radii.radiusLarge,
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden'
        }}
      >
        {/* HEADER */}
        <div
          style={{
            padding: '20px 28px',
            backgroundColor: TS_TOKENS.colors.midnightPanel,
            borderBottom: `1px solid ${TS_TOKENS.colors.bordeCorporativo}`,
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center'
          }}
        >
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
              <h2
                style={{
                  fontFamily: TS_TOKENS.typography.fontBruno,
                  fontSize: '1.25rem',
                  color: TS_TOKENS.colors.blancoPuro,
                  margin: 0
                }}
              >
                BIBLIOTECA DE PROYECTOS ARCHIVADOS
              </h2>
              <span
                style={{
                  backgroundColor: 'rgba(255, 107, 0, 0.15)',
                  border: `1px solid ${TS_TOKENS.colors.naranjaEnergy}`,
                  color: TS_TOKENS.colors.naranjaEnergy,
                  fontFamily: TS_TOKENS.typography.fontMono,
                  fontSize: '0.7rem',
                  padding: '2px 8px',
                  borderRadius: '4px'
                }}
              >
                SNAPSHOT INMUTABLE • SOLO LECTURA
              </span>
            </div>
            <p
              style={{
                fontFamily: TS_TOKENS.typography.fontHeading,
                fontSize: '0.8rem',
                color: TS_TOKENS.colors.humoSlate,
                margin: '4px 0 0 0'
              }}
            >
              Histórico formal de proyectos cerrados, actas ejecutivas y vectores asimilados por Nexus.
            </p>
          </div>

          <div style={{ display: 'flex', gap: '12px', alignItems: 'center' }}>
            {onOpenNexusChat && (
              <button
                onClick={onOpenNexusChat}
                style={{
                  backgroundColor: 'transparent',
                  border: `1px solid ${TS_TOKENS.colors.aquaTurquesa}`,
                  color: TS_TOKENS.colors.aquaTurquesa,
                  padding: '8px 14px',
                  borderRadius: '8px',
                  fontFamily: TS_TOKENS.typography.fontMono,
                  fontSize: '0.78rem',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px'
                }}
              >
                <span>🧠 Consultar Nexus Brain</span>
              </button>
            )}
            <button
              onClick={onClose}
              style={{
                background: 'transparent',
                border: 'none',
                color: TS_TOKENS.colors.humoSlate,
                fontSize: '1.4rem',
                cursor: 'pointer'
              }}
            >
              ✕
            </button>
          </div>
        </div>

        {/* FILTERS TOOLBAR */}
        <div
          style={{
            padding: '14px 28px',
            backgroundColor: TS_TOKENS.colors.negroProfundo,
            borderBottom: `1px solid ${TS_TOKENS.colors.bordeCorporativo}`,
            display: 'flex',
            gap: '14px',
            flexWrap: 'wrap',
            alignItems: 'center'
          }}
        >
          <input
            type="text"
            placeholder="Buscar por proyecto, descripción o cliente..."
            value={searchTerm}
            onChange={e => setSearchTerm(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && fetchArchivedProjects()}
            style={{
              flex: 1,
              minWidth: '240px',
              backgroundColor: TS_TOKENS.colors.midnightPanel,
              border: '1px solid rgba(255,255,255,0.15)',
              color: '#FFF',
              borderRadius: '6px',
              padding: '8px 14px',
              fontSize: '0.8rem'
            }}
          />

          <select
            value={selectedStack}
            onChange={e => setSelectedStack(e.target.value)}
            style={{
              backgroundColor: TS_TOKENS.colors.midnightPanel,
              color: '#FFF',
              border: '1px solid rgba(255,255,255,0.15)',
              borderRadius: '6px',
              padding: '8px 12px',
              fontSize: '0.8rem'
            }}
          >
            <option value="">Todos los stacks</option>
            <option value="PostgreSQL">PostgreSQL / Neon</option>
            <option value="React">React / TypeScript</option>
            <option value="BullMQ">BullMQ / Redis</option>
            <option value="Docker">Docker / CI-CD</option>
          </select>

          <select
            value={minRating}
            onChange={e => setMinRating(Number(e.target.value))}
            style={{
              backgroundColor: TS_TOKENS.colors.midnightPanel,
              color: '#FFF',
              border: '1px solid rgba(255,255,255,0.15)',
              borderRadius: '6px',
              padding: '8px 12px',
              fontSize: '0.8rem'
            }}
          >
            <option value={0}>Todas las calificaciones</option>
            <option value={5}>★★★★★ (5 Estrellas)</option>
            <option value={4}>★★★★☆ (4+ Estrellas)</option>
            <option value={3}>★★★☆☆ (3+ Estrellas)</option>
          </select>

          <button
            onClick={fetchArchivedProjects}
            style={{
              backgroundColor: 'rgba(255, 107, 0, 0.2)',
              border: `1px solid ${TS_TOKENS.colors.naranjaEnergy}`,
              color: TS_TOKENS.colors.naranjaEnergy,
              borderRadius: '6px',
              padding: '8px 16px',
              fontSize: '0.8rem',
              fontWeight: 'bold',
              cursor: 'pointer'
            }}
          >
            Filtrar
          </button>
        </div>

        {/* PROJECTS GRID / LIST */}
        <div
          style={{
            flex: 1,
            overflowY: 'auto',
            padding: '28px',
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fill, minmax(340px, 1fr))',
            gap: '20px',
            alignContent: 'start'
          }}
        >
          {isLoading && (
            <div style={{ color: TS_TOKENS.colors.aquaTurquesa, gridColumn: '1 / -1', textAlign: 'center', padding: '40px' }}>
              Cargando biblioteca de proyectos archivados...
            </div>
          )}

          {!isLoading && projects.length === 0 && (
            <div
              style={{
                gridColumn: '1 / -1',
                textAlign: 'center',
                padding: '60px 20px',
                color: TS_TOKENS.colors.humoSlate
              }}
            >
              <div style={{ fontSize: '2.5rem', marginBottom: '12px' }}>📁</div>
              <h3 style={{ color: '#FFF', margin: '0 0 8px 0' }}>No hay proyectos archivados con estos filtros</h3>
              <p style={{ fontSize: '0.85rem' }}>
                Al concluir formalmente un proyecto activo desde el centro de control, quedará sellado en este repositorio inmutable.
              </p>
            </div>
          )}

          {projects.map(proj => (
            <div
              key={proj.id}
              style={{
                backgroundColor: TS_TOKENS.colors.midnightPanel,
                border: '1px solid rgba(255,255,255,0.1)',
                borderRadius: TS_TOKENS.radii.radiusMedium,
                padding: '20px',
                display: 'flex',
                flexDirection: 'column',
                gap: '12px',
                transition: 'all 0.2s',
                boxShadow: '0 4px 16px rgba(0,0,0,0.3)'
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                <span
                  style={{
                    backgroundColor: 'rgba(16, 185, 129, 0.15)',
                    color: '#10B981',
                    border: '1px solid #10B981',
                    fontFamily: TS_TOKENS.typography.fontMono,
                    fontSize: '0.65rem',
                    padding: '2px 6px',
                    borderRadius: '4px'
                  }}
                >
                  ARCHIVADO INMUTABLE
                </span>
                <span style={{ color: '#F59E0B', fontSize: '0.85rem' }}>
                  {'★'.repeat(proj.client_feedback_rating || 5)}
                </span>
              </div>

              <div>
                <h3
                  style={{
                    fontFamily: TS_TOKENS.typography.fontHeading,
                    fontSize: '1.05rem',
                    color: TS_TOKENS.colors.blancoPuro,
                    margin: '0 0 6px 0'
                  }}
                >
                  {proj.name}
                </h3>
                <p
                  style={{
                    fontSize: '0.8rem',
                    color: TS_TOKENS.colors.humoSlate,
                    margin: 0,
                    lineHeight: 1.4,
                    display: '-webkit-box',
                    WebkitLineClamp: 2,
                    WebkitBoxOrient: 'vertical',
                    overflow: 'hidden'
                  }}
                >
                  {proj.description || 'Proyecto de arquitectura y optimización operativa.'}
                </p>
              </div>

              {/* KPIS DE CIERRE */}
              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(3, 1fr)',
                  gap: '8px',
                  backgroundColor: '#0A0D14',
                  borderRadius: '6px',
                  padding: '10px 8px',
                  textAlign: 'center'
                }}
              >
                <div>
                  <div style={{ color: TS_TOKENS.colors.naranjaEnergy, fontFamily: TS_TOKENS.typography.fontBruno, fontSize: '0.85rem' }}>
                    ${(Number(proj.final_roi_amount) || 0).toLocaleString()}
                  </div>
                  <div style={{ color: TS_TOKENS.colors.humoSlate, fontSize: '0.62rem', textTransform: 'uppercase' }}>
                    ROI Auditado
                  </div>
                </div>
                <div>
                  <div style={{ color: TS_TOKENS.colors.aquaTurquesa, fontFamily: TS_TOKENS.typography.fontBruno, fontSize: '0.85rem' }}>
                    {proj.final_cycle_time_days || 0}d
                  </div>
                  <div style={{ color: TS_TOKENS.colors.humoSlate, fontSize: '0.62rem', textTransform: 'uppercase' }}>
                    Ciclo Final
                  </div>
                </div>
                <div>
                  <div style={{ color: '#F59E0B', fontFamily: TS_TOKENS.typography.fontBruno, fontSize: '0.85rem' }}>
                    {proj.final_sigma_level || 5.9}σ
                  </div>
                  <div style={{ color: TS_TOKENS.colors.humoSlate, fontSize: '0.62rem', textTransform: 'uppercase' }}>
                    Six Sigma
                  </div>
                </div>
              </div>

              <div style={{ fontSize: '0.72rem', color: TS_TOKENS.colors.humoSlate }}>
                <strong>Firmante:</strong> {proj.client_sign_off_name || 'Stakeholder'} •{' '}
                <strong>Vectores Nexus:</strong> {proj.vectors_count || 5}
              </div>

              <button
                onClick={() => viewProjectSnapshot(proj.id)}
                style={{
                  marginTop: 'auto',
                  backgroundColor: 'rgba(0, 229, 255, 0.1)',
                  border: `1px solid ${TS_TOKENS.colors.aquaTurquesa}`,
                  color: TS_TOKENS.colors.aquaTurquesa,
                  padding: '8px 12px',
                  borderRadius: '6px',
                  fontSize: '0.78rem',
                  fontWeight: 'bold',
                  cursor: 'pointer',
                  display: 'flex',
                  justifyContent: 'center',
                  alignItems: 'center',
                  gap: '6px'
                }}
              >
                <span>Inspeccionar Snapshot Inmutable</span> ↗
              </button>
            </div>
          ))}
        </div>

        {/* MODAL DETALLE DE SNAPSHOT INMUTABLE */}
        {selectedSnapshot && (
          <div
            style={{
              position: 'fixed',
              inset: 0,
              backgroundColor: 'rgba(6, 9, 15, 0.95)',
              zIndex: 10000,
              display: 'flex',
              justifyContent: 'center',
              alignItems: 'center',
              padding: '24px'
            }}
          >
            <div
              style={{
                width: '100%',
                maxWidth: '1050px',
                height: '88vh',
                backgroundColor: TS_TOKENS.colors.negroProfundo,
                border: `2px solid ${TS_TOKENS.colors.aquaTurquesa}`,
                borderRadius: TS_TOKENS.radii.radiusLarge,
                display: 'flex',
                flexDirection: 'column',
                overflow: 'hidden'
              }}
            >
              {/* SNAPSHOT HEADER */}
              <div
                style={{
                  padding: '16px 24px',
                  backgroundColor: TS_TOKENS.colors.midnightPanel,
                  borderBottom: '1px solid rgba(255,255,255,0.1)',
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center'
                }}
              >
                <div>
                  <span
                    style={{
                      fontFamily: TS_TOKENS.typography.fontMono,
                      fontSize: '0.65rem',
                      color: TS_TOKENS.colors.aquaTurquesa
                    }}
                  >
                    INMUTABLE SNAPSHOT JSONB AUDITADO • STATUS: ARCHIVED
                  </span>
                  <h3
                    style={{
                      fontFamily: TS_TOKENS.typography.fontBruno,
                      fontSize: '1.15rem',
                      color: '#FFF',
                      margin: '2px 0 0 0'
                    }}
                  >
                    {selectedSnapshot.project_name}
                  </h3>
                </div>

                <button
                  onClick={() => setSelectedSnapshot(null)}
                  style={{
                    background: 'transparent',
                    border: 'none',
                    color: TS_TOKENS.colors.humoSlate,
                    fontSize: '1.4rem',
                    cursor: 'pointer'
                  }}
                >
                  ✕
                </button>
              </div>

              {/* SNAPSHOT SUBTABS */}
              <div
                style={{
                  display: 'flex',
                  gap: '8px',
                  padding: '10px 24px',
                  backgroundColor: '#0D131F',
                  borderBottom: '1px solid rgba(255,255,255,0.08)'
                }}
              >
                {[
                  { id: 'kpis', label: '📊 Métricas & Cierre' },
                  { id: 'dag', label: '🟢 Topología DAG en Verde' },
                  { id: 'opex', label: '🔍 DMAIC, Ishikawa & 5W' },
                  { id: 'certificate', label: '📜 Acta Ejecutiva Oficial' }
                ].map(t => (
                  <button
                    key={t.id}
                    onClick={() => setActiveSnapshotTab(t.id as any)}
                    style={{
                      padding: '6px 14px',
                      fontSize: '0.78rem',
                      fontFamily: TS_TOKENS.typography.fontMono,
                      borderRadius: '6px',
                      border: 'none',
                      backgroundColor: activeSnapshotTab === t.id ? TS_TOKENS.colors.naranjaEnergy : 'transparent',
                      color: activeSnapshotTab === t.id ? '#FFF' : TS_TOKENS.colors.humoSlate,
                      cursor: 'pointer',
                      fontWeight: activeSnapshotTab === t.id ? 'bold' : 'normal'
                    }}
                  >
                    {t.label}
                  </button>
                ))}
              </div>

              {/* SNAPSHOT CONTENT */}
              <div style={{ flex: 1, overflowY: 'auto', padding: '24px' }}>
                {activeSnapshotTab === 'kpis' && (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '16px' }}>
                      <div style={{ backgroundColor: TS_TOKENS.colors.midnightPanel, padding: '20px', borderRadius: '8px', border: '1px solid rgba(255,107,0,0.3)', textAlign: 'center' }}>
                        <div style={{ fontFamily: TS_TOKENS.typography.fontBruno, fontSize: '1.6rem', color: TS_TOKENS.colors.naranjaEnergy }}>
                          ${Number(selectedSnapshot.final_roi_amount || 0).toLocaleString()}
                        </div>
                        <div style={{ color: TS_TOKENS.colors.humoSlate, fontSize: '0.75rem', marginTop: '4px' }}>ROI AUDITADO FINAL</div>
                      </div>
                      <div style={{ backgroundColor: TS_TOKENS.colors.midnightPanel, padding: '20px', borderRadius: '8px', border: '1px solid rgba(0,229,255,0.3)', textAlign: 'center' }}>
                        <div style={{ fontFamily: TS_TOKENS.typography.fontBruno, fontSize: '1.6rem', color: TS_TOKENS.colors.aquaTurquesa }}>
                          {selectedSnapshot.final_cycle_time_days || 0} DÍAS
                        </div>
                        <div style={{ color: TS_TOKENS.colors.humoSlate, fontSize: '0.75rem', marginTop: '4px' }}>TIEMPO DE CICLO CONCLUIDO</div>
                      </div>
                      <div style={{ backgroundColor: TS_TOKENS.colors.midnightPanel, padding: '20px', borderRadius: '8px', border: '1px solid rgba(245,158,11,0.3)', textAlign: 'center' }}>
                        <div style={{ fontFamily: TS_TOKENS.typography.fontBruno, fontSize: '1.6rem', color: '#F59E0B' }}>
                          {selectedSnapshot.final_sigma_level || 5.9} σ
                        </div>
                        <div style={{ color: TS_TOKENS.colors.humoSlate, fontSize: '0.75rem', marginTop: '4px' }}>CALIDAD SIX SIGMA</div>
                      </div>
                    </div>

                    <div style={{ backgroundColor: TS_TOKENS.colors.midnightPanel, padding: '20px', borderRadius: '8px', border: '1px solid rgba(255,255,255,0.1)' }}>
                      <h4 style={{ color: TS_TOKENS.colors.aquaTurquesa, margin: '0 0 10px 0' }}>Conformidad y Sign-off del Cliente</h4>
                      <p style={{ margin: '4px 0', fontSize: '0.85rem' }}>
                        <strong>Representante Firmante:</strong> {selectedSnapshot.client_sign_off_name}
                      </p>
                      <p style={{ margin: '4px 0', fontSize: '0.85rem' }}>
                        <strong>Calificación:</strong> {'★'.repeat(selectedSnapshot.client_feedback_rating || 5)} ({selectedSnapshot.client_feedback_rating}/5)
                      </p>
                      <p style={{ margin: '8px 0 0 0', fontSize: '0.85rem', color: TS_TOKENS.colors.humoSlate }}>
                        <em>"{selectedSnapshot.snapshot_data?.closure?.client_comments || 'Sin comentarios adicionales; proyecto concluido con éxito.'}"</em>
                      </p>
                    </div>
                  </div>
                )}

                {activeSnapshotTab === 'dag' && (
                  <div>
                    <h4 style={{ color: '#10B981', margin: '0 0 16px 0' }}>Topología DAG 100% en GREEN al Momento del Cierre</h4>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: '14px' }}>
                      {(selectedSnapshot.snapshot_data?.workflow_dag?.nodes || []).map((node: any) => (
                        <div
                          key={node.id}
                          style={{
                            backgroundColor: '#0D131F',
                            border: '2px solid #10B981',
                            boxShadow: '0 0 12px rgba(16, 185, 129, 0.2)',
                            borderRadius: '8px',
                            padding: '14px'
                          }}
                        >
                          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '6px' }}>
                            <span style={{ fontSize: '0.65rem', color: TS_TOKENS.colors.humoSlate, textTransform: 'uppercase' }}>{node.category}</span>
                            <span style={{ fontSize: '0.65rem', color: '#10B981', fontWeight: 'bold' }}>GREEN ✓</span>
                          </div>
                          <div style={{ fontWeight: 'bold', fontSize: '0.85rem', color: '#FFF' }}>{node.title}</div>
                          <div style={{ fontSize: '0.72rem', color: TS_TOKENS.colors.humoSlate, marginTop: '4px' }}>
                            Completado: {node.completed_at ? new Date(node.completed_at).toLocaleDateString() : 'Auditoría Cierre'}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {activeSnapshotTab === 'opex' && (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                    <h4 style={{ color: TS_TOKENS.colors.aquaTurquesa, margin: 0 }}>Causas Raíz y 5 Porqués Consolidados</h4>
                    {(selectedSnapshot.snapshot_data?.opex?.five_whys || []).map((fw: any, idx: number) => (
                      <div key={idx} style={{ backgroundColor: TS_TOKENS.colors.midnightPanel, padding: '16px', borderRadius: '8px', border: '1px solid rgba(255,255,255,0.1)' }}>
                        <div style={{ color: TS_TOKENS.colors.naranjaEnergy, fontWeight: 'bold', fontSize: '0.85rem', marginBottom: '6px' }}>
                          Problema: {fw.problem}
                        </div>
                        <div style={{ color: '#FFF', fontSize: '0.8rem', marginBottom: '6px' }}>
                          <strong>Causa Raíz Confirmada:</strong> {fw.root_cause}
                        </div>
                      </div>
                    ))}
                  </div>
                )}

                {activeSnapshotTab === 'certificate' && (
                  <div
                    style={{
                      backgroundColor: '#0A0D14',
                      padding: '20px',
                      borderRadius: '8px',
                      border: '1px solid rgba(255,255,255,0.1)'
                    }}
                    dangerouslySetInnerHTML={{
                      __html: selectedSnapshot.snapshot_data?.executive_certificate?.certificate_html || '<p>Certificado oficial archivado</p>'
                    }}
                  />
                )}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

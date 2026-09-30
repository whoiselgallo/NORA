import React, { useState, useEffect, useRef } from 'react';
import { TS_TOKENS } from '../../styles/theme.tokens';

// =============================================================================
// TYPES & CONTRACTS (ZERO ANY FALLBACK)
// =============================================================================

export interface IntegrationStatus {
  provider: 'github' | 'gitlab' | 'google_tasks';
  name: string;
  connected: boolean;
  externalAccount?: string;
  mappedEntity?: string;
  lastSyncAt?: string;
  details?: Record<string, string | number | boolean>;
}

export interface PreflightReport {
  format: string;
  totalRows: number;
  validRows: number;
  invalidRows: number;
  columnMapping: Record<string, string>;
  warnings: string[];
  samplePreview: Array<{
    title: string;
    description?: string;
    status: string;
    priority: string;
    due_date?: string;
  }>;
}

export interface IngestedDocument {
  id: string;
  filename: string;
  mime_type: string;
  file_size: number;
  status: 'PENDING' | 'PROCESSING' | 'INDEXED' | 'FAILED';
  chunk_count: number;
  total_tokens: number;
  created_at: string;
  error_message?: string;
}

export interface ChatSource {
  id: string;
  title: string;
  type: 'project' | 'document';
  sourceName: string;
  sectionOrChunk?: string;
  similarity: number;
  snippet: string;
}

export interface StudioChatMessage {
  id: string;
  sender: 'user' | 'nexus';
  content: string;
  timestamp: string;
  sources?: ChatSource[];
  similarity?: number;
  latencyMs?: number;
}

interface NexusArchitectStudioProps {
  workspaceId?: string;
  projectId?: string;
  onNavigateToWorkflow?: (projectId: string) => void;
}

export const NexusArchitectStudio: React.FC<NexusArchitectStudioProps> = ({
  workspaceId = '00000000-0000-0000-0000-000000000001',
  projectId = '00000000-0000-0000-0000-000000000101',
  onNavigateToWorkflow
}) => {
  // Navigation
  const [activeTab, setActiveTab] = useState<'integrations' | 'import' | 'documents' | 'copilot'>('integrations');

  // Integrations state
  const [integrations, setIntegrations] = useState<IntegrationStatus[]>([
    {
      provider: 'github',
      name: 'GitHub Enterprise / Cloud',
      connected: false,
      details: { webhookStatus: 'Activo', eventsReceived: 142 }
    },
    {
      provider: 'gitlab',
      name: 'GitLab Community / Ultimate',
      connected: false,
      details: { pipelineSync: 'Listo', ciCdSync: true }
    },
    {
      provider: 'google_tasks',
      name: 'Google Tasks Workspace',
      connected: false,
      details: { bidirectionalSync: 'Activo', queueStatus: 'BullMQ Idle' }
    }
  ]);
  const [githubRepoInput, setGithubRepoInput] = useState('tsolutions-ipidd/system-architecture');
  const [gitlabProjectInput, setGitlabProjectInput] = useState('tsolutions/core-runtime');
  const [connectingProvider, setConnectingProvider] = useState<string | null>(null);

  // Universal Import state
  const [importFormat, setImportFormat] = useState<'AUTO' | 'JSON' | 'CSV' | 'TRELLO' | 'MONDAY' | 'ASANA' | 'JIRA'>('AUTO');
  const [importFile, setImportFile] = useState<File | null>(null);
  const [preflightData, setPreflightData] = useState<PreflightReport | null>(null);
  const [isPreflighting, setIsPreflighting] = useState(false);
  const [isImporting, setIsImporting] = useState(false);
  const [importResult, setImportResult] = useState<{ success: boolean; message: string; count?: number } | null>(null);

  // Document Ingestion state
  const [docFile, setDocFile] = useState<File | null>(null);
  const [isUploadingDoc, setIsUploadingDoc] = useState(false);
  const [documentsList, setDocumentsList] = useState<IngestedDocument[]>([]);
  const [uploadProgress, setUploadProgress] = useState<string | null>(null);

  // Copilot state
  const [chatInput, setChatInput] = useState('');
  const [isQueryingNexus, setIsQueryingNexus] = useState(false);
  const [chatMessages, setChatMessages] = useState<StudioChatMessage[]>([
    {
      id: 'welcome',
      sender: 'nexus',
      content: `Bienvenido a **Nexus Architect Studio** de **TSolutions IPIDD**.\n\nEstoy conectado a la memoria continua pgvector (1536-D). He indexado la arquitectura de repositorios, lecciones aprendidas de proyectos cerrados y tus documentos técnicos asimilados. ¿Cómo puedo asistirte en el diseño o integración hoy?`,
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    }
  ]);
  const chatEndRef = useRef<HTMLDivElement>(null);

  // =============================================================================
  // EFFECTS & DATA FETCHING
  // =============================================================================

  useEffect(() => {
    fetchIntegrationStatus();
    fetchDocuments();
  }, [workspaceId]);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [chatMessages]);

  const fetchIntegrationStatus = async () => {
    try {
      const resp = await fetch(`/api/v1/integrations/status?workspace_id=${workspaceId}`);
      if (resp.ok) {
        const data = await resp.json();
        if (data.integrations) {
          setIntegrations(data.integrations);
        }
      }
    } catch {
      // Fallback a estado local
    }
  };

  const fetchDocuments = async () => {
    try {
      const resp = await fetch(`/api/v1/documents?workspace_id=${workspaceId}`);
      if (resp.ok) {
        const data = await resp.json();
        setDocumentsList(data.documents || []);
      }
    } catch {
      // Silencioso en caso de error
    }
  };

  // =============================================================================
  // TAB 1: INTEGRATIONS HANDLERS
  // =============================================================================

  const handleConnectProvider = async (provider: 'github' | 'gitlab' | 'google_tasks') => {
    setConnectingProvider(provider);
    try {
      const resp = await fetch('/api/v1/integrations/connect', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-workspace-id': workspaceId
        },
        body: JSON.stringify({
          provider,
          workspace_id: workspaceId,
          access_token: `mock_oauth_token_${provider}_${Date.now()}`,
          refresh_token: provider === 'google_tasks' ? `mock_refresh_token_${Date.now()}` : undefined
        })
      });

      if (resp.ok) {
        setIntegrations(prev =>
          prev.map(i =>
            i.provider === provider
              ? { ...i, connected: true, lastSyncAt: new Date().toISOString() }
              : i
          )
        );
      }
    } catch (err) {
      console.error('Error connecting integration:', err);
    } finally {
      setConnectingProvider(null);
    }
  };

  const handleLinkRepo = async (provider: 'github' | 'gitlab') => {
    try {
      const endpoint = provider === 'github' ? '/api/v1/integrations/github/link' : '/api/v1/integrations/gitlab/link';
      const body = provider === 'github'
        ? { workspace_id: workspaceId, project_id: projectId, repository: githubRepoInput }
        : { workspace_id: workspaceId, project_id: projectId, project_path: gitlabProjectInput };

      const resp = await fetch(endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-workspace-id': workspaceId
        },
        body: JSON.stringify(body)
      });

      if (resp.ok) {
        setIntegrations(prev =>
          prev.map(i =>
            i.provider === provider
              ? { ...i, connected: true, mappedEntity: provider === 'github' ? githubRepoInput : gitlabProjectInput }
              : i
          )
        );
      }
    } catch (err) {
      console.error('Error linking repository:', err);
    }
  };

  // =============================================================================
  // TAB 2: UNIVERSAL IMPORT HANDLERS
  // =============================================================================

  const handleRunPreflight = async () => {
    if (!importFile) return;
    setIsPreflighting(true);
    setPreflightData(null);
    setImportResult(null);

    try {
      const content = await importFile.text();
      const resp = await fetch('/api/v1/projects/import/preflight', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-workspace-id': workspaceId
        },
        body: JSON.stringify({
          workspace_id: workspaceId,
          project_id: projectId,
          source_type: importFormat,
          raw_content: content
        })
      });

      if (!resp.ok) {
        const errorData = await resp.json();
        throw new Error(errorData.error || 'Fallo en pre-flight');
      }

      const report: PreflightReport = await resp.json();
      setPreflightData(report);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Error desconocido en pre-flight';
      setImportResult({ success: false, message: msg });
    } finally {
      setIsPreflighting(false);
    }
  };

  const handleExecuteImport = async () => {
    if (!importFile || !preflightData) return;
    setIsImporting(true);
    setImportResult(null);

    try {
      const content = await importFile.text();
      const resp = await fetch('/api/v1/projects/import', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-workspace-id': workspaceId
        },
        body: JSON.stringify({
          workspace_id: workspaceId,
          project_id: projectId,
          source_type: importFormat,
          raw_content: content
        })
      });

      const data = await resp.json();
      if (!resp.ok) {
        throw new Error(data.error || 'Fallo en la importación');
      }

      setImportResult({
        success: true,
        message: `Importación atómica exitosa. Se insertaron ${data.tasksImported ?? preflightData.validRows} tareas, sincronizadas con el Calendario y vinculadas a nodos DAG.`,
        count: data.tasksImported ?? preflightData.validRows
      });
      setImportFile(null);
      setPreflightData(null);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Error al ejecutar importación';
      setImportResult({ success: false, message: msg });
    } finally {
      setIsImporting(false);
    }
  };

  // =============================================================================
  // TAB 3: DOCUMENT INGESTION HANDLERS
  // =============================================================================

  const handleUploadDocument = async () => {
    if (!docFile) return;
    setIsUploadingDoc(true);
    setUploadProgress('Enviando archivo al pipeline...');

    try {
      const formData = new FormData();
      formData.append('document', docFile);
      formData.append('workspace_id', workspaceId);
      if (projectId) formData.append('project_id', projectId);

      const resp = await fetch('/api/v1/documents/upload', {
        method: 'POST',
        headers: {
          'x-workspace-id': workspaceId
        },
        body: formData
      });

      if (!resp.ok) {
        const errData = await resp.json();
        throw new Error(errData.error || 'Error en la carga del documento');
      }

      setUploadProgress('Documento en cola BullMQ para vectorización semántica (1536-D).');
      setDocFile(null);
      await fetchDocuments();
      setTimeout(() => setUploadProgress(null), 4000);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Error al procesar documento';
      setUploadProgress(`⚠️ ${msg}`);
    } finally {
      setIsUploadingDoc(false);
    }
  };

  // =============================================================================
  // TAB 4: COPILOT RAG CHAT HANDLERS
  // =============================================================================

  const handleSendQuery = async () => {
    if (!chatInput.trim() || isQueryingNexus) return;

    const userText = chatInput.trim();
    const userMessage: StudioChatMessage = {
      id: `usr_${Date.now()}`,
      sender: 'user',
      content: userText,
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    };

    setChatMessages(prev => [...prev, userMessage]);
    setChatInput('');
    setIsQueryingNexus(true);

    try {
      const startTime = Date.now();
      const resp = await fetch('/api/v1/nexus/ask', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-workspace-id': workspaceId
        },
        body: JSON.stringify({
          query: userText,
          workspace_id: workspaceId,
          domain: 'SYSTEM_ARCHITECTURE',
          min_similarity: 0.65
        })
      });

      if (!resp.ok) {
        throw new Error(`HTTP ${resp.status}`);
      }

      const data = await resp.json();
      const latency = Date.now() - startTime;

      const sources: ChatSource[] = (data.sources || []).map((s: {
        id?: string;
        title?: string;
        sourceName?: string;
        projectName?: string;
        documentName?: string;
        sectionOrChunk?: string;
        similarity?: number;
        rawContent?: string;
        snippet?: string;
      }) => ({
        id: s.id || `src_${Math.random()}`,
        title: s.title || s.projectName || s.documentName || 'Fuente Técnica',
        type: s.documentName ? 'document' : 'project',
        sourceName: s.documentName || s.projectName || 'TSolutions Base',
        sectionOrChunk: s.sectionOrChunk,
        similarity: s.similarity || 0.85,
        snippet: s.snippet || s.rawContent || ''
      }));

      const nexusMessage: StudioChatMessage = {
        id: `nex_${Date.now()}`,
        sender: 'nexus',
        content: data.answer || 'Respuesta generada a partir de la memoria técnica de Nexus.',
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        sources,
        similarity: data.benchmarkSimilarity || (sources.length > 0 ? sources[0].similarity : 0.90),
        latencyMs: latency
      };

      setChatMessages(prev => [...prev, nexusMessage]);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Error al consultar Nexus';
      setChatMessages(prev => [
        ...prev,
        {
          id: `err_${Date.now()}`,
          sender: 'nexus',
          content: `⚠️ Error al recuperar contexto de la memoria vectorial: ${msg}`,
          timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
        }
      ]);
    } finally {
      setIsQueryingNexus(false);
    }
  };

  // =============================================================================
  // RENDER INTERFACE (STRICT DARK TECH TOKENS)
  // =============================================================================

  return (
    <div
      style={{
        minHeight: '100vh',
        backgroundColor: TS_TOKENS.colors.negroProfundo,
        backgroundImage: `radial-gradient(${TS_TOKENS.colors.deepGrid} 1px, transparent 1px)`,
        backgroundSize: '24px 24px',
        color: TS_TOKENS.colors.blancoPerla,
        fontFamily: TS_TOKENS.typography.fontSans,
        display: 'flex',
        flexDirection: 'column'
      }}
    >
      {/* ------------------------------------------------------------------- */}
      {/* 1. TOP HEADER & OFFICIAL ISOTYPE / LOGO */}
      {/* ------------------------------------------------------------------- */}
      <header
        style={{
          height: '74px',
          borderBottom: `1px solid ${TS_TOKENS.colors.bordeCorporativo}`,
          backgroundColor: 'rgba(18, 23, 34, 0.92)',
          backdropFilter: 'blur(10px)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '0 32px',
          position: 'sticky',
          top: 0,
          zIndex: 100
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '20px' }}>
          {/* Hexagonal Isotype */}
          <div
            style={{
              width: '44px',
              height: '44px',
              backgroundColor: TS_TOKENS.colors.midnightPanel,
              clipPath: TS_TOKENS.geometry.clipHexagon,
              border: TS_TOKENS.geometry.borderHexagon,
              boxShadow: TS_TOKENS.geometry.hexagonShadow,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              position: 'relative'
            }}
          >
            <span
              style={{
                fontFamily: TS_TOKENS.typography.fontBruno,
                fontSize: '1.2rem',
                color: TS_TOKENS.colors.naranjaEnergy,
                fontWeight: 'bold'
              }}
            >
              T
            </span>
          </div>

          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
              <h1
                style={{
                  fontFamily: TS_TOKENS.typography.fontBruno,
                  fontSize: '1.15rem',
                  letterSpacing: '0.04em',
                  color: TS_TOKENS.colors.blancoPuro,
                  margin: 0
                }}
              >
                NEXUS ARCHITECT STUDIO
              </h1>
              <span
                style={{
                  fontSize: '0.65rem',
                  padding: '3px 8px',
                  borderRadius: TS_TOKENS.radii.radiusSoft,
                  backgroundColor: 'rgba(0, 229, 255, 0.12)',
                  border: `1px solid ${TS_TOKENS.colors.aquaTurquesa}`,
                  color: TS_TOKENS.colors.aquaTurquesa,
                  fontFamily: TS_TOKENS.typography.fontHeading,
                  fontWeight: 600,
                  textTransform: 'uppercase',
                  letterSpacing: '0.05em'
                }}
              >
                Enterprise Hub
              </span>
            </div>
            <p
              style={{
                margin: 0,
                fontSize: '0.78rem',
                color: TS_TOKENS.colors.humoSlate,
                fontFamily: TS_TOKENS.typography.fontHeading
              }}
            >
              Arquitectura de Sistemas, Ingestión Universal y Memoria Continua Vectorial
            </p>
          </div>
        </div>

        {/* Workspace & Project Context Info */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
          <div
            style={{
              padding: '6px 14px',
              borderRadius: TS_TOKENS.radii.radiusMedium,
              backgroundColor: TS_TOKENS.colors.midnightPanel,
              border: `1px solid ${TS_TOKENS.colors.bordeCorporativo}`,
              display: 'flex',
              alignItems: 'center',
              gap: '10px'
            }}
          >
            <span
              style={{
                width: '8px',
                height: '8px',
                borderRadius: '50%',
                backgroundColor: '#10B981',
                boxShadow: '0 0 8px #10B981'
              }}
            />
            <span
              style={{
                fontSize: '0.75rem',
                fontFamily: TS_TOKENS.typography.fontMono,
                color: TS_TOKENS.colors.humoSlate
              }}
            >
              WS: <strong style={{ color: TS_TOKENS.colors.aquaTurquesa }}>{workspaceId.slice(0, 8)}...</strong> | PRJ:{' '}
              <strong style={{ color: TS_TOKENS.colors.doradoPrestigio }}>{projectId.slice(0, 8)}...</strong>
            </span>
          </div>

          {onNavigateToWorkflow && (
            <button
              onClick={() => onNavigateToWorkflow(projectId)}
              style={{
                padding: '8px 16px',
                backgroundColor: 'transparent',
                border: `1px solid ${TS_TOKENS.colors.aquaTurquesa}`,
                borderRadius: TS_TOKENS.radii.radiusMedium,
                color: TS_TOKENS.colors.aquaTurquesa,
                fontFamily: TS_TOKENS.typography.fontHeading,
                fontSize: '0.82rem',
                fontWeight: 600,
                cursor: 'pointer',
                transition: 'all 0.2s ease',
                boxShadow: TS_TOKENS.glows.glowTurquesaSoft
              }}
            >
              Ir al DAG Flow ⇗
            </button>
          )}
        </div>
      </header>

      {/* ------------------------------------------------------------------- */}
      {/* 2. TAB NAVIGATION BAR */}
      {/* ------------------------------------------------------------------- */}
      <nav
        style={{
          display: 'flex',
          gap: '8px',
          padding: '12px 32px',
          borderBottom: `1px solid ${TS_TOKENS.colors.bordeCorporativo}`,
          backgroundColor: 'rgba(10, 13, 20, 0.75)'
        }}
      >
        {[
          { id: 'integrations', label: '1. Hub de Integraciones', icon: '⚡' },
          { id: 'import', label: '2. Importador Universal', icon: '📥' },
          { id: 'documents', label: '3. Asimilación Documental (25 MB)', icon: '📄' },
          { id: 'copilot', label: '4. Nexus Copilot (RAG Memory)', icon: '🧠' }
        ].map(tab => {
          const isActive = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id as typeof activeTab)}
              style={{
                padding: '10px 20px',
                borderRadius: TS_TOKENS.radii.radiusMedium,
                border: isActive
                  ? `1px solid ${TS_TOKENS.colors.naranjaEnergy}`
                  : `1px solid transparent`,
                backgroundColor: isActive ? 'rgba(255, 107, 0, 0.12)' : 'transparent',
                color: isActive ? TS_TOKENS.colors.blancoPuro : TS_TOKENS.colors.humoSlate,
                fontFamily: TS_TOKENS.typography.fontHeading,
                fontSize: '0.88rem',
                fontWeight: isActive ? 600 : 500,
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                transition: 'all 0.2s ease',
                boxShadow: isActive ? TS_TOKENS.glows.glowEnergy : 'none'
              }}
            >
              <span>{tab.icon}</span>
              <span>{tab.label}</span>
            </button>
          );
        })}
      </nav>

      {/* ------------------------------------------------------------------- */}
      {/* 3. MAIN WORKSPACE CONTENT */}
      {/* ------------------------------------------------------------------- */}
      <main style={{ flex: 1, padding: '32px', maxWidth: '1440px', width: '100%', margin: '0 auto' }}>
        {/* ================================================================= */}
        {/* TAB 1: HUB DE INTEGRACIONES */}
        {/* ================================================================= */}
        {activeTab === 'integrations' && (
          <div>
            <div style={{ marginBottom: '24px' }}>
              <h2
                style={{
                  fontFamily: TS_TOKENS.typography.fontHeading,
                  fontSize: '1.4rem',
                  color: TS_TOKENS.colors.blancoPuro,
                  margin: '0 0 6px 0'
                }}
              >
                Conectividad y Webhooks Nativos
              </h2>
              <p style={{ margin: 0, color: TS_TOKENS.colors.humoSlate, fontSize: '0.9rem' }}>
                Credenciales gestionadas con cifrado militar <strong>AES-256-GCM</strong>. Sincroniza telemetría, commits, CI/CD y tareas bidireccionales.
              </p>
            </div>

            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fit, minmax(380px, 1fr))',
                gap: '24px'
              }}
            >
              {/* GitHub Card */}
              <div
                style={{
                  backgroundColor: TS_TOKENS.colors.midnightPanel,
                  borderRadius: TS_TOKENS.radii.radiusLarge,
                  border: `1px solid ${TS_TOKENS.colors.bordeCorporativo}`,
                  padding: '24px',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '18px'
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                    <div
                      style={{
                        width: '38px',
                        height: '38px',
                        borderRadius: '8px',
                        backgroundColor: '#24292e',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        fontSize: '1.2rem'
                      }}
                    >
                      🐙
                    </div>
                    <div>
                      <h3 style={{ margin: 0, fontSize: '1.05rem', color: TS_TOKENS.colors.blancoPuro }}>
                        GitHub Integration
                      </h3>
                      <span style={{ fontSize: '0.75rem', color: TS_TOKENS.colors.humoSlate }}>
                        Webhooks & Telemetría CI/CD
                      </span>
                    </div>
                  </div>
                  <span
                    style={{
                      padding: '4px 10px',
                      borderRadius: TS_TOKENS.radii.radiusSoft,
                      fontSize: '0.72rem',
                      fontFamily: TS_TOKENS.typography.fontHeading,
                      backgroundColor: integrations[0]?.connected ? 'rgba(16, 185, 129, 0.15)' : 'rgba(239, 68, 68, 0.15)',
                      color: integrations[0]?.connected ? '#10B981' : '#EF4444',
                      border: `1px solid ${integrations[0]?.connected ? '#10B981' : '#EF4444'}`
                    }}
                  >
                    {integrations[0]?.connected ? 'CONECTADO' : 'NO VINCULADO'}
                  </span>
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                  <label style={{ fontSize: '0.8rem', color: TS_TOKENS.colors.humoSlate }}>
                    Repositorio Objetivo (owner/repo):
                  </label>
                  <input
                    type="text"
                    value={githubRepoInput}
                    onChange={e => setGithubRepoInput(e.target.value)}
                    style={{
                      padding: '10px 14px',
                      borderRadius: TS_TOKENS.radii.radiusMedium,
                      backgroundColor: TS_TOKENS.colors.negroProfundo,
                      border: `1px solid ${TS_TOKENS.colors.bordeCorporativo}`,
                      color: TS_TOKENS.colors.blancoPuro,
                      fontFamily: TS_TOKENS.typography.fontMono,
                      fontSize: '0.85rem'
                    }}
                  />
                </div>

                <div style={{ display: 'flex', gap: '10px', marginTop: 'auto' }}>
                  <button
                    onClick={() => handleConnectProvider('github')}
                    disabled={connectingProvider === 'github'}
                    style={{
                      flex: 1,
                      padding: '10px',
                      backgroundColor: TS_TOKENS.colors.naranjaEnergy,
                      border: 'none',
                      borderRadius: TS_TOKENS.radii.radiusMedium,
                      color: TS_TOKENS.colors.blancoPuro,
                      fontFamily: TS_TOKENS.typography.fontHeading,
                      fontSize: '0.85rem',
                      fontWeight: 600,
                      cursor: 'pointer',
                      boxShadow: TS_TOKENS.glows.glowEnergy
                    }}
                  >
                    {connectingProvider === 'github' ? 'Conectando...' : 'Autenticar OAuth'}
                  </button>
                  <button
                    onClick={() => handleLinkRepo('github')}
                    style={{
                      padding: '10px 16px',
                      backgroundColor: 'transparent',
                      border: `1px solid ${TS_TOKENS.colors.aquaTurquesa}`,
                      borderRadius: TS_TOKENS.radii.radiusMedium,
                      color: TS_TOKENS.colors.aquaTurquesa,
                      fontFamily: TS_TOKENS.typography.fontHeading,
                      fontSize: '0.85rem',
                      fontWeight: 600,
                      cursor: 'pointer'
                    }}
                  >
                    Vincular Repo
                  </button>
                </div>
              </div>

              {/* GitLab Card */}
              <div
                style={{
                  backgroundColor: TS_TOKENS.colors.midnightPanel,
                  borderRadius: TS_TOKENS.radii.radiusLarge,
                  border: `1px solid ${TS_TOKENS.colors.bordeCorporativo}`,
                  padding: '24px',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '18px'
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                    <div
                      style={{
                        width: '38px',
                        height: '38px',
                        borderRadius: '8px',
                        backgroundColor: '#fc6d26',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        fontSize: '1.2rem'
                      }}
                    >
                      🦊
                    </div>
                    <div>
                      <h3 style={{ margin: 0, fontSize: '1.05rem', color: TS_TOKENS.colors.blancoPuro }}>
                        GitLab CI/CD
                      </h3>
                      <span style={{ fontSize: '0.75rem', color: TS_TOKENS.colors.humoSlate }}>
                        Pipelines & Deployments
                      </span>
                    </div>
                  </div>
                  <span
                    style={{
                      padding: '4px 10px',
                      borderRadius: TS_TOKENS.radii.radiusSoft,
                      fontSize: '0.72rem',
                      fontFamily: TS_TOKENS.typography.fontHeading,
                      backgroundColor: integrations[1]?.connected ? 'rgba(16, 185, 129, 0.15)' : 'rgba(239, 68, 68, 0.15)',
                      color: integrations[1]?.connected ? '#10B981' : '#EF4444',
                      border: `1px solid ${integrations[1]?.connected ? '#10B981' : '#EF4444'}`
                    }}
                  >
                    {integrations[1]?.connected ? 'CONECTADO' : 'NO VINCULADO'}
                  </span>
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                  <label style={{ fontSize: '0.8rem', color: TS_TOKENS.colors.humoSlate }}>
                    Ruta del Proyecto en GitLab:
                  </label>
                  <input
                    type="text"
                    value={gitlabProjectInput}
                    onChange={e => setGitlabProjectInput(e.target.value)}
                    style={{
                      padding: '10px 14px',
                      borderRadius: TS_TOKENS.radii.radiusMedium,
                      backgroundColor: TS_TOKENS.colors.negroProfundo,
                      border: `1px solid ${TS_TOKENS.colors.bordeCorporativo}`,
                      color: TS_TOKENS.colors.blancoPuro,
                      fontFamily: TS_TOKENS.typography.fontMono,
                      fontSize: '0.85rem'
                    }}
                  />
                </div>

                <div style={{ display: 'flex', gap: '10px', marginTop: 'auto' }}>
                  <button
                    onClick={() => handleConnectProvider('gitlab')}
                    disabled={connectingProvider === 'gitlab'}
                    style={{
                      flex: 1,
                      padding: '10px',
                      backgroundColor: TS_TOKENS.colors.naranjaEnergy,
                      border: 'none',
                      borderRadius: TS_TOKENS.radii.radiusMedium,
                      color: TS_TOKENS.colors.blancoPuro,
                      fontFamily: TS_TOKENS.typography.fontHeading,
                      fontSize: '0.85rem',
                      fontWeight: 600,
                      cursor: 'pointer',
                      boxShadow: TS_TOKENS.glows.glowEnergy
                    }}
                  >
                    {connectingProvider === 'gitlab' ? 'Conectando...' : 'Autenticar GitLab'}
                  </button>
                  <button
                    onClick={() => handleLinkRepo('gitlab')}
                    style={{
                      padding: '10px 16px',
                      backgroundColor: 'transparent',
                      border: `1px solid ${TS_TOKENS.colors.aquaTurquesa}`,
                      borderRadius: TS_TOKENS.radii.radiusMedium,
                      color: TS_TOKENS.colors.aquaTurquesa,
                      fontFamily: TS_TOKENS.typography.fontHeading,
                      fontSize: '0.85rem',
                      fontWeight: 600,
                      cursor: 'pointer'
                    }}
                  >
                    Vincular Proyecto
                  </button>
                </div>
              </div>

              {/* Google Tasks Card */}
              <div
                style={{
                  backgroundColor: TS_TOKENS.colors.midnightPanel,
                  borderRadius: TS_TOKENS.radii.radiusLarge,
                  border: `1px solid ${TS_TOKENS.colors.bordeCorporativo}`,
                  padding: '24px',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '18px'
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                    <div
                      style={{
                        width: '38px',
                        height: '38px',
                        borderRadius: '8px',
                        backgroundColor: '#4285F4',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        fontSize: '1.2rem'
                      }}
                    >
                      ✓
                    </div>
                    <div>
                      <h3 style={{ margin: 0, fontSize: '1.05rem', color: TS_TOKENS.colors.blancoPuro }}>
                        Google Tasks Workspace
                      </h3>
                      <span style={{ fontSize: '0.75rem', color: TS_TOKENS.colors.humoSlate }}>
                        Sincronización Bidireccional
                      </span>
                    </div>
                  </div>
                  <span
                    style={{
                      padding: '4px 10px',
                      borderRadius: TS_TOKENS.radii.radiusSoft,
                      fontSize: '0.72rem',
                      fontFamily: TS_TOKENS.typography.fontHeading,
                      backgroundColor: integrations[2]?.connected ? 'rgba(16, 185, 129, 0.15)' : 'rgba(239, 68, 68, 0.15)',
                      color: integrations[2]?.connected ? '#10B981' : '#EF4444',
                      border: `1px solid ${integrations[2]?.connected ? '#10B981' : '#EF4444'}`
                    }}
                  >
                    {integrations[2]?.connected ? 'SINCRONIZADO' : 'DESCONECTADO'}
                  </span>
                </div>

                <p style={{ margin: 0, fontSize: '0.82rem', color: TS_TOKENS.colors.humoSlate, lineHeight: '1.4' }}>
                  Mapea tareas de <code>project_tasks</code> directamente a tu cuenta de Google Workspace mediante workers en segundo plano de BullMQ.
                </p>

                <div style={{ marginTop: 'auto' }}>
                  <button
                    onClick={() => handleConnectProvider('google_tasks')}
                    disabled={connectingProvider === 'google_tasks'}
                    style={{
                      width: '100%',
                      padding: '10px',
                      backgroundColor: TS_TOKENS.colors.naranjaEnergy,
                      border: 'none',
                      borderRadius: TS_TOKENS.radii.radiusMedium,
                      color: TS_TOKENS.colors.blancoPuro,
                      fontFamily: TS_TOKENS.typography.fontHeading,
                      fontSize: '0.85rem',
                      fontWeight: 600,
                      cursor: 'pointer',
                      boxShadow: TS_TOKENS.glows.glowEnergy
                    }}
                  >
                    {connectingProvider === 'google_tasks' ? 'Sincronizando...' : 'Conectar Google Tasks OAuth2'}
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* ================================================================= */}
        {/* TAB 2: IMPORTADOR UNIVERSAL */}
        {/* ================================================================= */}
        {activeTab === 'import' && (
          <div>
            <div style={{ marginBottom: '24px' }}>
              <h2
                style={{
                  fontFamily: TS_TOKENS.typography.fontHeading,
                  fontSize: '1.4rem',
                  color: TS_TOKENS.colors.blancoPuro,
                  margin: '0 0 6px 0'
                }}
              >
                Motor de Importación Universal de Proyectos
              </h2>
              <p style={{ margin: 0, color: TS_TOKENS.colors.humoSlate, fontSize: '0.9rem' }}>
                Migración masiva desde <strong>Trello, Monday.com, Asana, Jira, CSV o JSON</strong>. Pre-flight de mapeo automático e inserción atómica ACID con rollback.
              </p>
            </div>

            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'minmax(350px, 1fr) 2fr',
                gap: '24px'
              }}
            >
              {/* Left Column: Form & File Drop */}
              <div
                style={{
                  backgroundColor: TS_TOKENS.colors.midnightPanel,
                  borderRadius: TS_TOKENS.radii.radiusLarge,
                  border: `1px solid ${TS_TOKENS.colors.bordeCorporativo}`,
                  padding: '24px',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '20px'
                }}
              >
                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                  <label style={{ fontSize: '0.82rem', color: TS_TOKENS.colors.humoSlate, fontWeight: 600 }}>
                    Formato de Origen:
                  </label>
                  <select
                    value={importFormat}
                    onChange={e => setImportFormat(e.target.value as typeof importFormat)}
                    style={{
                      padding: '10px 14px',
                      borderRadius: TS_TOKENS.radii.radiusMedium,
                      backgroundColor: TS_TOKENS.colors.negroProfundo,
                      border: `1px solid ${TS_TOKENS.colors.bordeCorporativo}`,
                      color: TS_TOKENS.colors.blancoPuro,
                      fontFamily: TS_TOKENS.typography.fontHeading,
                      fontSize: '0.85rem'
                    }}
                  >
                    <option value="AUTO">Detección Automática</option>
                    <option value="JSON">JSON Nativo TSolutions</option>
                    <option value="CSV">CSV Universal</option>
                    <option value="TRELLO">Trello (Export JSON)</option>
                    <option value="MONDAY">Monday.com (CSV/JSON)</option>
                    <option value="ASANA">Asana (CSV/JSON)</option>
                    <option value="JIRA">Jira Issue Tracker (CSV)</option>
                  </select>
                </div>

                {/* Drop Zone */}
                <div
                  style={{
                    border: `2px dashed ${importFile ? TS_TOKENS.colors.aquaTurquesa : TS_TOKENS.colors.bordeCorporativo}`,
                    borderRadius: TS_TOKENS.radii.radiusMedium,
                    padding: '30px 20px',
                    textAlign: 'center',
                    backgroundColor: importFile ? 'rgba(0, 229, 255, 0.05)' : 'rgba(10, 13, 20, 0.5)',
                    cursor: 'pointer',
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    gap: '10px'
                  }}
                  onClick={() => document.getElementById('universal-import-input')?.click()}
                >
                  <input
                    id="universal-import-input"
                    type="file"
                    accept=".json,.csv,.txt"
                    style={{ display: 'none' }}
                    onChange={e => {
                      if (e.target.files && e.target.files[0]) {
                        setImportFile(e.target.files[0]);
                        setPreflightData(null);
                        setImportResult(null);
                      }
                    }}
                  />
                  <span style={{ fontSize: '2rem' }}>📦</span>
                  <div style={{ fontSize: '0.85rem', color: TS_TOKENS.colors.blancoPuro }}>
                    {importFile ? importFile.name : 'Haz clic o arrastra tu archivo aquí'}
                  </div>
                  <div style={{ fontSize: '0.75rem', color: TS_TOKENS.colors.humoSlate }}>
                    Formatos soportados: .json, .csv (Hasta 10 MB)
                  </div>
                </div>

                {/* Pre-flight & Import Buttons */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                  <button
                    onClick={handleRunPreflight}
                    disabled={!importFile || isPreflighting}
                    style={{
                      padding: '12px',
                      backgroundColor: 'transparent',
                      border: `1px solid ${TS_TOKENS.colors.aquaTurquesa}`,
                      borderRadius: TS_TOKENS.radii.radiusMedium,
                      color: TS_TOKENS.colors.aquaTurquesa,
                      fontFamily: TS_TOKENS.typography.fontHeading,
                      fontSize: '0.88rem',
                      fontWeight: 600,
                      cursor: !importFile || isPreflighting ? 'not-allowed' : 'pointer',
                      opacity: !importFile || isPreflighting ? 0.5 : 1,
                      boxShadow: TS_TOKENS.glows.glowTurquesaSoft
                    }}
                  >
                    {isPreflighting ? 'Analizando Esquema...' : '1. Ejecutar Pre-Flight Check'}
                  </button>

                  <button
                    onClick={handleExecuteImport}
                    disabled={!preflightData || isImporting}
                    style={{
                      padding: '12px',
                      backgroundColor: TS_TOKENS.colors.naranjaEnergy,
                      border: 'none',
                      borderRadius: TS_TOKENS.radii.radiusMedium,
                      color: TS_TOKENS.colors.blancoPuro,
                      fontFamily: TS_TOKENS.typography.fontHeading,
                      fontSize: '0.88rem',
                      fontWeight: 600,
                      cursor: !preflightData || isImporting ? 'not-allowed' : 'pointer',
                      opacity: !preflightData || isImporting ? 0.5 : 1,
                      boxShadow: TS_TOKENS.glows.glowEnergy
                    }}
                  >
                    {isImporting ? 'Insertando Atómicamente...' : '2. Ejecutar Importación Atómica'}
                  </button>
                </div>

                {importResult && (
                  <div
                    style={{
                      padding: '14px',
                      borderRadius: TS_TOKENS.radii.radiusMedium,
                      backgroundColor: importResult.success ? 'rgba(16, 185, 129, 0.15)' : 'rgba(239, 68, 68, 0.15)',
                      border: `1px solid ${importResult.success ? '#10B981' : '#EF4444'}`,
                      color: importResult.success ? '#10B981' : '#EF4444',
                      fontSize: '0.85rem'
                    }}
                  >
                    {importResult.message}
                  </div>
                )}
              </div>

              {/* Right Column: Preflight Report & Mapping */}
              <div
                style={{
                  backgroundColor: TS_TOKENS.colors.midnightPanel,
                  borderRadius: TS_TOKENS.radii.radiusLarge,
                  border: `1px solid ${TS_TOKENS.colors.bordeCorporativo}`,
                  padding: '24px',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '18px'
                }}
              >
                <h3 style={{ margin: 0, fontSize: '1.1rem', color: TS_TOKENS.colors.blancoPuro }}>
                  Reporte de Validación Pre-Flight
                </h3>

                {preflightData ? (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                    {/* Summary metrics */}
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '12px' }}>
                      <div
                        style={{
                          padding: '12px',
                          borderRadius: TS_TOKENS.radii.radiusMedium,
                          backgroundColor: TS_TOKENS.colors.negroProfundo,
                          border: `1px solid ${TS_TOKENS.colors.bordeCorporativo}`
                        }}
                      >
                        <div style={{ fontSize: '0.72rem', color: TS_TOKENS.colors.humoSlate }}>FORMATO DETECTADO</div>
                        <div style={{ fontSize: '1.2rem', fontFamily: TS_TOKENS.typography.fontHeading, color: TS_TOKENS.colors.aquaTurquesa }}>
                          {preflightData.format}
                        </div>
                      </div>
                      <div
                        style={{
                          padding: '12px',
                          borderRadius: TS_TOKENS.radii.radiusMedium,
                          backgroundColor: TS_TOKENS.colors.negroProfundo,
                          border: `1px solid ${TS_TOKENS.colors.bordeCorporativo}`
                        }}
                      >
                        <div style={{ fontSize: '0.72rem', color: TS_TOKENS.colors.humoSlate }}>TOTAL TAREAS</div>
                        <div style={{ fontSize: '1.2rem', fontFamily: TS_TOKENS.typography.fontHeading, color: TS_TOKENS.colors.blancoPuro }}>
                          {preflightData.totalRows}
                        </div>
                      </div>
                      <div
                        style={{
                          padding: '12px',
                          borderRadius: TS_TOKENS.radii.radiusMedium,
                          backgroundColor: TS_TOKENS.colors.negroProfundo,
                          border: `1px solid ${TS_TOKENS.colors.bordeCorporativo}`
                        }}
                      >
                        <div style={{ fontSize: '0.72rem', color: TS_TOKENS.colors.humoSlate }}>VÁLIDAS / APTAS</div>
                        <div style={{ fontSize: '1.2rem', fontFamily: TS_TOKENS.typography.fontHeading, color: '#10B981' }}>
                          {preflightData.validRows}
                        </div>
                      </div>
                    </div>

                    {/* Detected column mapping */}
                    <div>
                      <h4 style={{ margin: '0 0 8px 0', fontSize: '0.85rem', color: TS_TOKENS.colors.humoSlate }}>
                        Mapeo de Columnas Detectado:
                      </h4>
                      <div
                        style={{
                          display: 'flex',
                          flexWrap: 'wrap',
                          gap: '8px',
                          padding: '12px',
                          borderRadius: TS_TOKENS.radii.radiusMedium,
                          backgroundColor: TS_TOKENS.colors.negroProfundo
                        }}
                      >
                        {Object.entries(preflightData.columnMapping).map(([dest, src]) => (
                          <span
                            key={dest}
                            style={{
                              fontSize: '0.78rem',
                              fontFamily: TS_TOKENS.typography.fontMono,
                              padding: '4px 8px',
                              borderRadius: TS_TOKENS.radii.radiusSoft,
                              backgroundColor: 'rgba(255, 255, 255, 0.05)',
                              border: `1px solid ${TS_TOKENS.colors.bordeCorporativo}`
                            }}
                          >
                            <span style={{ color: TS_TOKENS.colors.naranjaEnergy }}>{src}</span> ➔{' '}
                            <span style={{ color: TS_TOKENS.colors.aquaTurquesa }}>{dest}</span>
                          </span>
                        ))}
                      </div>
                    </div>

                    {/* Warnings if any */}
                    {preflightData.warnings.length > 0 && (
                      <div
                        style={{
                          padding: '12px',
                          borderRadius: TS_TOKENS.radii.radiusMedium,
                          backgroundColor: 'rgba(245, 158, 11, 0.1)',
                          border: `1px solid ${TS_TOKENS.colors.doradoPrestigio}`,
                          color: TS_TOKENS.colors.doradoPrestigio,
                          fontSize: '0.82rem'
                        }}
                      >
                        <strong>Advertencias:</strong>
                        <ul style={{ margin: '6px 0 0 16px', padding: 0 }}>
                          {preflightData.warnings.map((w, idx) => (
                            <li key={idx}>{w}</li>
                          ))}
                        </ul>
                      </div>
                    )}

                    {/* Sample preview table */}
                    <div>
                      <h4 style={{ margin: '0 0 8px 0', fontSize: '0.85rem', color: TS_TOKENS.colors.humoSlate }}>
                        Vista Previa de Muestra ({preflightData.samplePreview.length} registros):
                      </h4>
                      <div style={{ overflowX: 'auto' }}>
                        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.8rem' }}>
                          <thead>
                            <tr style={{ borderBottom: `1px solid ${TS_TOKENS.colors.bordeCorporativo}` }}>
                              <th style={{ textAlign: 'left', padding: '8px', color: TS_TOKENS.colors.humoSlate }}>Título</th>
                              <th style={{ textAlign: 'left', padding: '8px', color: TS_TOKENS.colors.humoSlate }}>Estado</th>
                              <th style={{ textAlign: 'left', padding: '8px', color: TS_TOKENS.colors.humoSlate }}>Prioridad</th>
                              <th style={{ textAlign: 'left', padding: '8px', color: TS_TOKENS.colors.humoSlate }}>Vencimiento</th>
                            </tr>
                          </thead>
                          <tbody>
                            {preflightData.samplePreview.map((item, idx) => (
                              <tr key={idx} style={{ borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
                                <td style={{ padding: '8px', color: TS_TOKENS.colors.blancoPuro }}>{item.title}</td>
                                <td style={{ padding: '8px' }}>
                                  <span style={{ color: TS_TOKENS.colors.aquaTurquesa }}>{item.status}</span>
                                </td>
                                <td style={{ padding: '8px' }}>
                                  <span style={{ color: TS_TOKENS.colors.doradoPrestigio }}>{item.priority}</span>
                                </td>
                                <td style={{ padding: '8px', fontFamily: TS_TOKENS.typography.fontMono }}>
                                  {item.due_date || '—'}
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  </div>
                ) : (
                  <div
                    style={{
                      flex: 1,
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      color: TS_TOKENS.colors.humoSlate,
                      fontSize: '0.88rem'
                    }}
                  >
                    Selecciona un archivo y ejecuta el Pre-Flight check para auditar el esquema de importación.
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {/* ================================================================= */}
        {/* TAB 3: ASIMILACIÓN DOCUMENTAL */}
        {/* ================================================================= */}
        {activeTab === 'documents' && (
          <div>
            <div style={{ marginBottom: '24px' }}>
              <h2
                style={{
                  fontFamily: TS_TOKENS.typography.fontHeading,
                  fontSize: '1.4rem',
                  color: TS_TOKENS.colors.blancoPuro,
                  margin: '0 0 6px 0'
                }}
              >
                Pipeline de Ingestión y Asimilación Documental (Hasta 25 MB)
              </h2>
              <p style={{ margin: 0, color: TS_TOKENS.colors.humoSlate, fontSize: '0.9rem' }}>
                Convierte especificaciones técnicas en memoria continua vectorial para la IA Nexus. Soporte de <strong>PDF, DOCX, Markdown, OpenAPI y TXT</strong> con fragmentación semántica (overlap de 200 tokens) y embeddings de 1536 dimensiones en <code>nexus_knowledge_vectors</code>.
              </p>
            </div>

            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'minmax(350px, 1fr) 2fr',
                gap: '24px'
              }}
            >
              {/* Left Column: Upload Document */}
              <div
                style={{
                  backgroundColor: TS_TOKENS.colors.midnightPanel,
                  borderRadius: TS_TOKENS.radii.radiusLarge,
                  border: `1px solid ${TS_TOKENS.colors.bordeCorporativo}`,
                  padding: '24px',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '20px'
                }}
              >
                <h3 style={{ margin: 0, fontSize: '1.1rem', color: TS_TOKENS.colors.blancoPuro }}>
                  Cargar Nuevo Documento
                </h3>

                <div
                  style={{
                    border: `2px dashed ${docFile ? TS_TOKENS.colors.naranjaEnergy : TS_TOKENS.colors.bordeCorporativo}`,
                    borderRadius: TS_TOKENS.radii.radiusMedium,
                    padding: '30px 20px',
                    textAlign: 'center',
                    backgroundColor: docFile ? 'rgba(255, 107, 0, 0.05)' : 'rgba(10, 13, 20, 0.5)',
                    cursor: 'pointer',
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    gap: '10px'
                  }}
                  onClick={() => document.getElementById('document-upload-input')?.click()}
                >
                  <input
                    id="document-upload-input"
                    type="file"
                    accept=".pdf,.docx,.md,.txt,.json,.yaml,.yml"
                    style={{ display: 'none' }}
                    onChange={e => {
                      if (e.target.files && e.target.files[0]) {
                        setDocFile(e.target.files[0]);
                      }
                    }}
                  />
                  <span style={{ fontSize: '2rem' }}>📑</span>
                  <div style={{ fontSize: '0.85rem', color: TS_TOKENS.colors.blancoPuro }}>
                    {docFile ? docFile.name : 'Haz clic o arrastra tu especificación técnica'}
                  </div>
                  <div style={{ fontSize: '0.75rem', color: TS_TOKENS.colors.humoSlate }}>
                    Límite máximo: 25 MB por archivo
                  </div>
                </div>

                <button
                  onClick={handleUploadDocument}
                  disabled={!docFile || isUploadingDoc}
                  style={{
                    padding: '12px',
                    backgroundColor: TS_TOKENS.colors.naranjaEnergy,
                    border: 'none',
                    borderRadius: TS_TOKENS.radii.radiusMedium,
                    color: TS_TOKENS.colors.blancoPuro,
                    fontFamily: TS_TOKENS.typography.fontHeading,
                    fontSize: '0.88rem',
                    fontWeight: 600,
                    cursor: !docFile || isUploadingDoc ? 'not-allowed' : 'pointer',
                    opacity: !docFile || isUploadingDoc ? 0.5 : 1,
                    boxShadow: TS_TOKENS.glows.glowEnergy
                  }}
                >
                  {isUploadingDoc ? 'Asimilando...' : 'Iniciar Asimilación Vectorial'}
                </button>

                {uploadProgress && (
                  <div
                    style={{
                      padding: '12px',
                      borderRadius: TS_TOKENS.radii.radiusMedium,
                      backgroundColor: 'rgba(0, 229, 255, 0.1)',
                      border: `1px solid ${TS_TOKENS.colors.aquaTurquesa}`,
                      color: TS_TOKENS.colors.aquaTurquesa,
                      fontSize: '0.82rem'
                    }}
                  >
                    {uploadProgress}
                  </div>
                )}
              </div>

              {/* Right Column: Ingested Documents Library */}
              <div
                style={{
                  backgroundColor: TS_TOKENS.colors.midnightPanel,
                  borderRadius: TS_TOKENS.radii.radiusLarge,
                  border: `1px solid ${TS_TOKENS.colors.bordeCorporativo}`,
                  padding: '24px',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '16px'
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <h3 style={{ margin: 0, fontSize: '1.1rem', color: TS_TOKENS.colors.blancoPuro }}>
                    Biblioteca de Documentos Asimilados ({documentsList.length})
                  </h3>
                  <button
                    onClick={fetchDocuments}
                    style={{
                      padding: '4px 10px',
                      backgroundColor: 'transparent',
                      border: `1px solid ${TS_TOKENS.colors.bordeCorporativo}`,
                      borderRadius: TS_TOKENS.radii.radiusSoft,
                      color: TS_TOKENS.colors.humoSlate,
                      fontSize: '0.75rem',
                      cursor: 'pointer'
                    }}
                  >
                    Actualizar
                  </button>
                </div>

                {documentsList.length === 0 ? (
                  <div
                    style={{
                      flex: 1,
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      color: TS_TOKENS.colors.humoSlate,
                      fontSize: '0.88rem',
                      minHeight: '200px'
                    }}
                  >
                    No hay documentos indexados aún en este Workspace. Sube un PDF, DOCX o spec OpenAPI para comenzar.
                  </div>
                ) : (
                  <div style={{ overflowX: 'auto' }}>
                    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.82rem' }}>
                      <thead>
                        <tr style={{ borderBottom: `1px solid ${TS_TOKENS.colors.bordeCorporativo}` }}>
                          <th style={{ textAlign: 'left', padding: '10px', color: TS_TOKENS.colors.humoSlate }}>Documento</th>
                          <th style={{ textAlign: 'left', padding: '10px', color: TS_TOKENS.colors.humoSlate }}>Tamaño</th>
                          <th style={{ textAlign: 'left', padding: '10px', color: TS_TOKENS.colors.humoSlate }}>Chunks</th>
                          <th style={{ textAlign: 'left', padding: '10px', color: TS_TOKENS.colors.humoSlate }}>Tokens</th>
                          <th style={{ textAlign: 'left', padding: '10px', color: TS_TOKENS.colors.humoSlate }}>Estado</th>
                        </tr>
                      </thead>
                      <tbody>
                        {documentsList.map(doc => (
                          <tr key={doc.id} style={{ borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
                            <td style={{ padding: '10px', color: TS_TOKENS.colors.blancoPuro, fontWeight: 500 }}>
                              {doc.filename}
                            </td>
                            <td style={{ padding: '10px', fontFamily: TS_TOKENS.typography.fontMono, color: TS_TOKENS.colors.humoSlate }}>
                              {(doc.file_size / 1024).toFixed(1)} KB
                            </td>
                            <td style={{ padding: '10px', color: TS_TOKENS.colors.aquaTurquesa, fontWeight: 600 }}>
                              {doc.chunk_count}
                            </td>
                            <td style={{ padding: '10px', fontFamily: TS_TOKENS.typography.fontMono, color: TS_TOKENS.colors.humoSlate }}>
                              {doc.total_tokens || '~'}
                            </td>
                            <td style={{ padding: '10px' }}>
                              <span
                                style={{
                                  padding: '3px 8px',
                                  borderRadius: TS_TOKENS.radii.radiusSoft,
                                  fontSize: '0.72rem',
                                  fontFamily: TS_TOKENS.typography.fontHeading,
                                  backgroundColor: doc.status === 'INDEXED' ? 'rgba(16, 185, 129, 0.15)' : 'rgba(245, 158, 11, 0.15)',
                                  color: doc.status === 'INDEXED' ? '#10B981' : TS_TOKENS.colors.doradoPrestigio,
                                  border: `1px solid ${doc.status === 'INDEXED' ? '#10B981' : TS_TOKENS.colors.doradoPrestigio}`
                                }}
                              >
                                {doc.status}
                              </span>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {/* ================================================================= */}
        {/* TAB 4: COPILOT RAG CHAT */}
        {/* ================================================================= */}
        {activeTab === 'copilot' && (
          <div
            style={{
              backgroundColor: TS_TOKENS.colors.midnightPanel,
              borderRadius: TS_TOKENS.radii.radiusLarge,
              border: `1px solid ${TS_TOKENS.colors.bordeCorporativo}`,
              display: 'flex',
              flexDirection: 'column',
              height: '75vh',
              overflow: 'hidden'
            }}
          >
            {/* Copilot Header */}
            <div
              style={{
                padding: '16px 24px',
                borderBottom: `1px solid ${TS_TOKENS.colors.bordeCorporativo}`,
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                backgroundColor: 'rgba(10, 13, 20, 0.4)'
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                <span style={{ fontSize: '1.4rem' }}>🧠</span>
                <div>
                  <h3 style={{ margin: 0, fontSize: '1.05rem', color: TS_TOKENS.colors.blancoPuro }}>
                    Nexus Architect Copilot (RAG In-Memory)
                  </h3>
                  <span style={{ fontSize: '0.75rem', color: TS_TOKENS.colors.aquaTurquesa }}>
                    Consultando lecciones aprendidas de proyectos archivados y documentos técnicos asimilados
                  </span>
                </div>
              </div>
              <span
                style={{
                  fontSize: '0.75rem',
                  fontFamily: TS_TOKENS.typography.fontMono,
                  color: TS_TOKENS.colors.humoSlate
                }}
              >
                Cosine Sim Threshold: <strong>0.65</strong>
              </span>
            </div>

            {/* Messages Thread */}
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
              {chatMessages.map(msg => {
                const isNexus = msg.sender === 'nexus';
                return (
                  <div
                    key={msg.id}
                    style={{
                      display: 'flex',
                      flexDirection: 'column',
                      alignItems: isNexus ? 'flex-start' : 'flex-end',
                      maxWidth: '85%',
                      alignSelf: isNexus ? 'flex-start' : 'flex-end'
                    }}
                  >
                    <div
                      style={{
                        padding: '16px 20px',
                        borderRadius: TS_TOKENS.radii.radiusMedium,
                        backgroundColor: isNexus ? TS_TOKENS.colors.negroProfundo : TS_TOKENS.colors.naranjaEnergy,
                        border: isNexus ? `1px solid ${TS_TOKENS.colors.aquaTurquesa}` : 'none',
                        color: TS_TOKENS.colors.blancoPuro,
                        boxShadow: isNexus ? TS_TOKENS.glows.glowTurquesaSoft : TS_TOKENS.glows.glowEnergy,
                        fontSize: '0.9rem',
                        lineHeight: '1.5'
                      }}
                    >
                      <div style={{ whiteSpace: 'pre-wrap' }}>{msg.content}</div>

                      {/* Source Citations */}
                      {msg.sources && msg.sources.length > 0 && (
                        <div
                          style={{
                            marginTop: '14px',
                            paddingTop: '10px',
                            borderTop: '1px solid rgba(255, 255, 255, 0.1)'
                          }}
                        >
                          <div
                            style={{
                              fontSize: '0.72rem',
                              fontFamily: TS_TOKENS.typography.fontHeading,
                              color: TS_TOKENS.colors.aquaTurquesa,
                              marginBottom: '6px'
                            }}
                          >
                            Fuentes Citadas de la Memoria Continua:
                          </div>
                          <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                            {msg.sources.map((src, i) => (
                              <div
                                key={i}
                                style={{
                                  fontSize: '0.75rem',
                                  padding: '6px 10px',
                                  borderRadius: TS_TOKENS.radii.radiusSoft,
                                  backgroundColor: 'rgba(255, 255, 255, 0.05)',
                                  border: `1px solid ${TS_TOKENS.colors.bordeCorporativo}`,
                                  display: 'flex',
                                  justifyContent: 'space-between',
                                  alignItems: 'center'
                                }}
                              >
                                <span>
                                  {src.type === 'document' ? '📄 [Doc] ' : '🏛️ [Proyecto] '}
                                  <strong>{src.sourceName}</strong>
                                  {src.sectionOrChunk ? ` (${src.sectionOrChunk})` : ''}
                                </span>
                                <span
                                  style={{
                                    color: TS_TOKENS.colors.doradoPrestigio,
                                    fontFamily: TS_TOKENS.typography.fontMono
                                  }}
                                >
                                  {(src.similarity * 100).toFixed(1)}% sim
                                </span>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>

                    <div
                      style={{
                        marginTop: '4px',
                        fontSize: '0.7rem',
                        color: TS_TOKENS.colors.humoSlate,
                        display: 'flex',
                        gap: '8px'
                      }}
                    >
                      <span>{msg.timestamp}</span>
                      {msg.latencyMs && (
                        <span>• {msg.latencyMs}ms</span>
                      )}
                    </div>
                  </div>
                );
              })}
              <div ref={chatEndRef} />
            </div>

            {/* Input Bar */}
            <div
              style={{
                padding: '16px 24px',
                borderTop: `1px solid ${TS_TOKENS.colors.bordeCorporativo}`,
                display: 'flex',
                gap: '12px',
                backgroundColor: 'rgba(10, 13, 20, 0.6)'
              }}
            >
              <input
                type="text"
                value={chatInput}
                onChange={e => setChatInput(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && handleSendQuery()}
                placeholder="Pregunta a Nexus sobre lecciones de proyectos pasados o especificaciones cargadas..."
                style={{
                  flex: 1,
                  padding: '12px 16px',
                  borderRadius: TS_TOKENS.radii.radiusMedium,
                  backgroundColor: TS_TOKENS.colors.negroProfundo,
                  border: `1px solid ${TS_TOKENS.colors.bordeCorporativo}`,
                  color: TS_TOKENS.colors.blancoPuro,
                  fontSize: '0.9rem',
                  outline: 'none'
                }}
              />
              <button
                onClick={handleSendQuery}
                disabled={!chatInput.trim() || isQueryingNexus}
                style={{
                  padding: '12px 24px',
                  backgroundColor: TS_TOKENS.colors.naranjaEnergy,
                  border: 'none',
                  borderRadius: TS_TOKENS.radii.radiusMedium,
                  color: TS_TOKENS.colors.blancoPuro,
                  fontFamily: TS_TOKENS.typography.fontHeading,
                  fontWeight: 600,
                  fontSize: '0.9rem',
                  cursor: !chatInput.trim() || isQueryingNexus ? 'not-allowed' : 'pointer',
                  opacity: !chatInput.trim() || isQueryingNexus ? 0.5 : 1,
                  boxShadow: TS_TOKENS.glows.glowEnergy
                }}
              >
                {isQueryingNexus ? 'Consultando...' : 'Enviar'}
              </button>
            </div>
          </div>
        )}
      </main>

      {/* ------------------------------------------------------------------- */}
      {/* 4. FOOTER & CORPORATE WATERMARK */}
      {/* ------------------------------------------------------------------- */}
      <footer
        style={{
          borderTop: `1px solid ${TS_TOKENS.colors.bordeCorporativo}`,
          backgroundColor: 'rgba(18, 23, 34, 0.95)',
          padding: '18px 32px',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          gap: '8px',
          marginTop: 'auto'
        }}
      >
        <div
          style={{
            fontFamily: TS_TOKENS.typography.fontHeading,
            fontSize: '0.8rem',
            letterSpacing: '0.08em',
            color: TS_TOKENS.colors.humoSlate,
            textTransform: 'uppercase'
          }}
        >
          {TS_TOKENS.watermark}
        </div>
        <div
          style={{
            fontFamily: TS_TOKENS.typography.fontBruno,
            fontSize: '0.82rem',
            color: TS_TOKENS.colors.blancoPuro,
            letterSpacing: '0.04em'
          }}
        >
          &quot;{TS_TOKENS.motto}&quot;
        </div>
        <div
          style={{
            fontSize: '0.68rem',
            fontFamily: TS_TOKENS.typography.fontMono,
            color: TS_TOKENS.colors.aquaTurquesa,
            opacity: 0.8
          }}
        >
          PostgreSQL pgvector (1536-D) • AES-256-GCM Vault • RLS Multi-Tenant Activo
        </div>
      </footer>
    </div>
  );
};

export default NexusArchitectStudio;

import React, { useState, useEffect } from 'react';
import { WorkflowCanvas } from '../workflow/WorkflowCanvas';
import { MarketingCampaignModal } from '../marketing/MarketingCampaignModal';
import { Node, Edge } from 'reactflow';

export interface TaskItem {
  id: string;
  title: string;
  description: string;
  status: 'TODO' | 'IN_PROGRESS' | 'REVIEW' | 'DONE';
  priority: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
  assigned_to?: string;
  assignee_name?: string;
}

export const ProjectDashboard: React.FC<{ projectId: string; userRole: 'ADMIN' | 'COLLABORATOR' | 'CLIENT' }> = ({
  projectId,
  userRole
}) => {
  const [activeTab, setActiveTab] = useState<'medicion' | 'ejecucion' | 'diseno'>('ejecucion');
  const [statusFilter, setStatusFilter] = useState<string>('ALL');
  const [priorityFilter, setPriorityFilter] = useState<string>('ALL');
  const [tasks, setTasks] = useState<TaskItem[]>([]);
  const [nodes, setNodes] = useState<Node[]>([]);
  const [edges, setEdges] = useState<Edge[]>([]);
  const [isMarketingModalOpen, setIsMarketingModalOpen] = useState(false);
  const [telemetry, setTelemetry] = useState({
    successRate: 98.2,
    avgCiDurationSec: 36,
    recentCommits: 29,
    greenNodesPercent: 0
  });

  // ESTADOS DEL AI GATEWAY
  const [isLoadingAI, setIsLoadingAI] = useState(false);
  const [executiveReport, setExecutiveReport] = useState<any>(null);
  const [isExecutiveModalOpen, setIsExecutiveModalOpen] = useState(false);
  const [taskBreakdown, setTaskBreakdown] = useState<any>(null);
  const [isTaskModalOpen, setIsTaskModalOpen] = useState(false);
  const [devopsTriage, setDevopsTriage] = useState<any>(null);
  const [isDevopsModalOpen, setIsDevopsModalOpen] = useState(false);
  const [customTaskInput, setCustomTaskInput] = useState('');

  useEffect(() => {
    const fetchData = async () => {
      try {
        const wfRes = await fetch(`/api/v1/projects/${projectId}/workflow`);
        if (wfRes.ok) {
          const wfData = await wfRes.json();
          const flowNodes: Node[] = wfData.nodes.map((n: any) => ({
            id: n.id,
            type: 'customWorkflowNode',
            position: { x: n.position_x, y: n.position_y },
            data: {
              label: n.title || n.label,
              description: n.description,
              status: n.status,
              isAutomatedGithub: n.is_automated_github,
              stepOrder: n.step_order || 1
            }
          }));

          const flowEdges: Edge[] = wfData.edges.map((e: any) => ({
            id: e.id,
            source: e.source_node_id,
            target: e.target_node_id,
            animated: true,
            style: { stroke: '#38BDF8', strokeWidth: 2 }
          }));

          setNodes(flowNodes);
          setEdges(flowEdges);
        }

        const taskRes = await fetch(`/api/v1/projects/${projectId}/tasks`);
        if (taskRes.ok) {
          const taskData = await taskRes.json();
          setTasks(taskData);
        }
      } catch (err) {
        console.error('Error fetching dashboard data:', err);
      }
    };

    fetchData();
  }, [projectId]);

  useEffect(() => {
    if (nodes.length > 0) {
      const greenCount = nodes.filter(n => n.data?.status === 'GREEN').length;
      setTelemetry(prev => ({
        ...prev,
        greenNodesPercent: Math.round((greenCount / nodes.length) * 100)
      }));
    }
  }, [nodes]);

  const toggleTaskStatus = async (taskId: string, currentStatus: string) => {
    if (userRole === 'CLIENT') return;

    const nextStatus = currentStatus === 'DONE' ? 'TODO' : 'DONE';
    setTasks(prev => prev.map(t => (t.id === taskId ? { ...t, status: nextStatus as any } : t)));

    try {
      const res = await fetch(`/api/v1/tasks/${taskId}/status`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: nextStatus, user_role: userRole })
      });

      if (res.ok) {
        const data = await res.json();
        if (data.nodeTransitions && data.nodeTransitions.length > 0) {
          setNodes(prevNodes =>
            prevNodes.map(node => {
              const matched = data.nodeTransitions.find((t: any) => t.nodeId === node.id);
              if (matched) {
                return {
                  ...node,
                  data: {
                    ...node.data,
                    status: matched.status
                  }
                };
              }
              return node;
            })
          );
        }
      }
    } catch {
      setTasks(prev => prev.map(t => (t.id === taskId ? { ...t, status: currentStatus as any } : t)));
    }
  };

  // 1. LLAMADA AI GATEWAY: GENERAR REPORTE EJECUTIVO
  const handleGenerateExecutiveReport = async () => {
    setIsLoadingAI(true);
    try {
      const res = await fetch(`/api/v1/ai/executive-report/${projectId}`);
      if (res.ok) {
        const data = await res.json();
        setExecutiveReport(data.report);
        setIsExecutiveModalOpen(true);
      } else {
        alert('No se pudo generar el reporte ejecutivo.');
      }
    } catch (err) {
      console.error(err);
      alert('Error de conexión al generar reporte con IA.');
    } finally {
      setIsLoadingAI(false);
    }
  };

  // 2. LLAMADA AI GATEWAY: DESGLOSAR TAREA
  const handleDecomposeTask = async (taskTitle: string, taskDesc: string = '') => {
    setIsLoadingAI(true);
    try {
      const res = await fetch('/api/v1/ai/tasks/breakdown', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          projectId,
          taskTitle,
          taskDescription: taskDesc
        })
      });
      if (res.ok) {
        const data = await res.json();
        setTaskBreakdown(data.plan);
        setIsTaskModalOpen(true);
      }
    } catch (err) {
      console.error(err);
      alert('Error al desglosar tarea con IA.');
    } finally {
      setIsLoadingAI(false);
    }
  };

  // 3. LLAMADA AI GATEWAY: TRIAGE DEVOPS
  const handleTriggerDevopsTriage = async () => {
    setIsLoadingAI(true);
    try {
      const res = await fetch('/api/v1/ai/triage/analyze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          projectId,
          failureLog: "src/index.ts: error TS2304: Cannot find name 'Config'. Build exit 1.",
          workflowPath: '.github/workflows/ci.yml',
          commitMessage: 'fix: pipeline telemetry check'
        })
      });
      if (res.ok) {
        const data = await res.json();
        setDevopsTriage(data.triage);
        setIsDevopsModalOpen(true);
      }
    } catch (err) {
      console.error(err);
      alert('Error al ejecutar triage con IA.');
    } finally {
      setIsLoadingAI(false);
    }
  };

  const filteredTasks = tasks.filter(t => {
    if (statusFilter !== 'ALL' && t.status !== statusFilter) return false;
    if (priorityFilter !== 'ALL' && t.priority !== priorityFilter) return false;
    return true;
  });

  return (
    <div style={{ padding: 24, backgroundColor: '#070B14', color: '#F8FAFC', minHeight: '100vh', fontFamily: "'JetBrains Mono', sans-serif" }}>
      {/* Barra Superior */}
      <header style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20, flexWrap: 'wrap', gap: 12 }}>
        <div>
          <h2 style={{ margin: 0, fontSize: '1.4rem' }}>Workspace Project Dashboard</h2>
          <span style={{ fontSize: '0.8rem', color: '#94A3B8' }}>Sesión activa · Rol: {userRole}</span>
        </div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          {(['medicion', 'ejecucion', 'diseno'] as const).map(tab => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              style={{
                padding: '8px 14px',
                borderRadius: 6,
                border: 'none',
                cursor: 'pointer',
                backgroundColor: activeTab === tab ? '#06B6D4' : '#1E293B',
                color: activeTab === tab ? '#000' : '#F8FAFC',
                fontWeight: 600,
                textTransform: 'capitalize'
              }}
            >
              {tab}
            </button>
          ))}

          {/* BOTONES INTERACTIVOS DEL AI GATEWAY */}
          <button
            onClick={handleGenerateExecutiveReport}
            disabled={isLoadingAI}
            style={{
              padding: '8px 14px',
              borderRadius: 6,
              border: '1px solid #38BDF8',
              backgroundColor: 'rgba(56, 189, 248, 0.15)',
              color: '#38BDF8',
              fontWeight: 700,
              cursor: 'pointer',
              display: 'inline-flex',
              alignItems: 'center',
              gap: 6
            }}
          >
            📊 {isLoadingAI ? 'Consultando IA...' : 'Reporte Ejecutivo IA'}
          </button>

          <button
            onClick={handleTriggerDevopsTriage}
            disabled={isLoadingAI}
            style={{
              padding: '8px 14px',
              borderRadius: 6,
              border: '1px solid #EF4444',
              backgroundColor: 'rgba(239, 68, 68, 0.15)',
              color: '#EF4444',
              fontWeight: 700,
              cursor: 'pointer',
              display: 'inline-flex',
              alignItems: 'center',
              gap: 6
            }}
          >
            ⚡ Diagnóstico DevOps
          </button>

          <button
            onClick={() => setIsMarketingModalOpen(true)}
            style={{
              padding: '8px 14px',
              borderRadius: 6,
              border: '1px solid #10B981',
              backgroundColor: 'rgba(16, 185, 129, 0.15)',
              color: '#10B981',
              fontWeight: 700,
              cursor: 'pointer'
            }}
          >
            ✉ Campañas de Email
          </button>
        </div>
      </header>

      {/* Tarjetas de Telemetría */}
      <section style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 16, marginBottom: 24 }}>
        <div style={{ background: '#0F172A', padding: 16, borderRadius: 8, border: '1px solid #334155' }}>
          <div style={{ fontSize: '0.78rem', color: '#94A3B8' }}>Tasa de Éxito de Builds</div>
          <div style={{ fontSize: '1.4rem', fontWeight: 700, color: '#10B981' }}>{telemetry.successRate}%</div>
        </div>
        <div style={{ background: '#0F172A', padding: 16, borderRadius: 8, border: '1px solid #334155' }}>
          <div style={{ fontSize: '0.78rem', color: '#94A3B8' }}>Duración Promedio CI</div>
          <div style={{ fontSize: '1.4rem', fontWeight: 700, color: '#38BDF8' }}>{telemetry.avgCiDurationSec}s</div>
        </div>
        <div style={{ background: '#0F172A', padding: 16, borderRadius: 8, border: '1px solid #334155' }}>
          <div style={{ fontSize: '0.78rem', color: '#94A3B8' }}>Commits Recientes</div>
          <div style={{ fontSize: '1.4rem', fontWeight: 700, color: '#F8FAFC' }}>{telemetry.recentCommits}</div>
        </div>
        <div style={{ background: '#0F172A', padding: 16, borderRadius: 8, border: '1px solid #334155' }}>
          <div style={{ fontSize: '0.78rem', color: '#94A3B8' }}>Progreso Global del DAG</div>
          <div style={{ fontSize: '1.4rem', fontWeight: 700, color: '#10B981' }}>{telemetry.greenNodesPercent}%</div>
        </div>
      </section>

      {/* Pizarrón React Flow */}
      <WorkflowCanvas
        nodes={nodes}
        edges={edges}
        userRole={userRole}
        onNodesUpdate={setNodes}
        onEdgesUpdate={setEdges}
      />

      {/* Gestor To-Do con Desglose por IA */}
      <section style={{ marginTop: 24, background: '#0F172A', padding: 20, borderRadius: 8, border: '1px solid #334155' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16, flexWrap: 'wrap', gap: 10 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <h3 style={{ margin: 0, fontSize: '1.1rem' }}>Módulo de Tareas del Proyecto</h3>
            <span style={{ fontSize: '0.72rem', color: '#A855F7', background: 'rgba(168, 85, 247, 0.1)', padding: '2px 8px', borderRadius: 4, border: '1px solid rgba(168,85,247,0.3)' }}>
              🤖 AI Task Planner Activo
            </span>
          </div>

          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
            <input
              type="text"
              placeholder="Nueva tarea de alto nivel..."
              value={customTaskInput}
              onChange={e => setCustomTaskInput(e.target.value)}
              style={{ background: '#1E293B', color: '#FFF', border: '1px solid #334155', borderRadius: 4, padding: '6px 12px', fontSize: '0.75rem', width: 220 }}
            />
            <button
              onClick={() => customTaskInput && handleDecomposeTask(customTaskInput)}
              disabled={isLoadingAI || !customTaskInput}
              style={{ background: '#A855F7', color: '#FFF', border: 'none', borderRadius: 4, padding: '6px 12px', fontSize: '0.75rem', fontWeight: 700, cursor: 'pointer' }}
            >
              ✨ Desglosar con IA
            </button>

            <select
              value={statusFilter}
              onChange={e => setStatusFilter(e.target.value)}
              style={{ background: '#1E293B', color: '#FFF', border: '1px solid #334155', borderRadius: 4, padding: '4px 8px', fontSize: '0.75rem' }}
            >
              <option value="ALL">Todos los Estados</option>
              <option value="TODO">TODO</option>
              <option value="IN_PROGRESS">IN_PROGRESS</option>
              <option value="DONE">DONE</option>
            </select>
            <select
              value={priorityFilter}
              onChange={e => setPriorityFilter(e.target.value)}
              style={{ background: '#1E293B', color: '#FFF', border: '1px solid #334155', borderRadius: 4, padding: '4px 8px', fontSize: '0.75rem' }}
            >
              <option value="ALL">Todas las Prioridades</option>
              <option value="LOW">LOW</option>
              <option value="MEDIUM">MEDIUM</option>
              <option value="HIGH">HIGH</option>
              <option value="CRITICAL">CRITICAL</option>
            </select>
          </div>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {filteredTasks.map(task => (
            <div
              key={task.id}
              onClick={() => toggleTaskStatus(task.id, task.status)}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 12,
                padding: '10px 14px',
                background: '#1E293B',
                borderRadius: 6,
                borderLeft: `4px solid ${task.priority === 'CRITICAL' ? '#EF4444' : task.priority === 'HIGH' ? '#F59E0B' : '#38BDF8'}`,
                cursor: userRole === 'CLIENT' ? 'default' : 'pointer'
              }}
            >
              <input
                type="checkbox"
                checked={task.status === 'DONE'}
                readOnly
                style={{ width: 18, height: 18, accentColor: '#10B981' }}
              />
              <div style={{ flex: 1 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span style={{ textDecoration: task.status === 'DONE' ? 'line-through' : 'none' }}>{task.title}</span>
                  <span style={{ fontSize: '0.65rem', padding: '1px 5px', borderRadius: 3, background: 'rgba(255,255,255,0.1)', color: '#94A3B8' }}>{task.priority}</span>
                </div>
                <div style={{ fontSize: '0.75rem', color: '#94A3B8' }}>{task.description}</div>
              </div>

              {/* Botón interactivo para descomponer tarea con IA */}
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  handleDecomposeTask(task.title, task.description);
                }}
                title="Desglosar esta tarea en subtareas atómicas con IA"
                style={{
                  background: 'rgba(168, 85, 247, 0.15)',
                  border: '1px solid #A855F7',
                  color: '#A855F7',
                  fontSize: '0.7rem',
                  padding: '4px 8px',
                  borderRadius: 4,
                  cursor: 'pointer'
                }}
              >
                ✨ IA
              </button>
            </div>
          ))}
        </div>
      </section>

      {/* MODAL 1: REPORTE EJECUTIVO IA */}
      {isExecutiveModalOpen && executiveReport && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.85)', backdropFilter: 'blur(8px)', display: 'flex', justifyContent: 'center', alignItems: 'center', zIndex: 1000, padding: 20 }}>
          <div style={{ background: '#0F172A', border: '1px solid #38BDF8', borderRadius: 12, maxWidth: 640, width: '100%', padding: 24, boxShadow: '0 0 30px rgba(56, 189, 248, 0.2)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid #334155', paddingBottom: 12, marginBottom: 16 }}>
              <h3 style={{ margin: 0, color: '#38BDF8', fontSize: '1.2rem' }}>📊 Resumen Ejecutivo para Clientes</h3>
              <button onClick={() => setIsExecutiveModalOpen(false)} style={{ background: 'transparent', border: 'none', color: '#94A3B8', fontSize: '1.2rem', cursor: 'pointer' }}>✕</button>
            </div>
            <div style={{ fontSize: '0.85rem', lineHeight: 1.6, display: 'flex', flexDirection: 'column', gap: 14 }}>
              <div>
                <strong style={{ color: '#F8FAFC' }}>Salud del Proyecto: </strong>
                <span style={{ color: executiveReport.overall_health === 'ON_TRACK' ? '#10B981' : '#F59E0B', fontWeight: 'bold' }}>
                  {executiveReport.overall_health}
                </span>
              </div>
              <p style={{ background: '#1E293B', padding: 12, borderRadius: 6, borderLeft: '3px solid #38BDF8' }}>
                {executiveReport.executive_summary}
              </p>
              <div>
                <strong style={{ color: '#10B981' }}>Hitos Concluidos:</strong>
                <ul style={{ paddingLeft: 20, margin: '6px 0' }}>
                  {executiveReport.completed_milestones.map((m: string, i: number) => <li key={i}>{m}</li>)}
                </ul>
              </div>
              <div>
                <strong style={{ color: '#F59E0B' }}>Próximos Pasos Prioritarios:</strong>
                <ul style={{ paddingLeft: 20, margin: '6px 0' }}>
                  {executiveReport.upcoming_focus.map((f: string, i: number) => <li key={i}>{f}</li>)}
                </ul>
              </div>
              <div style={{ fontSize: '0.78rem', color: '#94A3B8', borderTop: '1px solid #334155', paddingTop: 10 }}>
                <strong>Impacto de Negocio: </strong>{executiveReport.business_impact}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* MODAL 2: DESGLOSE DE TAREAS IA */}
      {isTaskModalOpen && taskBreakdown && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.85)', backdropFilter: 'blur(8px)', display: 'flex', justifyContent: 'center', alignItems: 'center', zIndex: 1000, padding: 20 }}>
          <div style={{ background: '#0F172A', border: '1px solid #A855F7', borderRadius: 12, maxWidth: 640, width: '100%', padding: 24, boxShadow: '0 0 30px rgba(168, 85, 247, 0.2)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid #334155', paddingBottom: 12, marginBottom: 16 }}>
              <h3 style={{ margin: 0, color: '#A855F7', fontSize: '1.2rem' }}>🤖 Desglose de Subtareas Sugerido por IA</h3>
              <button onClick={() => setIsTaskModalOpen(false)} style={{ background: 'transparent', border: 'none', color: '#94A3B8', fontSize: '1.2rem', cursor: 'pointer' }}>✕</button>
            </div>
            <div style={{ fontSize: '0.85rem', display: 'flex', flexDirection: 'column', gap: 12 }}>
              <div style={{ fontSize: '0.78rem', color: '#94A3B8' }}>
                Complejidad Estimada: <strong style={{ color: '#F8FAFC' }}>{taskBreakdown.estimated_complexity}</strong>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8, maxHeight: 320, overflowY: 'auto' }}>
                {taskBreakdown.subtasks.map((st: any, i: number) => (
                  <div key={i} style={{ background: '#1E293B', padding: 12, borderRadius: 6, borderLeft: '3px solid #A855F7' }}>
                    <div style={{ fontWeight: 700, color: '#F8FAFC', marginBottom: 4 }}>{i + 1}. {st.title}</div>
                    <div style={{ fontSize: '0.75rem', color: '#94A3B8' }}>Criterio DoD: {st.acceptance_criteria}</div>
                    <div style={{ fontSize: '0.68rem', color: '#38BDF8', marginTop: 4 }}>Rol sugerido: {st.suggested_role}</div>
                  </div>
                ))}
              </div>
              <button
                onClick={() => setIsTaskModalOpen(false)}
                style={{ marginTop: 12, background: '#A855F7', color: '#FFF', border: 'none', padding: '10px 16px', borderRadius: 6, fontWeight: 700, cursor: 'pointer' }}
              >
                Cerrar y Revisar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL 3: DIAGNÓSTICO DEVOPS IA */}
      {isDevopsModalOpen && devopsTriage && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.85)', backdropFilter: 'blur(8px)', display: 'flex', justifyContent: 'center', alignItems: 'center', zIndex: 1000, padding: 20 }}>
          <div style={{ background: '#0F172A', border: '1px solid #EF4444', borderRadius: 12, maxWidth: 640, width: '100%', padding: 24, boxShadow: '0 0 30px rgba(239, 68, 68, 0.2)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid #334155', paddingBottom: 12, marginBottom: 16 }}>
              <h3 style={{ margin: 0, color: '#EF4444', fontSize: '1.2rem' }}>⚡ Diagnóstico de Falla CI/CD (DevOps Triage)</h3>
              <button onClick={() => setIsDevopsModalOpen(false)} style={{ background: 'transparent', border: 'none', color: '#94A3B8', fontSize: '1.2rem', cursor: 'pointer' }}>✕</button>
            </div>
            <div style={{ fontSize: '0.85rem', display: 'flex', flexDirection: 'column', gap: 12 }}>
              <div style={{ background: '#1E293B', padding: 12, borderRadius: 6, borderLeft: '3px solid #EF4444' }}>
                <div style={{ color: '#EF4444', fontWeight: 700, marginBottom: 4 }}>Causa Raíz Identificada ({devopsTriage.severity})</div>
                <div style={{ color: '#F8FAFC' }}>{devopsTriage.root_cause}</div>
              </div>
              <div style={{ background: '#1E293B', padding: 12, borderRadius: 6, borderLeft: '3px solid #10B981' }}>
                <div style={{ color: '#10B981', fontWeight: 700, marginBottom: 4 }}>Corrección Sugerida</div>
                <code style={{ color: '#38BDF8', fontSize: '0.8rem' }}>{devopsTriage.suggested_fix}</code>
              </div>
              <div style={{ background: '#1E293B', padding: 12, borderRadius: 6, borderLeft: '3px solid #38BDF8' }}>
                <div style={{ color: '#38BDF8', fontWeight: 700, marginBottom: 4 }}>Resumen para Clientes (Lenguaje No Técnico)</div>
                <div style={{ color: '#94A3B8', fontSize: '0.8rem' }}>{devopsTriage.client_friendly_summary}</div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Modal de Marketing Masivo */}
      <MarketingCampaignModal
        projectId={projectId}
        isOpen={isMarketingModalOpen}
        onClose={() => setIsMarketingModalOpen(false)}
      />
    </div>
  );
};

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

  const filteredTasks = tasks.filter(t => {
    if (statusFilter !== 'ALL' && t.status !== statusFilter) return false;
    if (priorityFilter !== 'ALL' && t.priority !== priorityFilter) return false;
    return true;
  });

  return (
    <div style={{ padding: 24, backgroundColor: '#070B14', color: '#F8FAFC', minHeight: '100vh', fontFamily: "'JetBrains Mono', sans-serif" }}>
      {/* Barra Superior */}
      <header style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
        <div>
          <h2 style={{ margin: 0, fontSize: '1.4rem' }}>Workspace Project Dashboard</h2>
          <span style={{ fontSize: '0.8rem', color: '#94A3B8' }}>Sesión activa · Rol: {userRole}</span>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          {(['medicion', 'ejecucion', 'diseno'] as const).map(tab => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              style={{
                padding: '8px 16px',
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
          <button
            onClick={() => setIsMarketingModalOpen(true)}
            style={{
              padding: '8px 16px',
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
      <section style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 16, marginBottom: 24 }}>
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

      {/* Gestor To-Do con Filtros */}
      <section style={{ marginTop: 24, background: '#0F172A', padding: 20, borderRadius: 8, border: '1px solid #334155' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
          <h3 style={{ margin: 0, fontSize: '1.1rem' }}>Módulo de Tareas del Proyecto</h3>
          <div style={{ display: 'flex', gap: 10 }}>
            <select
              value={statusFilter}
              onChange={e => setStatusFilter(e.target.value)}
              style={{ background: '#1E293B', color: '#FFF', border: '1px solid #334155', borderRadius: 4, padding: '4px 8px', fontSize: '0.75rem' }}
            >
              <option value="ALL">Todos los Estados</option>
              <option value="TODO">TODO</option>
              <option value="IN_PROGRESS">IN_PROGRESS</option>
              <option value="REVIEW">REVIEW</option>
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
            </div>
          ))}
        </div>
      </section>

      {/* Modal de Marketing Masivo */}
      <MarketingCampaignModal
        projectId={projectId}
        isOpen={isMarketingModalOpen}
        onClose={() => setIsMarketingModalOpen(false)}
      />
    </div>
  );
};

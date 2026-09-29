import React, { useState, useEffect } from 'react';
import { WorkflowCanvas } from '../workflow/WorkflowCanvas';
import { Node, Edge } from 'reactflow';

export interface TaskItem {
  id: string;
  title: string;
  description: string;
  status: 'TODO' | 'IN_PROGRESS' | 'DONE';
  assigned_to?: string;
}

export const ProjectDashboard: React.FC<{ projectId: string; userRole: 'ADMIN' | 'COLLABORATOR' | 'CLIENT' }> = ({
  projectId,
  userRole
}) => {
  const [activeTab, setActiveTab] = useState<'medicion' | 'ejecucion' | 'diseno'>('ejecucion');
  const [tasks, setTasks] = useState<TaskItem[]>([]);
  const [nodes, setNodes] = useState<Node[]>([]);
  const [edges, setEdges] = useState<Edge[]>([]);
  const [telemetry, setTelemetry] = useState({
    successRate: 96.5,
    avgCiDurationSec: 42,
    recentCommits: 18,
    greenNodesPercent: 0
  });

  useEffect(() => {
    // Carga de datos del workflow y tareas
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
              label: n.label,
              description: n.description,
              status: n.status,
              isAutomatedGithub: n.is_automated_github,
              stepOrder: n.step_order
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
    // Cálculo reactivo de porcentaje de nodos en verde
    if (nodes.length > 0) {
      const greenCount = nodes.filter(n => n.data?.status === 'GREEN').length;
      setTelemetry(prev => ({
        ...prev,
        greenNodesPercent: Math.round((greenCount / nodes.length) * 100)
      }));
    }
  }, [nodes]);

  // Sincronización optimista de tareas To-Do
  const toggleTaskStatus = async (taskId: string, currentStatus: string) => {
    if (userRole === 'CLIENT') return;

    const nextStatus = currentStatus === 'DONE' ? 'TODO' : 'DONE';

    // 1. Optimistic Update en UI (<200 ms)
    setTasks(prev => prev.map(t => (t.id === taskId ? { ...t, status: nextStatus } : t)));

    try {
      const res = await fetch(`/api/v1/tasks/${taskId}/status`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: nextStatus, user_role: userRole })
      });

      if (res.ok) {
        const data = await res.json();
        // Si hubo transición de nodos, mutar color reactivamente
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
      // Reversión ante fallo de red
      setTasks(prev => prev.map(t => (t.id === taskId ? { ...t, status: currentStatus as any } : t)));
    }
  };

  return (
    <div style={{ padding: 24, backgroundColor: '#070B14', color: '#F8FAFC', minHeight: '100vh', fontFamily: "'JetBrains Mono', sans-serif" }}>
      {/* Barra de Herramientas Superior */}
      <header style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
        <div>
          <h2 style={{ margin: 0, fontSize: '1.4rem' }}>Workspace Project Dashboard</h2>
          <span style={{ fontSize: '0.8rem', color: '#94A3B8' }}>Rol de sesión: {userRole}</span>
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
        </div>
      </header>

      {/* Tarjetas de Telemetría Superior */}
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
          <div style={{ fontSize: '0.78rem', color: '#94A3B8' }}>Avance General Nodos</div>
          <div style={{ fontSize: '1.4rem', fontWeight: 700, color: '#10B981' }}>{telemetry.greenNodesPercent}%</div>
        </div>
      </section>

      {/* Lienzo React Flow */}
      <WorkflowCanvas
        nodes={nodes}
        edges={edges}
        userRole={userRole}
        onNodesUpdate={setNodes}
        onEdgesUpdate={setEdges}
      />

      {/* Módulo To-Do interactivo estilo Microsoft To-Do */}
      <section style={{ marginTop: 24, background: '#0F172A', padding: 20, borderRadius: 8, border: '1px solid #334155' }}>
        <h3 style={{ margin: '0 0 16px 0', fontSize: '1.1rem' }}>Módulo de Tareas del Proyecto</h3>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {tasks.map(task => (
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
                <div style={{ textDecoration: task.status === 'DONE' ? 'line-through' : 'none' }}>{task.title}</div>
                <div style={{ fontSize: '0.75rem', color: '#94A3B8' }}>{task.description}</div>
              </div>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
};

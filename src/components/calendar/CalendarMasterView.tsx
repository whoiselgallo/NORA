import React, { useState, useEffect } from 'react';

export interface CalendarEventItem {
  id: string;
  workspace_id: string;
  project_id?: string | null;
  project_name?: string | null;
  title: string;
  description?: string | null;
  start_date: string;
  due_date: string;
  event_type: 'TASK' | 'GANTT_MILESTONE' | 'SPRINT' | 'CUSTOM';
  priority: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
  status: string;
  alert_triggered: boolean;
}

interface CalendarMasterViewProps {
  workspaceId: string;
  currentProjectId?: string;
  onClose?: () => void;
}

export const CalendarMasterView: React.FC<CalendarMasterViewProps> = ({
  workspaceId,
  currentProjectId,
  onClose
}) => {
  // Conmutación dinámica de perspectiva: 'ALL' (Global Workspace) vs 'CURRENT' (Proyecto Específico)
  const [perspective, setPerspective] = useState<'WORKSPACE_GLOBAL' | 'PROJECT_ONLY'>(
    currentProjectId ? 'PROJECT_ONLY' : 'WORKSPACE_GLOBAL'
  );
  const [selectedProjectId, setSelectedProjectId] = useState<string>(currentProjectId || 'ALL');
  const [events, setEvents] = useState<CalendarEventItem[]>([]);
  const [filterType, setFilterType] = useState<string>('ALL');
  const [isLoading, setIsLoading] = useState<boolean>(true);

  useEffect(() => {
    fetchEvents();
  }, [perspective, selectedProjectId, workspaceId]);

  const fetchEvents = async () => {
    setIsLoading(true);
    try {
      let url = `/api/v1/calendar/events?workspace_id=${workspaceId}`;
      if (perspective === 'PROJECT_ONLY' && selectedProjectId !== 'ALL') {
        url += `&project_id=${selectedProjectId}`;
      }

      const res = await fetch(url, {
        headers: {
          'x-workspace-id': workspaceId
        }
      });

      if (res.ok) {
        const data = await res.json();
        setEvents(data);
      }
    } catch (err) {
      console.error('Error fetching calendar events:', err);
    } finally {
      setIsLoading(false);
    }
  };

  const filteredEvents = events.filter(e => {
    if (filterType !== 'ALL' && e.event_type !== filterType) return false;
    return true;
  });

  const getPriorityBadgeColor = (p: string) => {
    switch (p) {
      case 'CRITICAL':
        return '#EF4444';
      case 'HIGH':
        return '#F59E0B';
      case 'LOW':
        return '#10B981';
      case 'MEDIUM':
      default:
        return '#38BDF8';
    }
  };

  return (
    <div
      style={{
        background: '#0B1120',
        color: '#F8FAFC',
        borderRadius: 12,
        border: '1px solid #334155',
        padding: 24,
        fontFamily: "'JetBrains Mono', sans-serif"
      }}
    >
      {/* Encabezado y Selector de Perspectiva */}
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          flexWrap: 'wrap',
          gap: 12,
          borderBottom: '1px solid #1E293B',
          paddingBottom: 16,
          marginBottom: 20
        }}
      >
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <h3 style={{ margin: 0, fontSize: '1.25rem', color: '#38BDF8' }}>
              📅 Calendario Maestro Centralizado
            </h3>
            <span
              style={{
                fontSize: '0.72rem',
                background: 'rgba(56, 189, 248, 0.15)',
                color: '#38BDF8',
                padding: '2px 8px',
                borderRadius: 4,
                border: '1px solid rgba(56, 189, 248, 0.3)'
              }}
            >
              Webhook Master Conectado
            </span>
          </div>
          <p style={{ margin: '4px 0 0', fontSize: '0.8rem', color: '#94A3B8' }}>
            Sincronización bidireccional con To-Do, Scrum, Gantt y Alertas en Tiempo Real.
          </p>
        </div>

        {/* Controles de Perspectiva sin recarga de página */}
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
          <div style={{ background: '#1E293B', borderRadius: 8, padding: 3, display: 'flex' }}>
            <button
              onClick={() => {
                setPerspective('WORKSPACE_GLOBAL');
                setSelectedProjectId('ALL');
              }}
              style={{
                padding: '6px 14px',
                borderRadius: 6,
                border: 'none',
                cursor: 'pointer',
                fontSize: '0.78rem',
                fontWeight: 700,
                background: perspective === 'WORKSPACE_GLOBAL' ? '#38BDF8' : 'transparent',
                color: perspective === 'WORKSPACE_GLOBAL' ? '#000' : '#94A3B8',
                transition: 'all 0.15s ease'
              }}
            >
              🌐 Global Workspace
            </button>
            <button
              onClick={() => {
                setPerspective('PROJECT_ONLY');
                if (currentProjectId) setSelectedProjectId(currentProjectId);
              }}
              style={{
                padding: '6px 14px',
                borderRadius: 6,
                border: 'none',
                cursor: 'pointer',
                fontSize: '0.78rem',
                fontWeight: 700,
                background: perspective === 'PROJECT_ONLY' ? '#38BDF8' : 'transparent',
                color: perspective === 'PROJECT_ONLY' ? '#000' : '#94A3B8',
                transition: 'all 0.15s ease'
              }}
            >
              🎯 Proyecto Actual
            </button>
          </div>

          <select
            value={filterType}
            onChange={e => setFilterType(e.target.value)}
            style={{
              background: '#1E293B',
              color: '#FFF',
              border: '1px solid #334155',
              borderRadius: 6,
              padding: '6px 12px',
              fontSize: '0.75rem'
            }}
          >
            <option value="ALL">Todos los Hitos</option>
            <option value="TASK">Tareas (To-Do)</option>
            <option value="SPRINT">Sprints (Scrum)</option>
            <option value="GANTT_MILESTONE">Hitos Gantt</option>
            <option value="CUSTOM">Eventos Personalizados</option>
          </select>

          {onClose && (
            <button
              onClick={onClose}
              style={{
                background: 'transparent',
                border: '1px solid #334155',
                color: '#94A3B8',
                borderRadius: 6,
                padding: '6px 10px',
                cursor: 'pointer'
              }}
            >
              ✕
            </button>
          )}
        </div>
      </div>

      {/* Lista de Hitos y Fechas */}
      {isLoading ? (
        <div style={{ textAlign: 'center', padding: 40, color: '#94A3B8' }}>
          Sincronizando calendario con base de datos Neon...
        </div>
      ) : filteredEvents.length === 0 ? (
        <div
          style={{
            textAlign: 'center',
            padding: 40,
            background: '#070B14',
            borderRadius: 8,
            border: '1px dashed #334155',
            color: '#64748B'
          }}
        >
          No hay eventos programados en esta perspectiva ({perspective === 'WORKSPACE_GLOBAL' ? 'Todo el Workspace' : 'Proyecto Seleccionado'}).
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {filteredEvents.map(event => {
            const dueDate = new Date(event.due_date);
            const isOverdue = dueDate < new Date() && event.status !== 'DONE' && event.status !== 'COMPLETED';
            const priorityColor = getPriorityBadgeColor(event.priority);

            return (
              <div
                key={event.id}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  padding: '12px 16px',
                  background: '#0F172A',
                  borderRadius: 8,
                  borderLeft: `4px solid ${isOverdue ? '#EF4444' : priorityColor}`,
                  borderTop: '1px solid #1E293B',
                  borderRight: '1px solid #1E293B',
                  borderBottom: '1px solid #1E293B',
                  flexWrap: 'wrap',
                  gap: 12
                }}
              >
                <div style={{ flex: 1, minWidth: 240 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                    <span style={{ fontWeight: 700, fontSize: '0.92rem', color: '#F8FAFC' }}>
                      {event.title}
                    </span>
                    <span
                      style={{
                        fontSize: '0.65rem',
                        fontWeight: 700,
                        padding: '1px 6px',
                        borderRadius: 3,
                        background: `${priorityColor}22`,
                        color: priorityColor,
                        border: `1px solid ${priorityColor}44`
                      }}
                    >
                      {event.priority}
                    </span>
                    <span
                      style={{
                        fontSize: '0.65rem',
                        padding: '1px 6px',
                        borderRadius: 3,
                        background: '#334155',
                        color: '#CBD5E1'
                      }}
                    >
                      {event.event_type}
                    </span>
                    {isOverdue && (
                      <span
                        style={{
                          fontSize: '0.65rem',
                          background: 'rgba(239, 68, 68, 0.2)',
                          color: '#EF4444',
                          padding: '1px 6px',
                          borderRadius: 3,
                          fontWeight: 700
                        }}
                      >
                        ⚠ VENCIDO
                      </span>
                    )}
                    {event.alert_triggered && (
                      <span
                        style={{
                          fontSize: '0.65rem',
                          background: 'rgba(16, 185, 129, 0.2)',
                          color: '#10B981',
                          padding: '1px 6px',
                          borderRadius: 3
                        }}
                      >
                        🔔 Alerta Enviada
                      </span>
                    )}
                  </div>
                  {event.description && (
                    <div style={{ fontSize: '0.78rem', color: '#94A3B8' }}>{event.description}</div>
                  )}
                  {event.project_name && (
                    <div style={{ fontSize: '0.72rem', color: '#38BDF8', marginTop: 4 }}>
                      Proyecto: {event.project_name}
                    </div>
                  )}
                </div>

                <div style={{ textAlign: 'right', fontSize: '0.78rem', color: '#CBD5E1' }}>
                  <div>Inicio: {new Date(event.start_date).toLocaleDateString()}</div>
                  <div style={{ fontWeight: 700, color: isOverdue ? '#EF4444' : '#F8FAFC' }}>
                    Vence: {dueDate.toLocaleDateString()}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};

import React, { useRef } from 'react';
import { useVirtualizer } from '@tanstack/react-virtual';

export interface TaskItem {
  id: string;
  title: string;
  description: string;
  status: 'TODO' | 'IN_PROGRESS' | 'REVIEW' | 'DONE';
  priority: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
  assigned_to?: string;
  assignee_name?: string;
  assignee_email?: string;
  due_date?: string;
}

export interface VirtualTodoListProps {
  tasks: TaskItem[];
  userRole: 'ADMIN' | 'COLLABORATOR' | 'CLIENT';
  onToggleStatus: (taskId: string, currentStatus: string) => void;
  onDecomposeTask?: (title: string, description?: string) => void;
}

const getPriorityColor = (priority: TaskItem['priority']): string => {
  switch (priority) {
    case 'CRITICAL':
      return '#EF4444'; // Rojo vibrante
    case 'HIGH':
      return '#F59E0B'; // Ámbar
    case 'MEDIUM':
      return '#38BDF8'; // Cyan
    case 'LOW':
    default:
      return '#10B981'; // Esmeralda
  }
};

/**
 * Componente VirtualTodoList con @tanstack/react-virtual.
 * Optimizado para listas con cientos de tareas, renderizado dinámico con soporte multilínea,
 * medición automática de alturas y cero caídas de fotogramas.
 */
export const VirtualTodoList: React.FC<VirtualTodoListProps> = ({
  tasks,
  userRole,
  onToggleStatus,
  onDecomposeTask
}) => {
  const parentRef = useRef<HTMLDivElement>(null);

  const virtualizer = useVirtualizer({
    count: tasks.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => 64, // Altura estimada estándar de 64px por fila
    overscan: 5 // Margen de renderizado previo de 5 elementos
  });

  const virtualItems = virtualizer.getVirtualItems();

  // Manejo de estado vacío elegante
  if (tasks.length === 0) {
    return (
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          padding: '48px 16px',
          background: '#1E293B',
          borderRadius: 8,
          border: '1px dashed #334155',
          color: '#94A3B8',
          textAlign: 'center',
          gap: 12
        }}
      >
        <span style={{ fontSize: '2rem' }}>📋</span>
        <div style={{ fontWeight: 600, fontSize: '0.95rem', color: '#F8FAFC' }}>
          No se encontraron tareas
        </div>
        <p style={{ margin: 0, fontSize: '0.8rem', maxWidth: 360, color: '#64748B' }}>
          No hay tareas registradas que coincidan con los filtros aplicados. Puedes agregar una nueva tarea arriba.
        </p>
      </div>
    );
  }

  return (
    <div
      ref={parentRef}
      style={{
        height: '520px',
        maxHeight: '70vh',
        overflowY: 'auto',
        position: 'relative',
        borderRadius: 8,
        background: '#0B1120',
        border: '1px solid #334155',
        padding: '6px 8px'
      }}
    >
      <div
        style={{
          height: `${virtualizer.getTotalSize()}px`,
          width: '100%',
          position: 'relative'
        }}
      >
        {virtualItems.map(virtualRow => {
          const task = tasks[virtualRow.index];
          if (!task) return null;

          const isDone = task.status === 'DONE';
          const priorityColor = getPriorityColor(task.priority);

          return (
            <div
              key={task.id}
              data-index={virtualRow.index}
              ref={virtualizer.measureElement}
              onClick={() => onToggleStatus(task.id, task.status)}
              style={{
                position: 'absolute',
                top: 0,
                left: 0,
                width: '100%',
                transform: `translateY(${virtualRow.start}px)`,
                padding: '4px 0'
              }}
            >
              <div
                style={{
                  display: 'flex',
                  alignItems: 'flex-start',
                  gap: 12,
                  padding: '12px 16px',
                  background: isDone ? 'rgba(30, 41, 59, 0.5)' : '#1E293B',
                  borderRadius: 6,
                  borderLeft: `4px solid ${priorityColor}`,
                  boxShadow: '0 2px 4px rgba(0, 0, 0, 0.2)',
                  cursor: userRole === 'CLIENT' ? 'default' : 'pointer',
                  transition: 'background-color 0.15s ease'
                }}
              >
                {/* Checkbox de estado interactivo */}
                <input
                  type="checkbox"
                  checked={isDone}
                  onChange={() => {}} // Manejado por onClick del contenedor para accesibilidad fluida
                  disabled={userRole === 'CLIENT'}
                  style={{
                    width: 18,
                    height: 18,
                    accentColor: '#10B981',
                    marginTop: 3,
                    cursor: userRole === 'CLIENT' ? 'default' : 'pointer'
                  }}
                />

                {/* Contenido de la tarea (soporte multilínea sin desbordamiento) */}
                <div style={{ flex: 1, minWidth: 0, wordBreak: 'break-word' }}>
                  <div
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      flexWrap: 'wrap',
                      gap: 8,
                      marginBottom: 4
                    }}
                  >
                    <span
                      style={{
                        fontWeight: 600,
                        fontSize: '0.88rem',
                        color: isDone ? '#94A3B8' : '#F8FAFC',
                        textDecoration: isDone ? 'line-through' : 'none',
                        lineHeight: 1.4
                      }}
                    >
                      {task.title}
                    </span>

                    {/* Insignia de prioridad */}
                    <span
                      style={{
                        fontSize: '0.65rem',
                        fontWeight: 700,
                        padding: '1px 6px',
                        borderRadius: 3,
                        background: `${priorityColor}22`,
                        color: priorityColor,
                        border: `1px solid ${priorityColor}44`,
                        letterSpacing: '0.5px'
                      }}
                    >
                      {task.priority}
                    </span>

                    {/* Insignia de estado */}
                    <span
                      style={{
                        fontSize: '0.65rem',
                        padding: '1px 6px',
                        borderRadius: 3,
                        background: '#334155',
                        color: '#CBD5E1'
                      }}
                    >
                      {task.status}
                    </span>

                    {/* Colaborador asignado */}
                    {(task.assignee_name || task.assignee_email) && (
                      <span
                        style={{
                          fontSize: '0.65rem',
                          padding: '1px 6px',
                          borderRadius: 3,
                          background: 'rgba(56, 189, 248, 0.1)',
                          color: '#38BDF8',
                          border: '1px solid rgba(56, 189, 248, 0.25)'
                        }}
                      >
                        👤 {task.assignee_name || task.assignee_email}
                      </span>
                    )}
                  </div>

                  {/* Descripción opcional */}
                  {task.description && (
                    <div
                      style={{
                        fontSize: '0.78rem',
                        color: '#94A3B8',
                        lineHeight: 1.4,
                        whiteSpace: 'pre-wrap'
                      }}
                    >
                      {task.description}
                    </div>
                  )}
                </div>

                {/* Botón interactivo para descomponer tarea con IA */}
                {onDecomposeTask && (
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      onDecomposeTask(task.title, task.description);
                    }}
                    title="Desglosar esta tarea en subtareas atómicas con IA"
                    style={{
                      background: 'rgba(168, 85, 247, 0.15)',
                      border: '1px solid #A855F7',
                      color: '#A855F7',
                      fontSize: '0.7rem',
                      fontWeight: 600,
                      padding: '4px 8px',
                      borderRadius: 4,
                      cursor: 'pointer',
                      flexShrink: 0,
                      display: 'flex',
                      alignItems: 'center',
                      gap: 4
                    }}
                  >
                    ✨ IA
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};

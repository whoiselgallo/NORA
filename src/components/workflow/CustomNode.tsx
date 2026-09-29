import React, { memo } from 'react';
import { Handle, Position, NodeProps } from 'reactflow';

export interface CustomNodeData {
  label: string;
  description: string;
  status: 'RED' | 'GREEN';
  isAutomatedGithub: boolean;
  stepOrder: number;
}

export const CustomNode = memo(({ data }: NodeProps<CustomNodeData>) => {
  const isGreen = data.status === 'GREEN';

  return (
    <div
      style={{
        width: 260,
        borderRadius: 8,
        padding: '14px 16px',
        backgroundColor: '#0F172A',
        color: '#F8FAFC',
        fontFamily: "'JetBrains Mono', monospace",
        border: `2px solid ${isGreen ? '#10B981' : '#EF4444'}`,
        boxShadow: isGreen
          ? '0 0 16px rgba(16, 185, 129, 0.4), inset 0 0 10px rgba(16, 185, 129, 0.1)'
          : '0 0 14px rgba(239, 68, 68, 0.35)',
        transition: 'all 0.25s ease'
      }}
    >
      <Handle type="target" position={Position.Left} style={{ background: '#38BDF8' }} />

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
        <span style={{ fontSize: '0.72rem', color: '#94A3B8', fontWeight: 600 }}>PASO #{data.stepOrder}</span>
        <span
          style={{
            fontSize: '0.68rem',
            padding: '2px 6px',
            borderRadius: 4,
            fontWeight: 700,
            backgroundColor: isGreen ? 'rgba(16, 185, 129, 0.2)' : 'rgba(239, 68, 68, 0.2)',
            color: isGreen ? '#10B981' : '#EF4444'
          }}
        >
          {isGreen ? '✓ COMPLETADO' : '● PENDIENTE'}
        </span>
      </div>

      <h4 style={{ fontSize: '0.88rem', fontWeight: 700, margin: '4px 0', color: '#FFFFFF' }}>{data.label}</h4>
      <p style={{ fontSize: '0.75rem', color: '#94A3B8', margin: '4px 0 8px 0', lineHeight: 1.4 }}>
        {data.description}
      </p>

      {data.isAutomatedGithub && (
        <div style={{ fontSize: '0.68rem', color: '#38BDF8', display: 'flex', alignItems: 'center', gap: 4 }}>
          <span>⚡ GitHub Webhook Sync</span>
        </div>
      )}

      <Handle type="source" position={Position.Right} style={{ background: '#38BDF8' }} />
    </div>
  );
});

CustomNode.displayName = 'CustomNode';

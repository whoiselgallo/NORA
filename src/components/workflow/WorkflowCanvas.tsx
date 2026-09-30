import React, { useCallback } from 'react';
import ReactFlow, {
  Background,
  Controls,
  MiniMap,
  Node,
  Edge,
  OnNodesChange,
  OnEdgesChange,
  applyNodeChanges,
  applyEdgeChanges
} from 'reactflow';
import 'reactflow/dist/style.css';
import { CustomNode } from './CustomNode';

const nodeTypes = { customWorkflowNode: CustomNode };

interface WorkflowCanvasProps {
  nodes: Node[];
  edges: Edge[];
  userRole: 'ADMIN' | 'COLLABORATOR' | 'CLIENT';
  onNodesUpdate: (nodes: Node[]) => void;
  onEdgesUpdate: (edges: Edge[]) => void;
}

export const WorkflowCanvas: React.FC<WorkflowCanvasProps> = ({
  nodes,
  edges,
  userRole,
  onNodesUpdate,
  onEdgesUpdate
}) => {
  const isClient = userRole === 'CLIENT';

  const onNodesChange: OnNodesChange = useCallback(
    (changes) => {
      if (isClient) return; // Bloqueo estricto para rol CLIENT
      onNodesUpdate(applyNodeChanges(changes, nodes));
    },
    [isClient, nodes, onNodesUpdate]
  );

  const onEdgesChange: OnEdgesChange = useCallback(
    (changes) => {
      if (isClient) return; // Bloqueo estricto para rol CLIENT
      onEdgesUpdate(applyEdgeChanges(changes, edges));
    },
    [isClient, edges, onEdgesUpdate]
  );

  return (
    <div style={{ width: '100%', height: '520px', backgroundColor: '#070B14', borderRadius: 8 }}>
      <ReactFlow
        nodes={nodes}
        edges={edges}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        nodeTypes={nodeTypes}
        nodesDraggable={!isClient}
        nodesConnectable={!isClient}
        elementsSelectable={!isClient}
        fitView
      >
        <Background color="#1E293B" gap={20} size={1.5} />
        <Controls />
        <MiniMap nodeColor={(n: Node) => (n.data?.status === 'GREEN' ? '#10B981' : '#EF4444')} maskColor="rgba(7, 11, 20, 0.7)" />
      </ReactFlow>
    </div>
  );
};

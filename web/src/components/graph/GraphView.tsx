import { useEffect, useCallback } from 'react';
import {
  ReactFlow,
  Background,
  Controls,
  MiniMap,
  useNodesState,
  useEdgesState,
  type Node,
  type Edge,
  MarkerType
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import { forceSimulation, forceLink, forceManyBody, forceCenter, forceCollide } from 'd3-force';
import { type GraphData } from '@/services/graph';

interface GraphViewProps {
  data: GraphData;
  onNodeClick?: (event: React.MouseEvent, node: Node) => void;
}

export function GraphView({ data, onNodeClick }: GraphViewProps) {
  const [nodes, setNodes, onNodesChange] = useNodesState<Node>([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState<Edge>([]);

  useEffect(() => {
    if (!data.nodes.length) return;

    // Transform backend data to D3 compatible format (simulating layout)
    const d3Nodes = data.nodes.map(n => ({ ...n }));
    const d3Edges = data.edges.map(e => ({ ...e }));

    const simulation = forceSimulation(d3Nodes as any)
      .force('link', forceLink(d3Edges).id((d: any) => d.id).distance(150))
      .force('charge', forceManyBody().strength(-500))
      .force('center', forceCenter(0, 0))
      .force('collide', forceCollide(50));

    // Run simulation synchronously for static layout (or async for animation)
    // For React Flow, static initial layout is often better to avoid jitter
    simulation.tick(300); // Run 300 ticks to settle

    // Map to React Flow format
    const flowNodes: Node[] = d3Nodes.map((n: any) => ({
      id: n.id,
      type: 'default', // or custom
      position: { x: n.x || 0, y: n.y || 0 },
      data: { label: n.label, type: n.type, connectionCount: n.connectionCount },
      style: {
        background: n.type === 'PERSON' ? '#ecfdf5' :
          n.type === 'ORGANIZATION' ? '#eff6ff' : '#fff',
        border: '1px solid #e2e8f0',
        borderRadius: '8px',
        padding: '10px',
        width: 150,
        fontSize: '12px',
        textAlign: 'center',
      }
    }));

    const flowEdges: Edge[] = data.edges.map(e => ({
      id: e.id,
      source: e.source,
      target: e.target,
      label: e.type,
      type: 'smoothstep',
      markerEnd: { type: MarkerType.ArrowClosed },
      animated: true,
      style: { stroke: '#94a3b8' }
    }));

    setNodes(flowNodes);
    setEdges(flowEdges);

    return () => { simulation.stop(); };
  }, [data, setNodes, setEdges]); // Rerun logic when data changes

  return (
    <div className="h-[600px] w-full border rounded-lg bg-slate-50">
      <ReactFlow
        nodes={nodes}
        edges={edges}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onNodeClick={onNodeClick}
        fitView
      >
        <Background />
        <Controls />
        <MiniMap />
      </ReactFlow>
    </div>
  );
}

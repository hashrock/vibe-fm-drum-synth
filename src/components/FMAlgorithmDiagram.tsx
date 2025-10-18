import { memo, useMemo } from 'react';
import type { FMAlgorithm } from '../audio/types';

type OperatorId = 0 | 1 | 2 | 3;

type NodeId = OperatorId | 'output';

interface NodeDefinition {
  id: NodeId;
  label: string;
  x: number;
  y: number;
}

interface FMAlgorithmDiagramProps {
  algorithm: FMAlgorithm;
  hoveredOperator: OperatorId | null;
  onHover: (operator: OperatorId | null) => void;
}

const WIDTH = 260;
const HEIGHT = 140;
const OP_RADIUS = 22;
const OUTPUT_RADIUS = 18;

const BASE_LABELS: Record<NodeId, string> = {
  0: 'OP1',
  1: 'OP2',
  2: 'OP3',
  3: 'OP4',
  output: 'OUT',
};

const buildLayout = (algorithm: FMAlgorithm) => {
  const makeNode = (id: NodeId, x: number, y: number): NodeDefinition => ({
    id,
    label: BASE_LABELS[id],
    x,
    y,
  });

  switch (algorithm) {
    case 'serial':
      return {
        nodes: [
          makeNode(0, 40, 70),
          makeNode(1, 100, 70),
          makeNode(2, 160, 70),
          makeNode(3, 220, 70),
          makeNode('output', 260 - 18, 70),
        ],
        edges: [
          { from: 0, to: 1 },
          { from: 1, to: 2 },
          { from: 2, to: 3 },
          { from: 3, to: 'output' },
        ],
      };
    case 'parallel':
      return {
        nodes: [
          makeNode(0, 70, 35),
          makeNode(1, 70, 105),
          makeNode(2, 150, 35),
          makeNode(3, 150, 105),
          makeNode('output', 220, 70),
        ],
        edges: [
          { from: 0, to: 'output' },
          { from: 1, to: 'output' },
          { from: 2, to: 'output' },
          { from: 3, to: 'output' },
        ],
      };
    case 'hybrid1':
      return {
        nodes: [
          makeNode(0, 60, 35),
          makeNode(1, 120, 35),
          makeNode(2, 60, 105),
          makeNode(3, 120, 105),
          makeNode('output', 220, 70),
        ],
        edges: [
          { from: 0, to: 1 },
          { from: 2, to: 3 },
          { from: 1, to: 'output' },
          { from: 3, to: 'output' },
        ],
      };
    case 'hybrid2':
      return {
        nodes: [
          makeNode(0, 50, 45),
          makeNode(1, 115, 45),
          makeNode(2, 180, 45),
          makeNode(3, 115, 105),
          makeNode('output', 235, 70),
        ],
        edges: [
          { from: 0, to: 1 },
          { from: 1, to: 2 },
          { from: 2, to: 'output' },
          { from: 3, to: 'output' },
        ],
      };
    default:
      return {
        nodes: [
          makeNode(0, 40, 70),
          makeNode(1, 100, 70),
          makeNode(2, 160, 70),
          makeNode(3, 220, 70),
          makeNode('output', 260 - 18, 70),
        ],
        edges: [
          { from: 0, to: 1 },
          { from: 1, to: 2 },
          { from: 2, to: 3 },
          { from: 3, to: 'output' },
        ],
      };
  }
};

export const FMAlgorithmDiagram = memo(({ algorithm, hoveredOperator, onHover }: FMAlgorithmDiagramProps) => {
  const layout = useMemo(() => buildLayout(algorithm), [algorithm]);

  return (
    <svg
      width={WIDTH}
      height={HEIGHT}
      viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
      style={{
        background: '#2a2a2a',
        borderRadius: '8px',
        padding: '8px',
        boxSizing: 'border-box',
      }}
      onMouseLeave={() => onHover(null)}
    >
      <rect
        x={4}
        y={4}
        width={WIDTH - 8}
        height={HEIGHT - 8}
        rx={10}
        ry={10}
        fill="none"
        stroke="#4b4b4b"
        strokeWidth={1.5}
      />

      {layout.edges.map((edge, index) => {
        const fromNode = layout.nodes.find(node => node.id === edge.from);
        const toNode = layout.nodes.find(node => node.id === edge.to);

        if (!fromNode || !toNode) {
          return null;
        }

        const isActive = hoveredOperator === edge.from || (typeof edge.to === 'number' && hoveredOperator === edge.to);

        return (
          <line
            key={`${edge.from}-${edge.to}-${index}`}
            x1={fromNode.x}
            y1={fromNode.y}
            x2={toNode.x}
            y2={toNode.y}
            stroke={isActive ? '#ffd966' : '#9f9f9f'}
            strokeWidth={isActive ? 5 : 3}
            strokeLinecap="round"
          />
        );
      })}

      {layout.nodes.map(node => {
        const isOperator = typeof node.id === 'number';
        const isHovered = isOperator && hoveredOperator === node.id;
        const radius = node.id === 'output' ? OUTPUT_RADIUS : isHovered ? OP_RADIUS + 3 : OP_RADIUS;
        const fill = node.id === 'output' ? '#4f4f4f' : isHovered ? '#ffd966' : '#f5f5f5';
        const stroke = isHovered ? '#ffffff' : '#2a2a2a';

        const handleMouseEnter = () => {
          if (isOperator) {
            onHover(node.id as OperatorId);
          } else {
            onHover(null);
          }
        };

        return (
          <g key={node.id} onMouseEnter={handleMouseEnter} style={{ cursor: isOperator ? 'pointer' : 'default' }}>
            <circle cx={node.x} cy={node.y} r={radius} fill={fill} stroke={stroke} strokeWidth={isHovered ? 3 : 2} />
            <text
              x={node.x}
              y={node.y + 4}
              textAnchor="middle"
              fontSize={isOperator ? 14 : 12}
              fill={isHovered || node.id === 'output' ? '#1f1f1f' : '#1a1a1a'}
              fontWeight={isOperator ? 600 : 500}
              pointerEvents="none"
            >
              {node.label}
            </text>
          </g>
        );
      })}
    </svg>
  );
});

FMAlgorithmDiagram.displayName = 'FMAlgorithmDiagram';

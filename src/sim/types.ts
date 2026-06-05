export type Terrain = "grass" | "rough" | "water" | "town";
export type Action =
  | { type: "build_route"; sourceId: string; destinationId: string; cargo: string; mode: string; vehicles: number }
  | { type: "add_vehicle"; routeId: string; count: number }
  | { type: "wait"; months: number }
  | { type: "take_loan"; amount: number }
  | { type: "repay_loan"; amount: number }
  | { type: "invalid" };

export interface WorldNode {
  id: string;
  name: string;
  kind: string;
  x: number;
  y: number;
  produces: Record<string, number>;
  accepts: Record<string, number>;
  storage: Record<string, number>;
  population?: number | null;
  productionIndex?: number;
  rating?: number;
}

export interface Route {
  id: string;
  sourceId: string;
  destinationId: string;
  cargo: string;
  mode: string;
  distance: number;
  vehicles: number;
  delivered: number;
  profit: number;
  utilization: number;
  reliability: number;
  congestion: number;
  path: Array<{ x: number; y: number }>;
}

export interface Metrics {
  score: number;
  cargoDelivered: number;
  operatingProfit: number;
  networkValue: number;
  routeCount: number;
  vehicles: number;
  invalidActions: number;
  firstDeliveryMonth: number | null;
  debtRatio: number;
  utilization: number;
  inTransitCargo: number;
  averageReliability: number;
  congestion: number;
  townGrowth: number;
  productionIndex: number;
  lateShipments: number;
  breakdown: Record<string, number>;
}

export interface Observation {
  schema: "tycoonle-observation-v1";
  world: {
    id: string;
    split: string;
    family: string;
    seed: number;
    width: number;
    height: number;
    terrain: Terrain[][];
    nodes: WorldNode[];
    budget: { maxSteps: number; maxMonths: number; startingCash?: number | null; maxLoan: number; interestRate: number };
    objective: { id: string; label: string; cargo?: string | null; deliveredTarget: number; profitTarget: number; routeTarget: number; maxDebtRatio: number };
  };
  time: { month: number; step: number; maxMonths: number; maxSteps: number };
  company: { cash: number; loan: number; maxLoan: number };
  nodes: WorldNode[];
  routes: Route[];
  metrics: Metrics;
  candidateActions: unknown[];
  lastEvent: string;
}

export interface ReplayFocus {
  kind: string;
  label: string;
  routeId?: string | null;
  nodeIds: string[];
  tiles: Array<{ x: number; y: number; role: string }>;
  bounds: { minX: number; minY: number; maxX: number; maxY: number };
  camera: { centerX: number; centerY: number; padding: number; zoom: number };
}

export interface ReplayEvent {
  step: number;
  before: Observation;
  action: Action;
  after: Observation;
  reward: number;
  info: {
    rewardDetails?: {
      reward: number;
      components: Record<string, number>;
      milestones: string[];
      diagnostics: string[];
    };
    candidateActions?: unknown[];
    actionMask?: number[];
    executionTrace?: unknown;
  };
  focus?: ReplayFocus;
}

export interface ReplayManifest {
  schema: "tycoonle-replay-v1";
  createdAt: string;
  worldId: string;
  scenario: { split: string; family: string; seed: number };
  events: ReplayEvent[];
  summary: { steps: number; finalScore: number; cargoDelivered: number; operatingProfit: number };
}

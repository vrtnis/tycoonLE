import { useMemo, useRef, type PointerEvent as ReactPointerEvent } from "react";
import { Activity, Banknote, Box, Gauge, Route as RouteIcon } from "lucide-react";
import { money } from "../sim/replay";
import type { ReplayEvent, ReplayManifest } from "../sim/types";

interface Props {
  manifest: ReplayManifest;
  cursor: number;
  onCursorChange: (cursor: number) => void;
}

interface ChartPoint {
  step: number;
  reward: number;
  score: number;
  cargo: number;
  profit: number;
  cash: number;
  action: ReplayEvent["action"]["type"] | "start";
}

const CHART_W = 620;
const CHART_H = 228;
const PAD_L = 46;
const PAD_R = 18;
const PAD_T = 18;
const PAD_B = 32;
const COMPONENT_KEYS = ["scoreDelta", "cargoDelta", "profitDelta", "cashDelta", "loanDelta", "invalidAction"];

const ACTION_COLORS: Record<string, string> = {
  build_route: "#d7b85a",
  add_vehicle: "#63b3ed",
  wait: "#83c77d",
  take_loan: "#c084fc",
  repay_loan: "#f2a65a",
  invalid: "#f87171",
  start: "#8aa39a",
};

export function ReplayCharts({ manifest, cursor, onCursorChange }: Props): JSX.Element {
  const svgRef = useRef<SVGSVGElement | null>(null);
  const data = useMemo(() => makePoints(manifest), [manifest]);
  const selected = data[Math.min(cursor, data.length - 1)] ?? data[0];
  const selectedEvent = cursor > 0 ? manifest.events[Math.min(cursor, manifest.events.length) - 1] : null;
  const domain = useMemo(() => makeDomain(data), [data]);
  const totals = useMemo(() => makeTotals(manifest), [manifest]);

  const setCursorFromPointer = (event: ReactPointerEvent<SVGSVGElement>) => {
    const svg = svgRef.current;
    if (!svg) return;
    const rect = svg.getBoundingClientRect();
    const unitX = ((event.clientX - rect.left) / rect.width) * CHART_W;
    const step = Math.round(unscaleX(unitX, manifest.events.length));
    onCursorChange(clamp(step, 0, manifest.events.length));
  };

  return (
    <aside className="chart-panel">
      <div className="chart-header">
        <div>
          <h2>Replay Audit</h2>
          <p>Step {selected.step}/{manifest.events.length}</p>
        </div>
        <strong>{selected.score.toFixed(1)}</strong>
      </div>

      <div className="chart-stat-grid">
        <ChartStat icon={<Activity size={14} />} label="Reward" value={formatSigned(selected.reward, 3)} tone={selected.reward >= 0 ? "good" : "bad"} />
        <ChartStat icon={<Gauge size={14} />} label="Score" value={selected.score.toFixed(1)} />
        <ChartStat icon={<Box size={14} />} label="Cargo" value={Math.round(selected.cargo).toLocaleString()} />
        <ChartStat icon={<Banknote size={14} />} label="Profit" value={money(selected.profit)} tone={selected.profit >= 0 ? "good" : "bad"} />
      </div>

      <svg
        ref={svgRef}
        className="reward-chart"
        viewBox={`0 0 ${CHART_W} ${CHART_H}`}
        role="img"
        aria-label="Replay score, reward, cargo, and profit chart"
        onPointerDown={setCursorFromPointer}
        onPointerMove={(event) => {
          if (event.buttons === 1) setCursorFromPointer(event);
        }}
      >
        <rect x={0} y={0} width={CHART_W} height={CHART_H} rx={8} className="chart-bg" />
        <GridLines />
        <RewardBars data={data} maxStep={manifest.events.length} maxAbsReward={domain.maxAbsReward} />
        <Polyline data={data} maxStep={manifest.events.length} value={(point) => point.score} min={0} max={100} className="line-score" />
        <Polyline data={data} maxStep={manifest.events.length} value={(point) => point.cargo} min={domain.cargoMin} max={domain.cargoMax} className="line-cargo" />
        <Polyline data={data} maxStep={manifest.events.length} value={(point) => point.profit} min={domain.profitMin} max={domain.profitMax} className="line-profit" />
        <Cursor step={cursor} maxStep={manifest.events.length} />
        <AxisLabels maxStep={manifest.events.length} />
      </svg>

      <div className="chart-legend" aria-label="Chart legend">
        <LegendDot label="Score" className="legend-score" />
        <LegendDot label="Reward" className="legend-reward" />
        <LegendDot label="Cargo" className="legend-cargo" />
        <LegendDot label="Profit" className="legend-profit" />
      </div>

      <div className="action-rail" aria-label="Replay action timeline">
        {manifest.events.map((event) => (
          <button
            key={event.step}
            type="button"
            className={event.step === cursor ? "action-tick active" : "action-tick"}
            style={{ background: ACTION_COLORS[event.action.type] ?? ACTION_COLORS.invalid }}
            title={`${event.step}: ${describeAction(event)}`}
            aria-label={`${event.step}: ${describeAction(event)}`}
            onClick={() => onCursorChange(event.step)}
          />
        ))}
      </div>

      <section className="selected-action-panel">
        <div className="selected-action-title">
          <RouteIcon size={15} />
          <span>{selectedEvent ? describeAction(selectedEvent) : "Initial state"}</span>
        </div>
        <div className="component-list">
          {COMPONENT_KEYS.map((key) => (
            <ComponentBar key={key} label={labelComponent(key)} value={componentValue(selectedEvent, key)} />
          ))}
        </div>
      </section>

      <section className="chart-summary">
        <div><span>Total Reward</span><strong>{formatSigned(totals.reward, 3)}</strong></div>
        <div><span>Final Cargo</span><strong>{Math.round(totals.cargo).toLocaleString()}</strong></div>
        <div><span>Final Profit</span><strong>{money(totals.profit)}</strong></div>
      </section>
    </aside>
  );
}

function ChartStat({ icon, label, value, tone }: { icon: JSX.Element; label: string; value: string; tone?: "good" | "bad" }): JSX.Element {
  return (
    <div className={`chart-stat ${tone ?? ""}`}>
      <span>{icon}</span>
      <small>{label}</small>
      <strong>{value}</strong>
    </div>
  );
}

function GridLines(): JSX.Element {
  const ys = [PAD_T, PAD_T + (CHART_H - PAD_T - PAD_B) / 2, CHART_H - PAD_B];
  return (
    <g className="chart-grid">
      {ys.map((y) => (
        <line key={y} x1={PAD_L} x2={CHART_W - PAD_R} y1={y} y2={y} />
      ))}
      {[0, 0.25, 0.5, 0.75, 1].map((unit) => {
        const x = PAD_L + unit * (CHART_W - PAD_L - PAD_R);
        return <line key={unit} x1={x} x2={x} y1={PAD_T} y2={CHART_H - PAD_B} />;
      })}
    </g>
  );
}

function RewardBars({ data, maxStep, maxAbsReward }: { data: ChartPoint[]; maxStep: number; maxAbsReward: number }): JSX.Element {
  const zero = yForUnit(0.5);
  const stepWidth = Math.max(2, (CHART_W - PAD_L - PAD_R) / Math.max(1, maxStep) - 3);
  return (
    <g className="reward-bars">
      {data.slice(1).map((point) => {
        const x = xForStep(point.step, maxStep) - stepWidth / 2;
        const unit = 0.5 - (point.reward / Math.max(1, maxAbsReward)) * 0.44;
        const y = yForUnit(unit);
        return <rect key={point.step} x={x} y={Math.min(y, zero)} width={stepWidth} height={Math.max(1, Math.abs(zero - y))} className={point.reward >= 0 ? "reward-positive" : "reward-negative"} />;
      })}
    </g>
  );
}

function Polyline({
  data,
  maxStep,
  value,
  min,
  max,
  className,
}: {
  data: ChartPoint[];
  maxStep: number;
  value: (point: ChartPoint) => number;
  min: number;
  max: number;
  className: string;
}): JSX.Element {
  const points = data
    .map((point) => {
      const unit = 1 - normalize(value(point), min, max);
      return `${xForStep(point.step, maxStep).toFixed(2)},${yForUnit(unit).toFixed(2)}`;
    })
    .join(" ");
  return <polyline className={className} points={points} fill="none" />;
}

function Cursor({ step, maxStep }: { step: number; maxStep: number }): JSX.Element {
  const x = xForStep(step, maxStep);
  return (
    <g className="chart-cursor">
      <line x1={x} x2={x} y1={PAD_T - 4} y2={CHART_H - PAD_B + 4} />
      <circle cx={x} cy={PAD_T - 5} r={4} />
    </g>
  );
}

function AxisLabels({ maxStep }: { maxStep: number }): JSX.Element {
  return (
    <g className="axis-labels">
      <text x={PAD_L} y={CHART_H - 10}>0</text>
      <text x={CHART_W - PAD_R - 34} y={CHART_H - 10}>{maxStep} steps</text>
      <text x={8} y={PAD_T + 5}>100</text>
      <text x={10} y={CHART_H - PAD_B + 4}>0</text>
    </g>
  );
}

function LegendDot({ label, className }: { label: string; className: string }): JSX.Element {
  return (
    <span>
      <i className={className} />
      {label}
    </span>
  );
}

function ComponentBar({ label, value }: { label: string; value: number }): JSX.Element {
  const max = componentScale(label);
  const width = label === "Invalid" ? (value > 0 ? 100 : 0) : Math.min(100, (Math.abs(value) / max) * 100);
  return (
    <div className="component-row">
      <span>{label}</span>
      <div>
        <i className={value < 0 ? "negative" : "positive"} style={{ width: `${width}%` }} />
      </div>
      <strong>{formatComponent(label, value)}</strong>
    </div>
  );
}

function makePoints(manifest: ReplayManifest): ChartPoint[] {
  const first = manifest.events[0]?.before;
  if (!first) return [];
  return [
    {
      step: 0,
      reward: 0,
      score: first.metrics.score,
      cargo: first.metrics.cargoDelivered,
      profit: first.metrics.operatingProfit,
      cash: first.company.cash,
      action: "start",
    },
    ...manifest.events.map((event) => ({
      step: event.step,
      reward: event.reward,
      score: event.after.metrics.score,
      cargo: event.after.metrics.cargoDelivered,
      profit: event.after.metrics.operatingProfit,
      cash: event.after.company.cash,
      action: event.action.type,
    })),
  ];
}

function makeDomain(data: ChartPoint[]) {
  const rewards = data.map((point) => Math.abs(point.reward));
  const cargo = data.map((point) => point.cargo);
  const profit = data.map((point) => point.profit);
  return {
    maxAbsReward: Math.max(1, ...rewards),
    cargoMin: Math.min(0, ...cargo),
    cargoMax: Math.max(1, ...cargo),
    profitMin: Math.min(0, ...profit),
    profitMax: Math.max(1, ...profit),
  };
}

function makeTotals(manifest: ReplayManifest) {
  return {
    reward: manifest.events.reduce((total, event) => total + event.reward, 0),
    cargo: manifest.summary.cargoDelivered,
    profit: manifest.summary.operatingProfit,
  };
}

function xForStep(step: number, maxStep: number): number {
  const unit = maxStep <= 0 ? 0 : step / maxStep;
  return PAD_L + unit * (CHART_W - PAD_L - PAD_R);
}

function unscaleX(x: number, maxStep: number): number {
  const unit = (x - PAD_L) / Math.max(1, CHART_W - PAD_L - PAD_R);
  return unit * maxStep;
}

function yForUnit(unit: number): number {
  return PAD_T + clamp(unit, 0, 1) * (CHART_H - PAD_T - PAD_B);
}

function normalize(value: number, min: number, max: number): number {
  return (value - min) / Math.max(1e-6, max - min);
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function describeAction(event: ReplayEvent): string {
  const action = event.action;
  if (action.type === "build_route") return `Build ${action.mode} ${action.cargo}`;
  if (action.type === "add_vehicle") return `Add vehicle to ${action.routeId}`;
  if (action.type === "wait") return `Wait ${action.months} month${action.months === 1 ? "" : "s"}`;
  if (action.type === "take_loan") return `Take loan ${money(action.amount)}`;
  if (action.type === "repay_loan") return `Repay loan ${money(action.amount)}`;
  return "Invalid action";
}

function componentValue(event: ReplayEvent | null, key: string): number {
  return Number(event?.info.rewardDetails?.components?.[key] ?? 0);
}

function labelComponent(key: string): string {
  if (key === "scoreDelta") return "Score";
  if (key === "cargoDelta") return "Cargo";
  if (key === "profitDelta") return "Profit";
  if (key === "cashDelta") return "Cash";
  if (key === "loanDelta") return "Loan";
  return "Invalid";
}

function formatComponent(label: string, value: number): string {
  if (label === "Cash" || label === "Profit" || label === "Loan") return money(value);
  if (label === "Cargo") return value.toFixed(0);
  if (label === "Invalid") return value > 0 ? "yes" : "no";
  return formatSigned(value, 3);
}

function formatSigned(value: number, digits: number): string {
  const prefix = value > 0 ? "+" : "";
  return `${prefix}${value.toFixed(digits)}`;
}

function componentScale(label: string): number {
  if (label === "Score") return 10;
  if (label === "Cargo") return 500;
  if (label === "Cash" || label === "Profit" || label === "Loan") return 50_000;
  return 1;
}

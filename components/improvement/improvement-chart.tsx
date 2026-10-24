// The improvement chart: three per-version measures with error bars and a
// stacked bar of reviewed failure categories. Plain SVG with no hooks, so the
// page renders it and `pnpm chart` writes the very same markup to a file.
// Only the palette differs: theme variables on the page, fixed colours in the
// file (an image has no stylesheet to read them from).
import type { Measured, Sample, VersionPoint } from "../../src/improvement/series";

export type ChartPalette = {
  background: string;
  foreground: string;
  // Axis text, sample sizes, the line between points.
  muted: string;
  grid: string;
  // The foreground mixed into the background at this percentage: the
  // category shades, so no colour stands for anything but a verdict.
  mix: (percent: number) => string;
  font: string;
};

export const CHART_WIDTH = 960;
const TOP = 44;
const PANEL_H = 250;
const GAP = 24;
const BAR_TOP = TOP + PANEL_H + GAP;
const BAR_H = 300;
export const CHART_HEIGHT = BAR_TOP + BAR_H + 8;

const PAD = { left: 48, right: 12, top: 30, bottom: 46 };

const pct = (x: number) => `${(x * 100).toFixed(1)}%`;
// Three significant figures: per-try costs are fractions of a cent apart.
export const usd = (x: number) => (x === 0 ? "$0" : `$${Number(x.toPrecision(3))}`);

// The smallest of 1, 2, 2.5, 5 × a power of ten at or above v.
function niceMax(v: number): number {
  if (!(v > 0)) return 1;
  const magnitude = 10 ** Math.floor(Math.log10(v));
  return ([1, 2, 2.5, 5, 10].find((m) => m * magnitude >= v) ?? 10) * magnitude;
}

type LinePanelProps = {
  x: number;
  width: number;
  title: string;
  versions: VersionPoint[];
  pick: (v: VersionPoint) => Measured<Sample>;
  format: (x: number) => string;
  // Fixed top for rates of success; otherwise from the widest interval.
  max?: number;
  palette: ChartPalette;
};

function LinePanel({ x, width, title, versions, pick, format, max, palette: c }: LinePanelProps) {
  const plotW = width - PAD.left - PAD.right;
  const plotH = PANEL_H - PAD.top - PAD.bottom;
  const points = versions.map(pick);
  const top = max ?? niceMax(Math.max(0, ...points.flatMap((p) => (p.ok && Number.isFinite(p.estimate.hi) ? [p.estimate.hi] : []))) * 1.1);
  const ticks = [0, 0.25, 0.5, 0.75, 1].map((f) => f * top);
  const sx = (i: number) => x + PAD.left + ((i + 0.5) * plotW) / versions.length;
  const sy = (v: number) => TOP + PAD.top + plotH - (Math.min(v, top) / top) * plotH;
  const drawn = points.flatMap((p, i) => (p.ok ? [{ i, p }] : []));
  return (
    <g>
      <text x={x + PAD.left} y={TOP + 16} fontSize={13} fontWeight={600} style={{ fill: c.foreground }}>
        {title}
      </text>
      {ticks.map((t) => (
        <g key={t}>
          <line x1={x + PAD.left} x2={x + width - PAD.right} y1={sy(t)} y2={sy(t)} style={{ stroke: c.grid }} />
          <text x={x + PAD.left - 6} y={sy(t) + 3.5} fontSize={10} textAnchor="end" style={{ fill: c.muted }}>
            {format(t)}
          </text>
        </g>
      ))}
      {drawn.length > 1 && (
        <polyline points={drawn.map(({ i, p }) => `${sx(i)},${sy(p.estimate.value)}`).join(" ")} fill="none" strokeWidth={1} style={{ stroke: c.muted }} />
      )}
      {points.map((p, i) => {
        const v = versions[i];
        const cx = sx(i);
        const base = TOP + PANEL_H - PAD.bottom;
        return (
          <g key={v.version}>
            {p.ok ? (
              <g>
                <title>{`${v.version}: ${format(p.estimate.value)} (95% interval ${format(p.estimate.lo)}–${format(p.estimate.hi)}), ${p.tasks} tasks × ${p.tries} tries`}</title>
                <line x1={cx} x2={cx} y1={sy(p.estimate.lo)} y2={sy(p.estimate.hi)} strokeWidth={1.5} style={{ stroke: c.foreground }} />
                <line x1={cx - 5} x2={cx + 5} y1={sy(p.estimate.lo)} y2={sy(p.estimate.lo)} strokeWidth={1.5} style={{ stroke: c.foreground }} />
                <line x1={cx - 5} x2={cx + 5} y1={sy(p.estimate.hi)} y2={sy(p.estimate.hi)} strokeWidth={1.5} style={{ stroke: c.foreground }} />
                <circle cx={cx} cy={sy(p.estimate.value)} r={3.5} style={{ fill: c.foreground }} />
                <text x={cx} y={sy(p.estimate.hi) - 6} fontSize={10} textAnchor="middle" style={{ fill: c.foreground }}>
                  {format(p.estimate.value)}
                </text>
              </g>
            ) : (
              <text x={cx} y={sy(0) - 6} fontSize={10} textAnchor="middle" style={{ fill: c.muted }}>
                <title>{p.reason}</title>
                not measured
              </text>
            )}
            <text x={cx} y={base + 15} fontSize={11} textAnchor="middle" fontWeight={600} style={{ fill: c.foreground }}>
              {v.version}
            </text>
            <text x={cx} y={base + 29} fontSize={9.5} textAnchor="middle" style={{ fill: c.muted }}>
              {p.ok ? `${p.tasks}/${p.tries}` : "–"}
            </text>
          </g>
        );
      })}
    </g>
  );
}

const LEGEND_W = 210;

function CategoryPanel({ versions, palette: c }: { versions: VersionPoint[]; palette: ChartPalette }) {
  const plotW = CHART_WIDTH - PAD.left - PAD.right - LEGEND_W;
  const plotH = BAR_H - PAD.top - PAD.bottom - 14;
  const firstCounted = versions.find((v) => v.categories.ok)?.categories;
  const categories = firstCounted?.ok ? firstCounted.rows.map((r) => ({ id: r.id, name: r.name })) : [];
  // Darkest first, so the bottom of each bar is its heaviest category.
  const shade = (i: number) => c.mix(categories.length <= 1 ? 80 : 85 - (i * 65) / (categories.length - 1));
  const top = niceMax(Math.max(1, ...versions.map((v) => (v.categories.ok ? v.categories.failures : 0))));
  const slot = plotW / versions.length;
  const barW = Math.min(64, slot * 0.45);
  const sx = (i: number) => PAD.left + (i + 0.5) * slot;
  const base = BAR_TOP + PAD.top + plotH;
  const sh = (n: number) => (n / top) * plotH;
  const ticks = [0, 0.25, 0.5, 0.75, 1].map((f) => f * top).filter((t) => Number.isInteger(t));
  return (
    <g>
      <text x={PAD.left} y={BAR_TOP + 16} fontSize={13} fontWeight={600} style={{ fill: c.foreground }}>
        Failed dev tries by reviewed category
      </text>
      {ticks.map((t) => (
        <g key={t}>
          <line x1={PAD.left} x2={PAD.left + plotW} y1={base - sh(t)} y2={base - sh(t)} style={{ stroke: c.grid }} />
          <text x={PAD.left - 6} y={base - sh(t) + 3.5} fontSize={10} textAnchor="end" style={{ fill: c.muted }}>
            {t}
          </text>
        </g>
      ))}
      {versions.map((v, i) => {
        const cx = sx(i);
        const counted = v.categories;
        // This version's target, outlined on its own bar: set against the bar
        // before, what the fix removed.
        const outlined = new Set(v.targets === null ? [] : [v.targets]);
        let y = base;
        return (
          <g key={v.version}>
            {counted.ok ? (
              <g>
                {counted.rows.map((r, j) => {
                  if (r.count === 0) return null;
                  const h = sh(r.count);
                  y -= h;
                  return (
                    <g key={r.id}>
                      <title>{`${v.version}: ${r.name}, ${r.count} of ${counted.failures} failed tries`}</title>
                      <rect
                        x={cx - barW / 2}
                        y={y}
                        width={barW}
                        height={h}
                        strokeWidth={outlined.has(r.id) ? 2 : 0.5}
                        style={{ fill: shade(j), stroke: outlined.has(r.id) ? c.foreground : c.background }}
                      />
                      {h >= 13 && (
                        <text x={cx} y={y + h / 2 + 3.5} fontSize={10} textAnchor="middle" style={{ fill: j / Math.max(1, categories.length - 1) < 0.5 ? c.background : c.foreground }}>
                          {r.count}
                        </text>
                      )}
                    </g>
                  );
                })}
                {counted.notReviewed > 0 && (
                  <g>
                    <title>{`${v.version}: ${counted.notReviewed} failed tries not reviewed yet`}</title>
                    <rect
                      x={cx - barW / 2}
                      y={y - sh(counted.notReviewed)}
                      width={barW}
                      height={sh(counted.notReviewed)}
                      strokeDasharray="3 2"
                      style={{ fill: c.background, stroke: c.muted }}
                    />
                    {sh(counted.notReviewed) >= 13 && (
                      <text x={cx} y={y - sh(counted.notReviewed) / 2 + 3.5} fontSize={10} textAnchor="middle" style={{ fill: c.muted }}>
                        {counted.notReviewed}
                      </text>
                    )}
                  </g>
                )}
                <text x={cx + barW / 2 + 6} y={base - sh(counted.failures) + 3.5} fontSize={10} style={{ fill: c.muted }}>
                  {counted.failures} failed
                </text>
              </g>
            ) : (
              <text x={cx} y={base - 6} fontSize={10} textAnchor="middle" style={{ fill: c.muted }}>
                <title>{counted.reason}</title>
                not counted
              </text>
            )}
            <text x={cx} y={base + 15} fontSize={11} textAnchor="middle" fontWeight={600} style={{ fill: c.foreground }}>
              {v.version}
            </text>
            <text x={cx} y={base + 29} fontSize={9.5} textAnchor="middle" style={{ fill: c.muted }}>
              {counted.ok ? `reviewed ${counted.reviewed} of ${counted.failures}` : "–"}
            </text>
            {v.targets !== null && (
              <text x={cx} y={base + 43} fontSize={9.5} textAnchor="middle" style={{ fill: c.muted }}>
                aimed at {categories.find((k) => k.id === v.targets)?.name ?? v.targets}
              </text>
            )}
          </g>
        );
      })}
      <g>
        {[...categories.map((k, j) => ({ key: k.id, name: k.name, fill: shade(j), dashed: false })), { key: "not-reviewed", name: "not reviewed yet", fill: c.background, dashed: true }].map(
          (row, j) => {
            const lx = CHART_WIDTH - LEGEND_W + 8;
            const ly = BAR_TOP + PAD.top + j * 18;
            return (
              <g key={row.key}>
                <rect x={lx} y={ly} width={12} height={12} strokeDasharray={row.dashed ? "3 2" : undefined} style={{ fill: row.fill, stroke: row.dashed ? c.muted : c.background }} />
                <text x={lx + 18} y={ly + 10} fontSize={10.5} style={{ fill: c.foreground }}>
                  {row.name}
                </text>
              </g>
            );
          },
        )}
        <text x={CHART_WIDTH - LEGEND_W + 8} y={BAR_TOP + PAD.top + (categories.length + 1) * 18 + 12} fontSize={10} style={{ fill: c.muted }}>
          Outlined: the category
        </text>
        <text x={CHART_WIDTH - LEGEND_W + 8} y={BAR_TOP + PAD.top + (categories.length + 1) * 18 + 26} fontSize={10} style={{ fill: c.muted }}>
          that version aimed at.
        </text>
      </g>
    </g>
  );
}

export function ImprovementChart({ versions, palette }: { versions: VersionPoint[]; palette: ChartPalette }) {
  const third = CHART_WIDTH / 3;
  const datasets = [...new Set(versions.map((v) => v.datasetVersion))].join(", ");
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox={`0 0 ${CHART_WIDTH} ${CHART_HEIGHT}`}
      width={CHART_WIDTH}
      height={CHART_HEIGHT}
      role="img"
      aria-label={`Holdout success, hallucination rate, cost per success and failure categories for versions ${versions.map((v) => v.version).join(", ")}`}
      style={{ fontFamily: palette.font, maxWidth: "100%", height: "auto", background: palette.background }}
    >
      <rect x={0} y={0} width={CHART_WIDTH} height={CHART_HEIGHT} style={{ fill: palette.background }} />
      <text x={PAD.left} y={20} fontSize={15} fontWeight={600} style={{ fill: palette.foreground }}>
        Promoted agent versions
      </text>
      <text x={PAD.left} y={36} fontSize={10.5} style={{ fill: palette.muted }}>
        Dataset {datasets}. Bars are 95% bootstrap intervals over tasks; under each point, tasks/tries it is from. Only versions that passed the gate are drawn.
      </text>
      <LinePanel x={0} width={third} title="Holdout success" versions={versions} pick={(v) => v.holdout} format={pct} max={1} palette={palette} />
      <LinePanel x={third} width={third} title="Replies with a hallucination (dev)" versions={versions} pick={(v) => v.hallucination} format={pct} palette={palette} />
      <LinePanel x={2 * third} width={third} title="Cost per successful try (dev, USD)" versions={versions} pick={(v) => v.cost} format={usd} palette={palette} />
      <CategoryPanel versions={versions} palette={palette} />
    </svg>
  );
}

// Fixed light colours for the exported image.
const hex = (n: number) => Math.round(n).toString(16).padStart(2, "0");
const INK = [31, 31, 31];
const PAPER = [255, 255, 255];
export const EXPORT_PALETTE: ChartPalette = {
  background: "#ffffff",
  foreground: "#1f1f1f",
  muted: "#6b6b6b",
  grid: "#e6e6e6",
  mix: (percent) => `#${INK.map((v, i) => hex((v * percent + PAPER[i] * (100 - percent)) / 100)).join("")}`,
  font: "ui-sans-serif, system-ui, -apple-system, 'Segoe UI', Helvetica, Arial, sans-serif",
};

// The page follows the theme, light or dark.
export const PAGE_PALETTE: ChartPalette = {
  background: "var(--background)",
  foreground: "var(--foreground)",
  muted: "var(--muted-foreground)",
  grid: "var(--border)",
  mix: (percent) => `color-mix(in oklch, var(--foreground) ${percent}%, var(--background))`,
  font: "inherit",
};

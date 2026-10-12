import { VOLTAGE_HIGH, VOLTAGE_LOW, buildForecastSeries, formatTimestamp, getVoltageMagnitude } from "../utils/scada.js";

const chartWidth = 640;
const chartHeight = 260;
const pad = { top: 18, right: 24, bottom: 32, left: 44 };

function scaleY(value) {
  const min = 0.9;
  const max = 1.08;
  return pad.top + (max - value) * ((chartHeight - pad.top - pad.bottom) / (max - min));
}

function linePath(points) {
  return points
    .map((point, index) => `${index === 0 ? "M" : "L"} ${point.x.toFixed(1)} ${point.y.toFixed(1)}`)
    .join(" ");
}

function ForecastChart({ node, history, prediction }) {
  const measured = history
    .map((measurement, index) => ({
      index,
      timestamp: measurement.timestamp,
      value: getVoltageMagnitude(measurement, node?.phases),
    }))
    .filter((point) => Number.isFinite(point.value))
    .slice(-32);
  const forecast = buildForecastSeries(prediction, node?.phases);
  const all = [...measured, ...forecast];
  const plotWidth = chartWidth - pad.left - pad.right;
  const denominator = Math.max(all.length - 1, 1);
  const measuredPoints = measured.map((point, index) => ({
    ...point,
    x: pad.left + index * (plotWidth / denominator),
    y: scaleY(point.value),
  }));
  const forecastPoints = forecast.map((point, index) => ({
    ...point,
    x: pad.left + (measured.length + index) * (plotWidth / denominator),
    y: scaleY(point.value),
  }));

  return (
    <section className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="text-sm font-medium text-slate-500">Forecast plot</p>
          <h2 className="mt-1 text-lg font-semibold text-slate-950">Node {node?.id ?? "--"} voltage</h2>
        </div>
        <div className="text-right text-xs text-slate-500">
          <p>Measured + predicted</p>
          <p>{formatTimestamp(prediction?.originTimestamp)}</p>
        </div>
      </div>

      <div className="mt-4 overflow-hidden rounded-md border border-slate-200 bg-slate-50">
        <svg viewBox={`0 0 ${chartWidth} ${chartHeight}`} className="h-72 w-full" role="img" aria-label="Voltage forecast chart">
          {[0.92, VOLTAGE_LOW, 1.0, VOLTAGE_HIGH].map((tick) => (
            <g key={tick}>
              <line
                x1={pad.left}
                x2={chartWidth - pad.right}
                y1={scaleY(tick)}
                y2={scaleY(tick)}
                stroke={tick === VOLTAGE_LOW || tick === VOLTAGE_HIGH ? "#ef4444" : "#cbd5e1"}
                strokeDasharray={tick === VOLTAGE_LOW || tick === VOLTAGE_HIGH ? "6 5" : undefined}
              />
              <text x="10" y={scaleY(tick) + 4} className="fill-slate-500 text-[11px]">
                {tick.toFixed(2)}
              </text>
            </g>
          ))}

          {measuredPoints.length > 1 && (
            <path d={linePath(measuredPoints)} fill="none" stroke="#2563eb" strokeWidth="3" />
          )}
          {forecastPoints.length > 1 && (
            <path d={linePath(forecastPoints)} fill="none" stroke="#f97316" strokeWidth="3" strokeDasharray="7 5" />
          )}
          {forecastPoints[0] && measuredPoints.at(-1) && (
            <line
              x1={measuredPoints.at(-1).x}
              y1={measuredPoints.at(-1).y}
              x2={forecastPoints[0].x}
              y2={forecastPoints[0].y}
              stroke="#f97316"
              strokeWidth="2"
              strokeDasharray="4 5"
            />
          )}
          {[...measuredPoints, ...forecastPoints].map((point, index) => (
            <circle
              key={`${point.timestamp}-${index}`}
              cx={point.x}
              cy={point.y}
              r="3"
              fill={index < measuredPoints.length ? "#2563eb" : "#f97316"}
            />
          ))}
        </svg>
      </div>

      <div className="mt-3 flex items-center gap-4 text-xs font-medium text-slate-600">
        <span className="inline-flex items-center gap-2"><span className="h-0.5 w-6 bg-blue-600" />Measured</span>
        <span className="inline-flex items-center gap-2"><span className="h-0.5 w-6 border-t-2 border-dashed border-orange-500" />Predicted</span>
      </div>
    </section>
  );
}

export default ForecastChart;

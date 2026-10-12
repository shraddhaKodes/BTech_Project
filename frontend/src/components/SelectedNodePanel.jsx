import { formatPu, formatTimestamp, phaseList } from "../utils/scada.js";

function SelectedNodePanel({ node, measurement }) {
  const phases = phaseList(node?.phases);

  return (
    <section className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-sm font-medium text-slate-500">Selected node</p>
          <h2 className="mt-1 text-2xl font-semibold text-slate-950">{node?.id ?? "--"}</h2>
        </div>
        {node?.id === "150" && (
          <span className="rounded-full bg-slate-900 px-3 py-1 text-xs font-semibold text-white">Substation</span>
        )}
      </div>

      {!measurement && (
        <p className="mt-4 rounded-md bg-amber-50 px-3 py-2 text-sm text-amber-800">
          No stored measurement for this bus yet.
        </p>
      )}

      <div className="mt-5 grid grid-cols-3 gap-2">
        {phases.map((phase) => (
          <div key={phase} className="rounded-md border border-slate-200 bg-slate-50 p-3">
            <p className="text-xs font-semibold uppercase text-slate-500">Phase {phase}</p>
            <p className="mt-2 text-lg font-semibold text-slate-950">
              {formatPu(measurement?.voltage?.[phase]?.magnitude)}
            </p>
            <p className="text-xs text-slate-500">pu</p>
          </div>
        ))}
      </div>

      <dl className="mt-5 grid grid-cols-2 gap-3 text-sm">
        <div>
          <dt className="text-slate-500">Load factor</dt>
          <dd className="font-semibold text-slate-950">
            {Number.isFinite(measurement?.loadFactor) ? measurement.loadFactor.toFixed(3) : "--"}
          </dd>
        </div>
        <div>
          <dt className="text-slate-500">Step</dt>
          <dd className="font-semibold text-slate-950">{measurement?.step ?? "--"}</dd>
        </div>
        <div className="col-span-2">
          <dt className="text-slate-500">Timestamp</dt>
          <dd className="break-words font-semibold text-slate-950">{formatTimestamp(measurement?.timestamp)}</dd>
        </div>
      </dl>
    </section>
  );
}

export default SelectedNodePanel;

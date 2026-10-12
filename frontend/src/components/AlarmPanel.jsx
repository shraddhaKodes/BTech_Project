import { formatPu, formatTimestamp } from "../utils/scada.js";

function AlarmPanel({ alarms }) {
  return (
    <section className="rounded-lg border border-slate-200 bg-white shadow-sm">
      <div className="border-b border-slate-200 px-5 py-4">
        <p className="text-sm font-medium text-slate-500">Alarms</p>
        <h2 className="mt-1 text-lg font-semibold text-slate-950">Predicted voltage excursions</h2>
      </div>

      {alarms.length === 0 ? (
        <p className="px-5 py-6 text-sm text-slate-600">No forecasted limit violations.</p>
      ) : (
        <div className="max-h-80 overflow-y-auto">
          {alarms.map((alarm, index) => (
            <div key={`${alarm.bus}-${alarm.phase}-${alarm.step}-${index}`} className="border-b border-slate-100 px-5 py-3 last:border-0">
              <div className="flex items-center justify-between gap-3">
                <p className="font-semibold text-slate-950">Node {alarm.bus} phase {alarm.phase}</p>
                <span className="rounded-full bg-red-50 px-2 py-1 text-xs font-semibold text-red-700">
                  {formatPu(alarm.value)} pu
                </span>
              </div>
              <p className="mt-1 text-xs text-slate-500">
                Step {alarm.step ?? "--"} at {formatTimestamp(alarm.timestamp)}
              </p>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}

export default AlarmPanel;

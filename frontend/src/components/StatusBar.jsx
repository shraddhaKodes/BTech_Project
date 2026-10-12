import { formatTimestamp } from "../utils/scada.js";

const statusClass = {
  checking: "bg-amber-500",
  connected: "bg-green-600",
  disconnected: "bg-red-600",
  mock: "bg-blue-600",
};

function StatusBar({ connectionState, lastUpdate, messageCount, error, isMock }) {
  return (
    <footer className="sticky bottom-0 z-10 mt-6 rounded-lg border border-slate-200 bg-white px-4 py-3 shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-3 text-sm">
        <div className="flex flex-wrap items-center gap-3">
          <span className="inline-flex items-center gap-2 font-semibold text-slate-900">
            <span className={`h-2.5 w-2.5 rounded-full ${statusClass[connectionState] ?? "bg-slate-400"}`} />
            {isMock ? "Mock stream" : connectionState}
          </span>
          {isMock && (
            <span className="rounded-full bg-blue-50 px-2.5 py-1 text-xs font-bold text-blue-700">MOCK DATA</span>
          )}
          {error && <span className="text-red-700">{error}</span>}
        </div>
        <div className="flex flex-wrap gap-4 text-slate-600">
          <span>Last update: <strong className="text-slate-950">{formatTimestamp(lastUpdate)}</strong></span>
          <span>Messages: <strong className="text-slate-950">{messageCount}</strong></span>
        </div>
      </div>
    </footer>
  );
}

export default StatusBar;

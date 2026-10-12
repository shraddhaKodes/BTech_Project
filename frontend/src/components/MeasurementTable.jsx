const columns = [
  { label: "Time", value: (measurement) => formatTimestamp(measurement.timestamp) },
  { label: "Bus", value: (measurement) => measurement.bus },
  { label: "Step", value: (measurement) => measurement.step },
  { label: "Phase A (pu)", value: (measurement) => measurement.voltage?.a?.magnitude, precision: 6 },
  { label: "Phase B (pu)", value: (measurement) => measurement.voltage?.b?.magnitude, precision: 6 },
  { label: "Phase C (pu)", value: (measurement) => measurement.voltage?.c?.magnitude, precision: 6 },
];

function formatTimestamp(timestamp) {
  if (!timestamp) {
    return "—";
  }

  const date = new Date(timestamp);
  return Number.isNaN(date.getTime()) ? String(timestamp) : date.toLocaleString();
}

function formatValue(value, precision) {
  if (value === null || value === undefined) {
    return "—";
  }

  if (precision !== undefined && Number.isFinite(value)) {
    return value.toFixed(precision);
  }

  return String(value);
}

function MeasurementTable({ measurements }) {
  return (
    <section className="mt-5 rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
      <div className="mb-4 flex items-center justify-between gap-3">
        <div>
          <p className="text-sm font-medium text-slate-500">Stored telemetry</p>
          <h2 className="mt-1 text-lg font-semibold text-slate-950">Recent measurements</h2>
        </div>
        <span className="text-sm text-slate-500">{measurements.length} records loaded</span>
      </div>

      {measurements.length === 0 ? (
        <p className="rounded-md bg-slate-50 px-4 py-6 text-center text-sm text-slate-600">
          No measurements are stored yet. Check the backend connection and MongoDB status.
        </p>
      ) : (
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-slate-200 text-left text-sm">
            <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-600">
              <tr>
                {columns.map((column) => (
                  <th key={column.label} scope="col" className="whitespace-nowrap px-4 py-3 font-semibold">
                    {column.label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {measurements.map((measurement, index) => (
                <tr
                  key={measurement._id || `${measurement.bus}-${measurement.step}-${measurement.timestamp}-${index}`}
                  className="whitespace-nowrap text-slate-700"
                >
                  {columns.map((column) => (
                    <td key={column.label} className="px-4 py-3">
                      {formatValue(column.value(measurement), column.precision)}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

export default MeasurementTable;

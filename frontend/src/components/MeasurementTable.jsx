const columns = [
  { label: "Timestamp", value: (measurement) => formatTimestamp(measurement.timestamp) },
  { label: "Frequency", value: (measurement) => measurement.frequency },
  { label: "Voltage A mag.", value: (measurement) => measurement.voltage?.a?.magnitude },
  { label: "Voltage A angle", value: (measurement) => measurement.voltage?.a?.angle },
  { label: "Voltage B mag.", value: (measurement) => measurement.voltage?.b?.magnitude },
  { label: "Voltage B angle", value: (measurement) => measurement.voltage?.b?.angle },
  { label: "Voltage C mag.", value: (measurement) => measurement.voltage?.c?.magnitude },
  { label: "Voltage C angle", value: (measurement) => measurement.voltage?.c?.angle },
  { label: "Active power", value: (measurement) => measurement.power?.active },
  { label: "Reactive power", value: (measurement) => measurement.power?.reactive },
];

function formatTimestamp(timestamp) {
  if (!timestamp) {
    return "—";
  }

  const date = new Date(timestamp);
  return Number.isNaN(date.getTime()) ? String(timestamp) : date.toLocaleString();
}

function formatValue(value) {
  return value === null || value === undefined ? "—" : String(value);
}

function MeasurementTable({ measurements }) {
  return (
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
              key={measurement._id || `${measurement.timestamp || "record"}-${index}`}
              className="whitespace-nowrap text-slate-700"
            >
              {columns.map((column) => (
                <td key={column.label} className="px-4 py-3">
                  {formatValue(column.value(measurement))}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export default MeasurementTable;

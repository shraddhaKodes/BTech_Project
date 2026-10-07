const statusDetails = {
  checking: {
    label: "Checking connection",
    className: "bg-amber-50 text-amber-800",
    indicatorClassName: "bg-amber-500",
  },
  connected: {
    label: "Connected",
    className: "bg-green-50 text-green-800",
    indicatorClassName: "bg-green-500",
  },
  disconnected: {
    label: "Disconnected",
    className: "bg-red-50 text-red-800",
    indicatorClassName: "bg-red-500",
  },
};

function BackendStatus({ status, error }) {
  const details = statusDetails[status];

  return (
    <div className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
      <p className="text-sm font-medium text-slate-500">Backend status</p>
      <p
        className={`mt-2 inline-flex items-center gap-2 rounded-full px-3 py-1 text-sm font-medium ${details.className}`}
        role="status"
      >
        <span
          aria-hidden="true"
          className={`h-2 w-2 rounded-full ${details.indicatorClassName}`}
        />
        {details.label}
      </p>
      {error && <p className="mt-2 break-words text-sm text-red-700">{error}</p>}
    </div>
  );
}

export default BackendStatus;

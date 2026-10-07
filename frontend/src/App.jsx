import { useCallback, useEffect, useState } from "react";
import { getHealth, getMeasurements } from "./api/api.js";
import BackendStatus from "./components/BackendStatus.jsx";
import MeasurementTable from "./components/MeasurementTable.jsx";

function App() {
  const [backendStatus, setBackendStatus] = useState("checking");
  const [healthError, setHealthError] = useState("");
  const [measurements, setMeasurements] = useState([]);
  const [measurementsError, setMeasurementsError] = useState("");
  const [isLoading, setIsLoading] = useState(true);

  const loadMeasurements = useCallback(() => getMeasurements(), []);

  const refreshMeasurements = useCallback(() => {
    setIsLoading(true);
    setMeasurementsError("");

    loadMeasurements()
      .then((result) => {
        setMeasurements(result);
      })
      .catch((error) => {
        setMeasurementsError(error.message);
      })
      .finally(() => {
        setIsLoading(false);
      });
  }, [loadMeasurements]);

  useEffect(() => {
    let isCurrent = true;

    getHealth()
      .then(() => {
        if (isCurrent) {
          setBackendStatus("connected");
          setHealthError("");
        }
      })
      .catch((error) => {
        if (isCurrent) {
          setBackendStatus("disconnected");
          setHealthError(error.message);
        }
      });

    loadMeasurements()
      .then((result) => {
        if (isCurrent) {
          setMeasurements(result);
          setMeasurementsError("");
          setIsLoading(false);
        }
      })
      .catch((error) => {
        if (isCurrent) {
          setMeasurementsError(error.message);
          setIsLoading(false);
        }
      });

    return () => {
      isCurrent = false;
    };
  }, [loadMeasurements]);

  return (
    <main className="min-h-screen bg-slate-50 px-4 py-10 text-slate-900 sm:px-6 lg:px-8">
      <div className="mx-auto max-w-7xl">
        <header className="mb-8">
          <p className="text-sm font-semibold uppercase tracking-wide text-blue-700">
            Backend integration
          </p>
          <h1 className="mt-2 text-3xl font-bold tracking-tight">
            Measurements
          </h1>
          <p className="mt-2 text-slate-600">
            Live data returned by the backend measurements API.
          </p>
        </header>

        <section className="mb-6 grid gap-4 sm:grid-cols-2">
          <BackendStatus status={backendStatus} error={healthError} />
          <div className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
            <p className="text-sm font-medium text-slate-500">
              Measurements returned
            </p>
            <p className="mt-2 text-3xl font-semibold">
              {measurements.length}
            </p>
          </div>
        </section>

        <section className="overflow-hidden rounded-lg border border-slate-200 bg-white shadow-sm">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 px-5 py-4">
            <h2 className="text-lg font-semibold">Measurement records</h2>
            <button
              type="button"
              onClick={refreshMeasurements}
              disabled={isLoading}
              className="rounded-md bg-blue-700 px-4 py-2 text-sm font-medium text-white transition hover:bg-blue-800 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {isLoading ? "Refreshing..." : "Refresh"}
            </button>
          </div>

          {measurementsError ? (
            <p role="alert" className="m-5 rounded-md bg-red-50 p-4 text-sm text-red-800">
              Could not load measurements: {measurementsError}
            </p>
          ) : isLoading ? (
            <p className="p-6 text-sm text-slate-600" role="status">
              Loading measurements...
            </p>
          ) : measurements.length === 0 ? (
            <p className="p-6 text-sm text-slate-600">
              No measurement records found.
            </p>
          ) : (
            <MeasurementTable measurements={measurements} />
          )}
        </section>
      </div>
    </main>
  );
}

export default App;

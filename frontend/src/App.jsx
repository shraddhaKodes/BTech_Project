import { useMemo, useState } from "react";
import AlarmPanel from "./components/AlarmPanel.jsx";
import FeederGraph from "./components/FeederGraph.jsx";
import ForecastChart from "./components/ForecastChart.jsx";
import MeasurementTable from "./components/MeasurementTable.jsx";
import SelectedNodePanel from "./components/SelectedNodePanel.jsx";
import StatusBar from "./components/StatusBar.jsx";
import topology from "./data/feeder_topology.json";
import { useScadaStream } from "./hooks/useScadaStream.js";
import { buildAlarmList, buildMeasurementMaps } from "./utils/scada.js";

function App() {
  const busNodes = useMemo(
    () => topology.nodes.filter((node) => node.kind === "bus"),
    []
  );
  const nodesById = useMemo(
    () => new Map(topology.nodes.map((node) => [node.id, node])),
    []
  );
  const [selectedBus, setSelectedBus] = useState("150");
  const stream = useScadaStream(topology.nodes);
  const { latestByBus, historyByBus } = useMemo(
    () => buildMeasurementMaps(stream.measurements),
    [stream.measurements]
  );
  const selectedNode = nodesById.get(selectedBus) ?? busNodes[0];
  const selectedMeasurement = latestByBus.get(selectedNode.id);
  const selectedHistory = historyByBus.get(selectedNode.id) ?? [];
  const selectedPrediction = stream.predictionsByBus.get(selectedNode.id);
  const alarms = useMemo(
    () => buildAlarmList(stream.predictionsByBus, nodesById),
    [stream.predictionsByBus, nodesById]
  );

  return (
    <main className="min-h-screen bg-slate-100 px-4 py-5 text-slate-900 sm:px-6 lg:px-8">
      <div className="mx-auto max-w-[1800px]">
        <header className="mb-5 flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="text-sm font-semibold uppercase tracking-wide text-blue-700">
              Web SCADA dashboard
            </p>
            <h1 className="mt-1 text-3xl font-bold tracking-tight text-slate-950">
              IEEE 123-node feeder monitor
            </h1>
          </div>
          {stream.isMock && (
            <span className="rounded-full bg-blue-700 px-4 py-2 text-sm font-bold text-white shadow-sm">
              MOCK DATA
            </span>
          )}
        </header>

        <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_430px]">
          <FeederGraph
            topology={topology}
            latestByBus={latestByBus}
            selectedBus={selectedNode.id}
            onSelectBus={setSelectedBus}
          />

          <div className="grid content-start gap-5">
            <SelectedNodePanel node={selectedNode} measurement={selectedMeasurement} />
            <ForecastChart
              node={selectedNode}
              history={selectedHistory}
              prediction={selectedPrediction}
            />
            <AlarmPanel alarms={alarms} />
          </div>
        </div>

        <MeasurementTable measurements={stream.measurements} />

        <StatusBar
          connectionState={stream.connectionState}
          lastUpdate={stream.lastUpdate}
          messageCount={stream.messageCount}
          error={stream.error}
          isMock={stream.isMock}
        />
      </div>
    </main>
  );
}

export default App;

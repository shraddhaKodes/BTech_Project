const j = async (url) => { const r = await fetch(url); if (!r.ok) throw new Error(`${url} → ${r.status}`); return r.json(); };
export const getBuses = () => j('/api/buses');
export const getHistory = (id, seconds = 60) => j(`/api/buses/${id}/history?seconds=${seconds}`);
export const patchBus = (id, body) =>
  fetch(`/api/buses/${id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }).then((r) => r.json());

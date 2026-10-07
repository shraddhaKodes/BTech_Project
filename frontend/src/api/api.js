const API_BASE_URL = (
  import.meta.env.VITE_API_BASE_URL || "http://localhost:5000"
).replace(/\/+$/, "");

async function getJson(path) {
  let response;

  try {
    response = await fetch(`${API_BASE_URL}${path}`);
  } catch (error) {
    throw new Error(
      `Could not reach the backend at ${API_BASE_URL}. ${error.message}`
    );
  }

  if (!response.ok) {
    throw new Error(`Backend request failed with status ${response.status}.`);
  }

  return response.json();
}

export function getHealth() {
  return getJson("/api/health");
}

export async function getMeasurements() {
  const measurements = await getJson("/api/measurements");

  if (!Array.isArray(measurements)) {
    throw new Error("The measurements API returned an unexpected response.");
  }

  return measurements;
}

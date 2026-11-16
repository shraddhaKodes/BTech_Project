import mongoose from 'mongoose';

/** Static description of a bus/"house". Seeded from data/network.json, editable (name/notes) via the API. */
const BusSchema = new mongoose.Schema({
  _id: Number,                      // bus number (e.g. 83)
  name: String,
  notes: String,
  kind: String,                     // house | commercial | substation | empty
  P_kW: Number, Q_kvar: Number,
  loadType: String, phases: Number, connection: String, capKvar: Number,
  measured: Boolean,
  x: Number, z: Number,
  neighbors: [Number],
}, { versionKey: false });

export const Bus = mongoose.models.Bus || mongoose.model('Bus', BusSchema);

export async function seedBuses(nodes) {
  const ops = nodes.map(({ id, ...rest }) => ({
    updateOne: {
      filter: { _id: id },
      update: { $set: rest, $setOnInsert: { name: `Bus ${id}` } },   // keep user-edited names
      upsert: true,
    },
  }));
  await Bus.bulkWrite(ops, { ordered: false });
}

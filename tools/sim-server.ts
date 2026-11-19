// Виртуальный Wi-Fi ELM327 на TCP (по умолчанию 127.0.0.1:35000) — для проверки приложения без железа:
//   npm run sim-server
import net from "node:net";
import { SimulatedAdapter } from "../src/core/sim/simulator";
import { DEMO_VEHICLES } from "../src/core/sim/vehicles";

const port = Number(process.env.PORT ?? 35000);
const index = Number(process.env.VEHICLE ?? 0) % DEMO_VEHICLES.length;

net
  .createServer((socket) => {
    const sim = new SimulatedAdapter(structuredClone(DEMO_VEHICLES[index]));
    void sim.connect();
    sim.onData((text) => socket.write(Buffer.from(text, "latin1")));
    socket.on("data", (buf) => void sim.write(buf.toString("latin1")));
    socket.on("close", () => void sim.disconnect());
    socket.on("error", () => undefined);
  })
  .listen(port, "127.0.0.1", () => console.log(`Виртуальный ELM327 (${DEMO_VEHICLES[index].label}) слушает 127.0.0.1:${port}`));

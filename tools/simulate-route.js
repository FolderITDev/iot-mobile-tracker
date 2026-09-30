#!/usr/bin/env node
/*
 * Simula un vehículo recorriendo un trayecto y envía el estado a Losant
 * (atributos: location "lat,lng", speed km/h, heading grados).
 *
 * Credenciales: se leen de `.env` en la raíz del proyecto (ver `.env.example`).
 * Las variables ya definidas en el entorno tienen prioridad sobre el archivo.
 *
 * Uso:
 *   node tools/simulate-route.js            # una vuelta
 *   node tools/simulate-route.js --loop     # ida y vuelta sin fin
 *   node tools/simulate-route.js --interval 3000
 *   node tools/simulate-route.js --env .env.camion2   # otro dispositivo
 *
 * Requiere Node 20.12+ (fetch y process.loadEnvFile nativos). La access key debe permitir a ese dispositivo.
 */

const fs = require('fs');
const path = require('path');

const args = process.argv.slice(2);
const envArg = args.includes('--env') ? args[args.indexOf('--env') + 1] : null;
const ENV_FILE = envArg ? path.resolve(envArg) : path.join(__dirname, '..', '.env');
if (fs.existsSync(ENV_FILE)) process.loadEnvFile(ENV_FILE);
else if (envArg) {
  console.error(`No existe el archivo ${ENV_FILE}`);
  process.exit(1);
}

const APP_ID = process.env.LOSANT_APP_ID || '6aba5ddb95f06d429224e087';
const DEVICE_ID = process.env.LOSANT_DEVICE_ID;
const KEY = process.env.LOSANT_ACCESS_KEY;
const SECRET = process.env.LOSANT_ACCESS_SECRET;
const API = 'https://api.losant.com';

const LOOP = args.includes('--loop');
const INTERVAL = Number(args[args.indexOf('--interval') + 1]) || 5000;

// Trayecto en cuadrícula (~50 m entre puntos) desde -31.601764,-60.667957
const ROUTE = [
  [-31.601764, -60.667957], [-31.601314, -60.667957], [-31.600864, -60.667957],
  [-31.600414, -60.667957], [-31.599964, -60.667957], [-31.599514, -60.667957],
  [-31.599064, -60.667957], [-31.598614, -60.667957], [-31.598164, -60.667957],
  [-31.598164, -60.667427], [-31.598164, -60.666897], [-31.598164, -60.666367],
  [-31.598164, -60.665837], [-31.598164, -60.665307], [-31.598164, -60.664777],
  [-31.597714, -60.664777], [-31.597264, -60.664777], [-31.596814, -60.664777],
  [-31.596364, -60.664777], [-31.595914, -60.664777], [-31.595464, -60.664777],
  [-31.595464, -60.665307], [-31.595464, -60.665837], [-31.595464, -60.666367],
  [-31.595464, -60.666897], [-31.595014, -60.666897], [-31.594564, -60.666897],
  [-31.594114, -60.666897], [-31.593664, -60.666897], [-31.593664, -60.666367],
  [-31.593664, -60.665837], [-31.593664, -60.665307], [-31.593664, -60.664777],
  [-31.593664, -60.664247], [-31.593664, -60.663717], [-31.593664, -60.663187],
  [-31.593664, -60.662657], [-31.593664, -60.662127], [-31.593664, -60.661597],
  [-31.594114, -60.661597], [-31.594564, -60.661597], [-31.595014, -60.661597],
  [-31.595464, -60.661597], [-31.595914, -60.661597], [-31.596364, -60.661597]
];

const toRad = (d) => d * Math.PI / 180;

function distanceM([lat1, lng1], [lat2, lng2]) {
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return 2 * 6371000 * Math.asin(Math.sqrt(h));
}

function bearing([lat1, lng1], [lat2, lng2]) {
  const y = Math.sin(toRad(lng2 - lng1)) * Math.cos(toRad(lat2));
  const x = Math.cos(toRad(lat1)) * Math.sin(toRad(lat2)) -
    Math.sin(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.cos(toRad(lng2 - lng1));
  return (Math.atan2(y, x) * 180 / Math.PI + 360) % 360;
}

async function authenticate() {
  const res = await fetch(`${API}/auth/device`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify({ deviceId: DEVICE_ID, key: KEY, secret: SECRET })
  });
  if (!res.ok) throw new Error(`Auth falló: HTTP ${res.status} ${await res.text()}`);
  return (await res.json()).token;
}

async function sendState(token, data) {
  const res = await fetch(`${API}/applications/${APP_ID}/devices/${DEVICE_ID}/state`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify({ data })
  });
  if (!res.ok) throw new Error(`Envío falló: HTTP ${res.status} ${await res.text()}`);
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function main() {
  if (!DEVICE_ID || !KEY || !SECRET) {
    console.error('Faltan LOSANT_DEVICE_ID, LOSANT_ACCESS_KEY o LOSANT_ACCESS_SECRET.');
    process.exit(1);
  }
  const token = await authenticate();
  let route = ROUTE;
  do {
    for (let i = 0; i < route.length; i++) {
      const cur = route[i];
      const next = route[i + 1];
      const prev = route[i - 1];
      const heading = bearing(prev || cur, next || cur);
      const speed = next ? distanceM(cur, next) / (INTERVAL / 1000) * 3.6 : 0;
      const data = {
        location: `${cur[0]},${cur[1]}`,
        speed: Math.round(speed),
        heading: Math.round(heading)
      };
      await sendState(token, data);
      console.log(`[${i + 1}/${route.length}] ${data.location}  ${data.speed} km/h  ${data.heading}°`);
      if (next) await sleep(INTERVAL);
    }
    route = [...route].reverse();
    if (LOOP) await sleep(INTERVAL);
  } while (LOOP);
}

main().catch((err) => {
  console.error(err.message);
  process.exit(1);
});

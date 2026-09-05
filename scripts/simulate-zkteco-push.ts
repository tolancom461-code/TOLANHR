import { formatRiyadhDateTime } from '../server/biometric/zkteco-push-parser';

const baseUrl = (process.env.BIOMETRIC_BASE_URL || 'http://localhost:3000').replace(/\/$/, '');
const serial = process.env.BIOMETRIC_SERIAL || 'MB2000-TEST-001';
const pin = process.env.BIOMETRIC_PIN || '60001';
const status = process.env.BIOMETRIC_STATUS || '0';
const verify = process.env.BIOMETRIC_VERIFY || '1';
const punchTime = process.env.BIOMETRIC_PUNCH_TIME || formatRiyadhDateTime(new Date());

async function main() {
  console.log(`[Simulator] Handshake: ${serial}`);
  const handshake = await fetch(`${baseUrl}/iclock/cdata?SN=${encodeURIComponent(serial)}&options=all`);
  console.log(`[Simulator] Handshake HTTP ${handshake.status}`);
  console.log(await handshake.text());

  const line = `${pin}\t${punchTime}\t${status}\t${verify}\t0`;
  console.log(`[Simulator] Sending ATTLOG: ${line}`);
  const response = await fetch(`${baseUrl}/iclock/cdata?SN=${encodeURIComponent(serial)}&table=ATTLOG&Stamp=9999`, {
    method: 'POST',
    headers: { 'content-type': 'text/plain' },
    body: line,
  });
  console.log(`[Simulator] Upload HTTP ${response.status}: ${await response.text()}`);
}

main().catch(error => {
  console.error('[Simulator] Failed:', error);
  process.exitCode = 1;
});

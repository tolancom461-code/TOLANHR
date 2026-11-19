import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import fs from 'node:fs/promises';
import net from 'node:net';
import path from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import mysql from 'mysql2/promise';

const appDirectory = path.resolve(import.meta.dirname, '..');
const binary = 'C:/Program Files/MySQL/MySQL Server 8.4/bin/mysqld.exe';
export const osEnvironmentKeys = ['SystemRoot', 'WINDIR', 'PATH', 'TEMP', 'TMP', 'COMSPEC', 'SystemDrive', 'PATHEXT'];

export async function startTolanHrMysql() {
  await fs.access(binary);
  const temp = path.join(appDirectory, 'tmp');
  await fs.mkdir(temp, { recursive: true });
  const directory = await fs.mkdtemp(path.join(temp, 'tolanhr-pilot-mysql-'));
  const data = path.join(directory, 'data');
  const bootstrap = path.join(directory, 'private-bootstrap.sql');
  const rootPassword = randomBytes(32).toString('hex');
  const appPassword = randomBytes(32).toString('hex');
  const schema = `tolanhr_pilot_test_${randomBytes(6).toString('hex')}`;
  const appUser = 'tolanhr_pilot';
  const port = await freePort();
  const basedir = path.dirname(path.dirname(binary));
  const osEnv = Object.fromEntries(osEnvironmentKeys.filter(key => process.env[key] !== undefined).map(key => [key, process.env[key]]));
  let initializer;
  let server;

  function start(args) {
    const child = spawn(binary, args, { cwd: directory, env: osEnv, windowsHide: true, stdio: 'ignore' });
    child.on('error', () => { child.spawnFailed = true; });
    return child;
  }

  async function connect(database) {
    if (!running(server)) throw new Error('PILOT_MYSQL_NOT_RUNNING');
    const connection = await mysql.createConnection({ host: '127.0.0.1', port, user: 'root', password: rootPassword,
      ...(database ? { database } : {}), connectTimeout: 1500, dateStrings: true, supportBigNumbers: true,
      bigNumberStrings: true, multipleStatements: false, flags: '-LOCAL_FILES', timezone: 'Z' });
    try {
      const [[identity]] = await connection.query('SELECT @@datadir AS datadir, @@port AS port');
      assert.equal(path.resolve(identity.datadir), path.resolve(data));
      assert.equal(Number(identity.port), port);
      return connection;
    } catch (error) { connection.destroy(); throw error; }
  }

  async function close() {
    let graceful = true;
    if (running(server)) {
      let connection;
      try {
        connection = await connect();
        connection.on('error', () => {});
        await connection.query('SHUTDOWN');
        await until(() => !running(server), 12000);
      } catch {
        graceful = false;
        if (running(server)) server.kill();
      } finally { connection?.destroy(); }
    }
    if (running(initializer)) initializer.kill();
    await until(() => !running(server) && !running(initializer), 5000);
    await fs.unlink(bootstrap).catch(error => { if (error.code !== 'ENOENT') throw error; });
    return { mysqlStopped: true, bootstrapRemoved: true, graceful, syntheticFixtureRetained: true };
  }

  try {
    await fs.mkdir(data);
    initializer = start(['--no-defaults', '--initialize-insecure', `--basedir=${basedir}`, `--datadir=${data}`,
      '--mysqlx=OFF', `--log-error=${path.join(directory, 'initialize.private.log')}`]);
    await until(() => !running(initializer), 60000);
    assert.equal(initializer.exitCode, 0);
    await fs.writeFile(bootstrap, `ALTER USER 'root'@'localhost' IDENTIFIED BY '${rootPassword}';\n`
      + `CREATE USER 'root'@'127.0.0.1' IDENTIFIED BY '${rootPassword}';\n`
      + `GRANT ALL PRIVILEGES ON *.* TO 'root'@'127.0.0.1';\n`
      + `CREATE DATABASE \`${schema}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_bin;\n`
      + `CREATE USER '${appUser}'@'127.0.0.1' IDENTIFIED BY '${appPassword}';\n`
      + `GRANT SELECT, INSERT, UPDATE ON \`${schema}\`.* TO '${appUser}'@'127.0.0.1';\n`, { flag: 'wx', mode: 0o600 });
    server = start(['--no-defaults', `--basedir=${basedir}`, `--datadir=${data}`, '--bind-address=127.0.0.1',
      `--port=${port}`, '--mysqlx=OFF', '--skip-name-resolve', '--default-time-zone=+00:00', '--skip-log-bin',
      '--max-connections=15', '--innodb-buffer-pool-size=67108864', '--local-infile=OFF',
      `--log-error=${path.join(directory, 'mysql.private.log')}`, `--init-file=${bootstrap}`]);
    await until(async () => {
      if (!running(server)) throw new Error('PILOT_MYSQL_START_FAILED');
      try { const connection = await connect(schema); await connection.end(); return true; } catch { return false; }
    }, 30000);
    await fs.unlink(bootstrap);
    const connection = await connect(schema);
    try {
      const ddl = (await fs.readFile(path.join(import.meta.dirname, 'tolanhr-pilot-schema.sql'), 'utf8'))
        .split(/\r?\n/).filter(line => !line.startsWith('--')).join('\n');
      for (const statement of ddl.split(';').map(value => value.trim()).filter(Boolean)) {
        if (!/^CREATE (?:TABLE|(?:UNIQUE )?INDEX) /i.test(statement)) throw new Error('PILOT_DDL_REJECTED');
        await connection.query(statement);
      }
    } finally { await connection.end(); }
    return { schema, port, data, databaseUrl: `mysql://${appUser}:${appPassword}@127.0.0.1:${port}/${schema}?timezone=Z`,
      connect: () => connect(schema), close };
  } catch (error) { await close(); throw error; }
}

function running(child) { return Boolean(child && child.exitCode === null && child.signalCode === null && !child.spawnFailed); }

async function freePort() {
  const server = net.createServer();
  await new Promise((resolve, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', resolve); });
  const port = server.address().port;
  await new Promise(resolve => server.close(resolve));
  if ([3306, 3307, 4000, 8080, 9095, 9096, 9097].includes(port)) return freePort();
  return port;
}

async function until(predicate, timeout) {
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) { if (await predicate()) return; await delay(100); }
  throw Object.assign(new Error('Local acceptance wait timed out'), { code: 'PILOT_MYSQL_TIMEOUT' });
}

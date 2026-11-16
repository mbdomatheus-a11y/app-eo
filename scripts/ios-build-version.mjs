import { appendFileSync, readFileSync, writeFileSync } from 'node:fs';

const runNumber = Number(process.env.GITHUB_RUN_NUMBER);
const attempt = Number(process.env.GITHUB_RUN_ATTEMPT);
if (!Number.isSafeInteger(runNumber) || runNumber < 1 ||
    !Number.isSafeInteger(attempt) || attempt < 1 || attempt >= 100) {
  throw new Error('Numero da execucao ou tentativa do GitHub invalido.');
}

const path = 'app.json';
const config = JSON.parse(readFileSync(path, 'utf8'));
const baseVersion = config.expo?.ios?.version ?? config.expo?.version;
const match = /^(\d+)\.(\d+)\.(\d+)$/.exec(baseVersion ?? '');
if (!match) throw new Error('A versao base do EO deve ter tres numeros.');

const sequence = runNumber * 100 + attempt;
const version = `${match[1]}.${match[2]}.${sequence}`;
const buildNumber = String(1000 + sequence);
config.expo.ios ??= {};
config.expo.version = version;
config.expo.ios.version = version;
config.expo.ios.buildNumber = buildNumber;
writeFileSync(path, JSON.stringify(config, null, 2) + '\n');

if (process.env.GITHUB_ENV) {
  appendFileSync(process.env.GITHUB_ENV,
    `EO_APP_VERSION=${version}\nEO_BUILD_NUMBER=${buildNumber}\n`);
}
console.log(`EO para TestFlight: versao ${version}, compilacao ${buildNumber}.`);

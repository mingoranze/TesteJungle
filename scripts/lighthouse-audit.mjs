import { spawn, spawnSync } from 'node:child_process';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { setTimeout as delay } from 'node:timers/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { chromium } from '@playwright/test';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const reportDirectory = join(root, 'reports', 'lighthouse');
const previewPort = 4175;
const baseUrl = `http://127.0.0.1:${previewPort}`;
const cliPath = join(root, 'node_modules', 'lighthouse', 'cli', 'index.js');
const vitePath = join(root, 'node_modules', 'vite', 'bin', 'vite.js');
const pages = [
  { name: 'home', path: '/' },
  { name: 'detail', path: '/nfts/nft-001' },
];
const profiles = ['mobile', 'desktop'];
const thresholds = { performance: 90, accessibility: 95, 'best-practices': 95, seo: 90 };
const preview = spawn(process.execPath, [
  vitePath,
  'preview',
  '--host',
  '127.0.0.1',
  '--port',
  String(previewPort),
  '--strictPort',
], { cwd: root, stdio: 'ignore', windowsHide: true });

async function waitForPreview() {
  for (let attempt = 0; attempt < 60; attempt += 1) {
    if (preview.exitCode !== null) throw new Error(`Preview encerrou com código ${preview.exitCode}.`);
    try {
      const response = await fetch(baseUrl);
      if (response.ok) {
        const html = await response.text();
        if (/src=["']\/assets\/index-[^"']+\.js["']/.test(html) && !html.includes('/@vite/client')) return;
      }
    } catch {
      // O servidor ainda pode estar iniciando.
    }
    await delay(500);
  }
  throw new Error(`Preview de produção não respondeu em ${baseUrl}.`);
}

function median(values) {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.floor(sorted.length / 2)];
}

async function packageVersion(name) {
  const packagePath = join(root, 'node_modules', ...name.split('/'), 'package.json');
  const packageJson = JSON.parse(await readFile(packagePath, 'utf8'));
  return packageJson.version;
}

async function runAudit(page, profile, run) {
  const label = `${page.name}-${profile}-${run}`;
  const outputPrefix = join(reportDirectory, label);
  const args = [
    cliPath,
    `${baseUrl}${page.path}`,
    '--quiet',
    '--chrome-flags=--headless --no-sandbox',
    '--only-categories=performance,accessibility,best-practices,seo',
    '--output=html',
    '--output=json',
    `--output-path=${outputPrefix}`,
    '--locale=pt-BR',
  ];

  if (profile === 'mobile') {
    args.push(
      '--form-factor=mobile',
      '--screenEmulation.mobile=true',
      '--screenEmulation.width=390',
      '--screenEmulation.height=844',
      '--screenEmulation.deviceScaleFactor=1',
    );
  } else {
    args.push('--preset=desktop');
  }

  const result = spawnSync(process.execPath, args, {
    cwd: root,
    encoding: 'utf8',
    env: { ...process.env, CHROME_PATH: chromium.executablePath() },
    stdio: 'inherit',
    windowsHide: true,
  });
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(`Lighthouse falhou em ${label} (código ${result.status}).`);

  const report = JSON.parse(await readFile(`${outputPrefix}.report.json`, 'utf8'));
  return {
    label,
    profile,
    page: page.name,
    run,
    lighthouseVersion: report.lighthouseVersion,
    browserUserAgent: report.userAgent,
    scores: Object.fromEntries(
      Object.keys(thresholds).map((category) => [
        category,
        Math.round(report.categories[category].score * 100),
      ]),
    ),
    metrics: {
      lcpMs: report.audits['largest-contentful-paint'].numericValue,
      cls: report.audits['cumulative-layout-shift'].numericValue,
      tbtMs: report.audits['total-blocking-time'].numericValue,
    },
  };
}

try {
  await mkdir(reportDirectory, { recursive: true });
  await waitForPreview();

  const results = [];
  for (const profile of profiles) {
    for (const page of pages) {
      for (let run = 1; run <= 3; run += 1) {
        console.log(`Lighthouse ${page.name}/${profile}: medição ${run}/3`);
        results.push(await runAudit(page, profile, run));
      }
    }
  }

  const groups = profiles.flatMap((profile) => pages.map((page) => {
    const measurements = results.filter((result) => result.profile === profile && result.page === page.name);
    const scores = Object.fromEntries(
      Object.keys(thresholds).map((category) => [
        category,
        median(measurements.map((result) => result.scores[category])),
      ]),
    );
    return {
      profile,
      page: page.name,
      scores,
      metrics: {
        lcpMs: median(measurements.map((result) => result.metrics.lcpMs)),
        cls: median(measurements.map((result) => result.metrics.cls)),
        tbtMs: median(measurements.map((result) => result.metrics.tbtMs)),
      },
      passed: Object.entries(thresholds).every(([category, minimum]) => scores[category] >= minimum),
    };
  }));
  const summary = {
    measuredAt: new Date().toISOString(),
    lighthouseVersion: results[0]?.lighthouseVersion,
    playwrightVersion: await packageVersion('@playwright/test'),
    viteVersion: await packageVersion('vite'),
    environment: {
      url: baseUrl,
      build: 'Vite production preview',
      nodeVersion: process.version,
      platform: `${process.platform} ${process.arch}`,
      browserUserAgent: results[0]?.browserUserAgent,
      mobileViewport: '390x844, device scale factor 1',
      desktopPreset: 'Lighthouse desktop preset',
      throttling: 'Lighthouse defaults for mobile and desktop presets',
      measurementsPerPageAndProfile: 3,
      reportsDirectory: 'reports/lighthouse',
    },
    thresholds,
    groups,
    results,
    passed: groups.every((group) => group.passed),
  };
  await writeFile(join(reportDirectory, 'summary.json'), `${JSON.stringify(summary, null, 2)}\n`);

  for (const group of groups) {
    console.log(
      `${group.page}/${group.profile}: ${Object.entries(group.scores)
        .map(([category, score]) => `${category} ${score}`)
        .join(', ')}; LCP ${Math.round(group.metrics.lcpMs)}ms, CLS ${group.metrics.cls.toFixed(3)}, TBT ${Math.round(group.metrics.tbtMs)}ms`,
    );
  }
  if (!summary.passed) {
    console.error('Uma ou mais medianas não atingiram as metas; consulte summary.json e os relatórios HTML.');
    process.exitCode = 1;
  }
} finally {
  preview.kill();
}

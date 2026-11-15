#!/usr/bin/env node
/**
 * Dependency security gate: `npm audit --audit-level=high`, with a narrow,
 * expiring exception list.
 *
 * Fails on every high or critical advisory in a production dependency unless
 * `.github/audit-allowlist.json` names that exact advisory, in that project,
 * on that package, reached only through the direct dependencies the entry
 * lists. An entry also fails the build when:
 *   - its review-by date has passed (an exception has to be re-justified),
 *   - it no longer matches anything (the dependency was fixed; delete it),
 *   - it is malformed or dated more than REVIEW_MAX_DAYS ahead.
 *
 * Anything this script cannot read (audit output, a lockfile) fails closed.
 *
 * Usage: node .github/scripts/audit-gate.mjs . backend frontend
 */
import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const BLOCKING = new Set(['high', 'critical']);
const REVIEW_MAX_DAYS = 183;
const ALLOWLIST = '.github/audit-allowlist.json';

const projects = process.argv.slice(2);
if (projects.length === 0) fail(['usage: audit-gate.mjs <project dir>...']);

const today = new Date().toISOString().slice(0, 10);
const problems = [];
const entries = loadAllowlist();
const used = new Set();

for (const project of projects) {
  const advisories = blockingAdvisories(project);
  const lock = readJson(join(project, 'package-lock.json'));

  for (const adv of advisories) {
    const label = `${project}: ${adv.package} ${adv.ghsa} (${adv.severity}) ${adv.title}`;
    const entry = entries.find(
      (e) => e.project === project && e.advisory === adv.ghsa && e.package === adv.package
    );
    if (!entry) {
      problems.push(`${label}\n    not allowlisted`);
      continue;
    }
    used.add(entry);

    const reachedFrom = directDependentsOf(lock, adv.package);
    const unexpected = reachedFrom.filter((d) => !entry.via.includes(d));
    if (reachedFrom.length === 0) {
      problems.push(`${label}\n    reported by npm audit but not found in the lockfile's production tree`);
    } else if (unexpected.length > 0) {
      problems.push(
        `${label}\n    allowlisted only via ${entry.via.join(', ')}, but also reached via ${unexpected.join(', ')}`
      );
    }
    if (entry.reviewBy < today) {
      problems.push(`${label}\n    allowlist entry expired on ${entry.reviewBy}; re-check and re-justify it`);
    }
  }
}

for (const entry of entries) {
  if (projects.includes(entry.project) && !used.has(entry)) {
    problems.push(
      `${entry.project}: allowlist entry ${entry.package} ${entry.advisory} no longer matches any advisory; remove it`
    );
  }
}

if (problems.length > 0) fail(problems);
const excepted = used.size;
console.log(
  `Dependency audit passed for ${projects.join(', ')}` +
    (excepted ? ` (${excepted} allowlisted advisor${excepted === 1 ? 'y' : 'ies'}, see ${ALLOWLIST})` : '')
);

// ---------------------------------------------------------------------------

/** One record per high/critical advisory, attributed to the package it is filed against. */
function blockingAdvisories(project) {
  const run = spawnSync('npm', ['audit', '--json', '--omit=dev', '--omit=optional'], {
    cwd: project,
    encoding: 'utf8',
    maxBuffer: 64 * 1024 * 1024,
  });
  let report;
  try {
    report = JSON.parse(run.stdout);
  } catch {
    fail([`${project}: npm audit produced no readable JSON (exit ${run.status})\n${run.stderr}`]);
  }
  if (report.error || typeof report.vulnerabilities !== 'object' || report.vulnerabilities === null) {
    fail([`${project}: npm audit failed: ${JSON.stringify(report.error ?? report).slice(0, 500)}`]);
  }

  // `via` holds advisory objects for the package's own advisories and plain
  // package names for severity inherited from a dependency. Every inherited
  // entry traces back to an advisory object somewhere in the map, so counting
  // only the objects covers everything npm's own --audit-level would, while
  // attributing each advisory to the package it was actually filed against.
  const found = [];
  for (const [name, vuln] of Object.entries(report.vulnerabilities)) {
    for (const via of vuln.via) {
      if (typeof via !== 'object' || !BLOCKING.has(via.severity)) continue;
      const ghsa = /GHSA-[a-z0-9-]+/i.exec(via.url ?? '')?.[0];
      found.push({ package: name, ghsa: ghsa ?? `npm-${via.source}`, severity: via.severity, title: via.title });
    }
  }
  return found;
}

/** The root's production dependencies from which `target` is reachable. */
function directDependentsOf(lock, target) {
  const packages = lock.packages;
  if (!packages || !packages['']) fail([`lockfile has no "packages" section (lockfileVersion ≥ 2 required)`]);

  const starts = Object.keys(packages[''].dependencies ?? {});
  return starts.filter((dep) => reaches(packages, resolve(packages, '', dep), target, new Set()));
}

function reaches(packages, path, target, seen) {
  if (!path || seen.has(path)) return false;
  seen.add(path);
  if (path === `node_modules/${target}` || path.endsWith(`/node_modules/${target}`)) return true;
  const pkg = packages[path];
  const optionalPeers = pkg.peerDependenciesMeta ?? {};
  const children = [
    ...Object.keys(pkg.dependencies ?? {}),
    ...Object.keys(pkg.peerDependencies ?? {}).filter((p) => !optionalPeers[p]?.optional),
  ];
  return children.some((child) => reaches(packages, resolve(packages, path, child), target, seen));
}

/** Node's lookup: the nearest node_modules/<name> walking up from `from`. */
function resolve(packages, from, name) {
  let dir = from;
  for (;;) {
    const candidate = `${dir ? `${dir}/` : ''}node_modules/${name}`;
    if (packages[candidate]) return candidate;
    if (dir === '') return null;
    dir = dir.slice(0, dir.lastIndexOf('node_modules/')).replace(/\/$/, '');
  }
}

function loadAllowlist() {
  const raw = readJson(ALLOWLIST);
  if (!Array.isArray(raw.entries)) fail([`${ALLOWLIST}: expected { "entries": [...] }`]);
  const latest = new Date(Date.now() + REVIEW_MAX_DAYS * 86_400_000).toISOString().slice(0, 10);
  const bad = [];
  raw.entries.forEach((e, i) => {
    const where = `${ALLOWLIST} entries[${i}]`;
    for (const key of ['project', 'advisory', 'package', 'reason', 'reviewBy']) {
      if (typeof e[key] !== 'string' || e[key].trim() === '') bad.push(`${where}: "${key}" is required`);
    }
    if (!Array.isArray(e.via) || e.via.length === 0 || !e.via.every((v) => typeof v === 'string')) {
      bad.push(`${where}: "via" must list the direct dependencies the advisory is reached through`);
    }
    if (typeof e.reviewBy === 'string' && !/^\d{4}-\d{2}-\d{2}$/.test(e.reviewBy)) {
      bad.push(`${where}: "reviewBy" must be YYYY-MM-DD`);
    } else if (e.reviewBy > latest) {
      bad.push(`${where}: "reviewBy" ${e.reviewBy} is more than ${REVIEW_MAX_DAYS} days ahead`);
    }
  });
  if (bad.length) fail(bad);
  return raw.entries;
}

function readJson(path) {
  try {
    return JSON.parse(readFileSync(path, 'utf8'));
  } catch (err) {
    fail([`cannot read ${path}: ${err.message}`]);
  }
}

function fail(lines) {
  console.error(`Dependency audit FAILED:\n  ${lines.join('\n  ')}`);
  process.exit(1);
}

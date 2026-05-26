#!/usr/bin/env node
/* eslint-disable no-console */
const fs = require('fs');
const path = require('path');

const apiRoot = path.resolve(__dirname, '..');
const repoRoot = path.resolve(apiRoot, '..');

function readJsonIfExists(filePath) {
  if (!fs.existsSync(filePath)) return null;
  try { return JSON.parse(fs.readFileSync(filePath, 'utf8')); } catch { return null; }
}

function parseTsArrayExport(filePath, exportName) {
  if (!fs.existsSync(filePath)) return [];
  const src = fs.readFileSync(filePath, 'utf8');
  const marker = `export const ${exportName}`;
  const start = src.indexOf(marker);
  if (start === -1) return [];
  const eq = src.indexOf('=', start);
  const open = src.indexOf('[', eq);
  if (eq === -1 || open === -1) return [];
  let depth = 0; let end = -1;
  for (let i = open; i < src.length; i += 1) {
    if (src[i] === '[') depth += 1;
    if (src[i] === ']') { depth -= 1; if (depth === 0) { end = i; break; } }
  }
  if (end === -1) return [];
  try { return Function(`"use strict"; return (${src.slice(open, end + 1)});`)(); } catch { return []; }
}

function keyFor(item) {
  return [item?.id, item?.slug, item?.title, item?.name].find((v) => typeof v === 'string' && v.trim())?.trim().toLowerCase() || null;
}

function mergeWithoutDelete(current, recovered) {
  const out = [...(Array.isArray(current) ? current : [])];
  const index = new Map(out.map((x, i) => [keyFor(x), i]).filter(([k]) => k));
  let inserted = 0; let merged = 0; let skipped = 0;
  for (const candidate of recovered) {
    const k = keyFor(candidate);
    if (!k) { skipped += 1; continue; }
    if (!index.has(k)) {
      out.push(candidate);
      index.set(k, out.length - 1);
      inserted += 1;
      continue;
    }
    const i = index.get(k);
    const before = out[i];
    out[i] = { ...candidate, ...before, id: before?.id || candidate?.id, slug: before?.slug || candidate?.slug };
    merged += 1;
  }
  return { out, inserted, merged, skipped };
}

function gatherCandidates() {
  const sources = [];
  const candidates = { projects: [], services: [], mediaFiles: [] };

  const contentPaths = [
    path.join(apiRoot, 'server/data/content.json'),
    path.join(repoRoot, 'server/data/content.json'),
  ];
  for (const p of contentPaths) {
    const json = readJsonIfExists(p);
    if (!json) continue;
    sources.push(p);
    candidates.projects.push(...(json.projects || []));
    candidates.services.push(...(json.services || []));
    candidates.mediaFiles.push(...(json.mediaFiles || []));
  }

  const auditLog = readJsonIfExists(path.join(repoRoot, 'server/data/audit-log.json')) || [];
  for (const event of auditLog) {
    const e = event?.metadata?.entity;
    if (!e || typeof e !== 'object') continue;
    if (e.entityType === 'project' && e.payload) candidates.projects.push(e.payload);
    if (e.entityType === 'service' && e.payload) candidates.services.push(e.payload);
    if (e.entityType === 'media' && e.payload) candidates.mediaFiles.push(e.payload);
  }

  candidates.projects.push(...parseTsArrayExport(path.join(repoRoot, 'cms/apps/cms/src/data/projects.ts'), 'projects'));
  candidates.services.push(...parseTsArrayExport(path.join(repoRoot, 'cms/apps/cms/src/data/services.ts'), 'services'));
  candidates.projects.push(...parseTsArrayExport(path.join(repoRoot, 'site/src/data/projects.ts'), 'projects'));
  candidates.services.push(...parseTsArrayExport(path.join(repoRoot, 'site/src/data/services.ts'), 'services'));
  candidates.mediaFiles.push(...(readJsonIfExists(path.join(repoRoot, 'site/src/data/media.ts'))?.media || []));

  return { candidates, sources };
}

function run() {
  const targetPath = path.join(apiRoot, 'server/data/content.json');
  const target = readJsonIfExists(targetPath) || {};
  const { candidates, sources } = gatherCandidates();

  const projects = mergeWithoutDelete(target.projects || [], candidates.projects);
  const services = mergeWithoutDelete(target.services || [], candidates.services);
  const mediaFiles = mergeWithoutDelete(target.mediaFiles || [], candidates.mediaFiles);

  const updated = {
    ...target,
    projects: projects.out,
    services: services.out,
    mediaFiles: mediaFiles.out,
    recoveryLog: [
      ...(target.recoveryLog || []),
      {
        ranAt: new Date().toISOString(),
        script: 'recoverProjectsServicesMedia',
        report: {
          sources,
          projects: { scanned: candidates.projects.length, inserted: projects.inserted, merged: projects.merged },
          services: { scanned: candidates.services.length, inserted: services.inserted, merged: services.merged },
          mediaFiles: { scanned: candidates.mediaFiles.length, inserted: mediaFiles.inserted, merged: mediaFiles.merged },
        },
      },
    ],
  };

  fs.writeFileSync(targetPath, `${JSON.stringify(updated, null, 2)}\n`);
  console.log(JSON.stringify(updated.recoveryLog[updated.recoveryLog.length - 1], null, 2));
}

run();

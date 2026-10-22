// Trims a `pnpm deploy --prod` output for the runtime image.
//
// pnpm links optional peers that the lockfile resolved for development (e.g. the
// `prisma` CLI and `typescript` as peers of `@prisma/client`), which drags ~200 MB of
// tooling into production. This walks the dependency graph from the deployed
// package's own dependencies, skips optional peer edges, and deletes every store
// entry nothing reaches. It also drops Prisma query compilers for other databases.
//
// Usage: node prune-deploy.mjs <deploy-dir>
import { existsSync, lstatSync, readdirSync, readFileSync, realpathSync, rmSync } from 'node:fs';
import { join, relative, sep } from 'node:path';

const root = process.argv[2];
if (!root) throw new Error('usage: prune-deploy.mjs <deploy-dir>');
const nodeModules = join(root, 'node_modules');
const store = join(nodeModules, '.pnpm');

/** Package names in a node_modules dir, expanding @scope folders. */
function listPackages(dir) {
  if (!existsSync(dir)) return [];
  return readdirSync(dir)
    .filter((name) => !name.startsWith('.'))
    .flatMap((name) =>
      name.startsWith('@') ? readdirSync(join(dir, name)).map((sub) => `${name}/${sub}`) : [name],
    );
}

/** The store entry (`.pnpm/<id>`) that a package path resolves into. */
function storeEntry(pkgPath) {
  const [id] = relative(store, realpathSync(pkgPath)).split(sep);
  return id;
}

function optionalPeers(pkgPath) {
  const manifest = JSON.parse(readFileSync(join(pkgPath, 'package.json'), 'utf8'));
  return new Set(
    Object.entries(manifest.peerDependenciesMeta ?? {})
      .filter(([, meta]) => meta.optional)
      .map(([name]) => name),
  );
}

const reachable = new Set();
function visit(pkgPath) {
  const id = storeEntry(pkgPath);
  if (reachable.has(id)) return;
  reachable.add(id);
  const self = realpathSync(pkgPath);
  const skip = optionalPeers(self);
  const depsDir = join(store, id, 'node_modules');
  for (const name of listPackages(depsDir)) {
    const dep = join(depsDir, name);
    if (realpathSync(dep) === self || skip.has(name)) continue;
    visit(dep);
  }
}

for (const name of listPackages(nodeModules)) visit(join(nodeModules, name));

let removed = 0;
for (const id of readdirSync(store)) {
  if (id === 'node_modules' || reachable.has(id)) continue;
  rmSync(join(store, id), { recursive: true, force: true });
  removed++;
}

// Hoisted symlinks that now point at deleted entries.
const hoisted = join(store, 'node_modules');
for (const name of listPackages(hoisted)) {
  const link = join(hoisted, name);
  if (lstatSync(link).isSymbolicLink() && !existsSync(link)) rmSync(link);
}

// The generated client loads only the PostgreSQL query compiler.
for (const id of reachable) {
  const runtime = join(store, id, 'node_modules/@prisma/client/runtime');
  if (!existsSync(runtime)) continue;
  for (const file of readdirSync(runtime)) {
    if (/^query_compiler_.*\.(sqlite|mysql|cockroachdb|sqlserver)\./.test(file)) {
      rmSync(join(runtime, file));
    }
  }
}

console.log(`prune-deploy: kept ${reachable.size} packages, removed ${removed}`);

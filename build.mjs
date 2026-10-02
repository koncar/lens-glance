// Bundles the extension into the single CommonJS file Lens loads, dist/index.js.
//
// lens-package-build bundles devDependencies together with everything they import, React
// included, and a second React next to the one Lens renders with breaks every hook. Perses
// is bundled here instead, while what Lens serves stays external no matter who imports it.
import { build } from "esbuild";
import packageBuild from "@k8slens/package-build";
import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";

const { globImportPlugin, stylesheetPlugin } = packageBuild;
const packageDirectory = process.cwd();
const packageJson = JSON.parse(readFileSync(path.resolve(packageDirectory, "package.json"), "utf-8"));

// The modules Lens serves to extensions from its own bundle (see "Dependency versions in this
// Lens build" in the extension development instructions).
const hostProvidedModules = new Set([
  "react",
  "react-dom",
  "react/jsx-runtime",
  "react/jsx-dev-runtime",
  "mobx",
  "mobx-react",
  "zod",
  "zod/v3",
  "zod/v4",
]);

const isHostProvided = (specifier) =>
  hostProvidedModules.has(specifier) || specifier.startsWith("@k8slens/") || specifier.startsWith("@lensapp/");

const hostProvidedModulesPlugin = {
  name: "host-provided-modules",
  setup: (build) => {
    build.onResolve({ filter: /^[^./]/ }, (args) => (isHostProvided(args.path) ? { path: args.path, external: true } : null));
  },
};

// Perses ships every package twice, as CommonJS (`main`) and as ESM (`module`), and once
// anything reaches a package through require() esbuild takes its CommonJS build. Bundling both
// builds of a package means two copies of its React contexts — a QueryClientProvider of one
// copy is invisible to the hooks of the other — so require() resolves the way import does.
const singleBuildPerPackagePlugin = {
  name: "single-build-per-package",
  setup: (build) => {
    build.onResolve({ filter: /^[^./]/ }, async (args) => {
      if (args.kind !== "require-call" || args.pluginData?.asImport || isHostProvided(args.path)) {
        return null;
      }

      const resolved = await build.resolve(args.path, {
        kind: "import-statement",
        importer: args.importer,
        resolveDir: args.resolveDir,
        pluginData: { asImport: true },
      });

      return resolved.errors.length || resolved.external || !path.isAbsolute(resolved.path) ? null : resolved;
    });
  },
};

// A dependency's own css (Perses imports the Inter font) would land in a file of its own beside
// the bundle. Lens has a font of its own, so it is left out.
const dependencyStylesheetsPlugin = {
  name: "dependency-stylesheets",
  setup: (build) => {
    build.onResolve({ filter: /\.css$/ }, (args) =>
      args.importer.split(path.sep).includes("node_modules") ? { path: args.path, namespace: "empty-css" } : null,
    );
    build.onLoad({ filter: /.*/, namespace: "empty-css" }, () => ({ contents: "", loader: "js" }));
  },
};

const watch = process.argv.includes("--watch");
// `node build.mjs --metafile` also writes what went into the bundle, for checking it, outside dist.
const metafile = process.argv.includes("--metafile");

const options = {
  entryPoints: ["src/index.ts"],
  outfile: "dist/index.js",
  format: "cjs",
  bundle: true,
  platform: "browser",
  target: "es2022",
  sourcemap: watch ? "inline" : false,
  minify: !watch,
  legalComments: "none",
  logLevel: "info",
  metafile,
  define: { "process.env.NODE_ENV": JSON.stringify(watch ? "development" : "production") },
  loader: { ".md": "text", ".svg": "text", ".woff": "dataurl", ".woff2": "dataurl", ".ttf": "dataurl" },
  plugins: [
    hostProvidedModulesPlugin,
    singleBuildPerPackagePlugin,
    dependencyStylesheetsPlugin,
    stylesheetPlugin({
      packageName: packageJson.name,
      packageDirectory,
      declaredDependencies: new Set(Object.keys(packageJson.dependencies ?? {})),
    }),
    globImportPlugin(),
  ],
};

if (watch) {
  const { context } = await import("esbuild");
  const buildContext = await context(options);

  await buildContext.watch();
} else {
  const result = await build(options);

  if (metafile) {
    writeFileSync("bundle-meta.json", JSON.stringify(result.metafile));
  }
}

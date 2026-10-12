import { shellQuote } from "@k8slens/ai-tools-contracts";
import { type HostFiles, isHidden, type RunCliCommand } from "./host-files";

const missingMarker = "__LENS_GLANCE_NO_SUCH_FILE__";
const exitMarker = "@@exit:";

const parentOf = (path: string) => path.slice(0, path.lastIndexOf("/"));

const relativeLines = (output: string) =>
  output
    .split("\n")
    .map((line) => line.trim().replace(/^\.\/?/, ""))
    .filter(Boolean);

// The files of the extension on macOS and Linux, through a POSIX shell.
export const posixFiles = (runCliCommand: RunCliCommand): HostFiles => ({
  platform: "posix",

  home: () => runCliCommand('printf %s "$HOME"'),

  downloads: () =>
    runCliCommand('xdg-user-dir DOWNLOAD 2>/dev/null || printf %s "$HOME/Downloads"').then((path) => path.trim()),

  native: (path) => path,

  read: async (path) => {
    const quoted = shellQuote(path);
    const text = await runCliCommand(`if [ -f ${quoted} ]; then cat ${quoted}; else printf '%s' ${missingMarker}; fi`);

    return text === missingMarker ? undefined : text;
  },

  // The content goes to a temporary file that is then moved over the target.
  write: async (path, content, { onlyIfMissing = false } = {}) => {
    const target = shellQuote(path);
    const temporary = shellQuote(`${path}.lens-glance-tmp`);
    const write = `mkdir -p ${shellQuote(parentOf(path))} && printf '%s' ${shellQuote(content)} > ${temporary} && mv ${temporary} ${target}`;

    await runCliCommand(onlyIfMissing ? `[ -e ${target} ] || { ${write}; }` : write);
  },

  exists: async (...paths) =>
    (await runCliCommand(
      `${paths.map((path) => `[ -e ${shellQuote(path)} ]`).join(" || ")} && printf yes || printf no`,
    )) === "yes",

  entries: async (directory) =>
    relativeLines(await runCliCommand(`[ -d ${shellQuote(directory)} ] && ls -A ${shellQuote(directory)}; true`)),

  libraryTree: async (root) => {
    const quoted = shellQuote(root);
    const entries = relativeLines(
      await runCliCommand(
        `mkdir -p ${quoted} && cd ${quoted} && find . -name '.*' ! -name . -prune -o -type d -print -o -type f -name '*.json' -print`,
      ),
    ).filter((entry) => !isHidden(entry));

    return {
      folders: entries.filter((entry) => !entry.endsWith(".json")),
      files: entries.filter((entry) => entry.endsWith(".json")),
    };
  },

  repositories: async (root) =>
    relativeLines(
      await runCliCommand(
        `cd ${shellQuote(root)} && find . -maxdepth 4 \\( -name .lens -o -name .claude -o -name node_modules \\) -prune -o -name .git -print -prune 2>/dev/null; true`,
      ),
    ).map((git) => git.replace(/\/?\.git$/, "")),

  makeDirectory: async (path) => {
    await runCliCommand(`mkdir -p ${shellQuote(path)}`);
  },

  move: async (from, to) => {
    await runCliCommand(`mv -n ${shellQuote(from)} ${shellQuote(to)}`);
  },

  remove: async (...paths) => {
    await runCliCommand(`rm -f ${paths.map(shellQuote).join(" ")}`);
  },

  removeEmptyDirectory: async (path) => {
    await runCliCommand(`rmdir ${shellQuote(path)}`);
  },

  removeTree: async (path) => {
    await runCliCommand(`rm -rf ${shellQuote(path)}`);
  },

  // What the program prints on its standard error is read with the rest: a command writing
  // there fails, and git and curl write there whenever they report anything.
  run: async (program, args, options) => {
    const output = await runCliCommand(
      `{ ${[program, ...args.map(shellQuote)].join(" ")}\n} 2>&1; printf '\\n${exitMarker}%s' "$?"`,
      options,
    );
    const at = output.lastIndexOf(exitMarker);

    return { code: Number(output.slice(at + exitMarker.length)), output: output.slice(0, at).trim() };
  },

  // Selected in the Finder on macOS; its folder opened elsewhere.
  reveal: async (path) => {
    await runCliCommand(
      `if [ "$(uname)" = Darwin ]; then open -R ${shellQuote(path)}; else xdg-open ${shellQuote(parentOf(path))} >/dev/null 2>&1 & fi`,
    );
  },
});

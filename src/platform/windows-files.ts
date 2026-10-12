import type { HostFiles, RunCliCommand } from "./host-files";
import { isHidden } from "./host-files";

// cmd.exe reads a command line once, expanding %NAME% and acting on & | < > ( ) and quotes as it
// goes, and takes no more than about 8000 characters of it. So nothing a user wrote, not even a
// path, goes into a command line here: each value travels in an environment variable, and is put
// in by delayed expansion, !NAME!, which happens after the line has been read. That needs a cmd of
// its own started with /v:on, inside the one Lens runs commands with; the special characters of
// the inner command are escaped with ^ so that the outer cmd hands them on as they are.
const valueName = (index: number) => `LENS_GLANCE_V${index}`;
const value = (index: number) => `!${valueName(index)}!`;

const missingMarker = "__LENS_GLANCE_NO_SUCH_FILE__";
const filesMarker = "__LENS_GLANCE_FILES__";
const exitMarker = "@@exit:";

const escapedForOuterCmd = (inner: string) => {
  let quoted = false;
  let escaped = "";

  for (const character of inner) {
    if (character === '"') {
      quoted = !quoted;
    }

    escaped += !quoted && "&|<>()^".includes(character) ? `^${character}` : character;
  }

  return escaped;
};

const withValues = (inner: string, values: readonly string[]) => ({
  // UTF-8 out, for names and output beyond ASCII.
  command: `chcp 65001>nul & cmd /d /v:on /c ${escapedForOuterCmd(inner)}`,
  env: Object.fromEntries(values.map((one, index) => [valueName(index), one])),
});

// How a program on Windows splits its command line into arguments (the C runtime's rules): an
// argument is quoted whole, a quote in it is escaped with a backslash, and backslashes before a
// quote, or at the end, are doubled.
export const escapedArgument = (argument: string) => argument.replace(/(\\*)"/g, '$1$1\\"').replace(/(\\+)$/, "$1$1");

// PowerShell, for writing a file whole: its script given encoded, so nothing in it is read by
// cmd, and the file's content given in environment variables, so it may be any size.
const writeScript = `
$ErrorActionPreference = 'Stop'
$ProgressPreference = 'SilentlyContinue'
try {
  $target = $env:LENS_GLANCE_PATH
  if ($env:LENS_GLANCE_ONLY_IF_MISSING -eq '1' -and (Test-Path -LiteralPath $target)) { exit 0 }
  [IO.Directory]::CreateDirectory([IO.Path]::GetDirectoryName($target)) | Out-Null
  $parts = for ($i = 0; $i -lt [int]$env:LENS_GLANCE_CHUNKS; $i++) { [Environment]::GetEnvironmentVariable("LENS_GLANCE_C$i") }
  $temporary = "$target.lens-glance-tmp"
  [IO.File]::WriteAllText($temporary, (-join $parts), (New-Object Text.UTF8Encoding $false))
  Move-Item -LiteralPath $temporary -Destination $target -Force
} catch {
  [Console]::Error.Write($_.Exception.Message)
  exit 1
}
`;

const chunkLength = 16000;

const encodedCommand = (script: string) => {
  let bytes = "";

  // UTF-16LE, as PowerShell takes an encoded command.
  for (let index = 0; index < script.length; index++) {
    const code = script.charCodeAt(index);

    bytes += String.fromCharCode(code & 0xff, code >> 8);
  }

  return btoa(bytes);
};

const lines = (output: string) =>
  output
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);

// The files of the extension on Windows, through cmd.exe and, to write, PowerShell.
export const windowsFiles = (runCliCommand: RunCliCommand): HostFiles => {
  const native = (path: string) => path.replace(/\//g, "\\");

  const run = (inner: string, ...values: string[]) => {
    const { command, env } = withValues(inner, values);

    return runCliCommand(command, { env });
  };

  // A full path the platform wrote, as one below the root joined with "/".
  const relativeTo = (root: string) => {
    const prefix = `${native(root).replace(/\\+$/, "")}\\`.toLowerCase();

    return (path: string) =>
      path.toLowerCase().startsWith(prefix) ? path.slice(prefix.length).replace(/\\/g, "/") : undefined;
  };

  const home = async () => (await runCliCommand("chcp 65001>nul & echo %USERPROFILE%")).trim();

  return {
    platform: "windows",
    home,
    downloads: async () => `${await home()}\\Downloads`,
    native,

    read: async (path) => {
      const text = await run(`if exist "${value(0)}" (type "${value(0)}") else (echo ${missingMarker})`, native(path));

      return text.trim() === missingMarker ? undefined : text;
    },

    write: async (path, content, { onlyIfMissing = false } = {}) => {
      const chunks = content.match(new RegExp(`[\\s\\S]{1,${chunkLength}}`, "g")) ?? [];

      await runCliCommand(
        `powershell -NoProfile -NonInteractive -ExecutionPolicy Bypass -EncodedCommand ${encodedCommand(writeScript)}`,
        {
          env: {
            LENS_GLANCE_PATH: native(path),
            LENS_GLANCE_ONLY_IF_MISSING: onlyIfMissing ? "1" : "0",
            LENS_GLANCE_CHUNKS: String(chunks.length),
            ...Object.fromEntries(chunks.map((chunk, index) => [`LENS_GLANCE_C${index}`, chunk])),
          },
        },
      );
    },

    exists: async (...paths) => {
      const test = paths.reduceRight(
        (otherwise, _path, index) => `if exist "${value(index)}" (echo yes) else (${otherwise})`,
        "echo no",
      );

      return (await run(test, ...paths.map(native))).trim() === "yes";
    },

    entries: async (directory) => lines(await run(`dir "${value(0)}" /b /a 2>nul & exit /b 0`, native(directory))),

    libraryTree: async (root) => {
      const output = await run(
        `(if not exist "${value(0)}\\" mkdir "${value(0)}") & dir "${value(0)}" /s /b /ad 2>nul & echo ${filesMarker} & dir "${value(0)}\\*.json" /s /b /a-d 2>nul & exit /b 0`,
        native(root),
      );
      const [folders = "", files = ""] = output.split(filesMarker);
      const relative = relativeTo(root);
      const shown = (text: string) =>
        lines(text)
          .map(relative)
          .filter((path): path is string => path !== undefined && path !== "" && !isHidden(path));

      return { folders: shown(folders), files: shown(files) };
    },

    // FOR /R cannot take its folder from delayed expansion, so it walks the current folder.
    repositories: async (root) => {
      const relative = relativeTo(root);

      return lines(
        await run(`cd /d "${value(0)}" && for /r %d in (.git) do @if exist "%d\\HEAD" echo %d`, native(root)),
      )
        .map((git) => (git.toLowerCase() === `${native(root)}\\.git`.toLowerCase() ? "" : relative(git)))
        .filter((path): path is string => path !== undefined)
        .map((path) => path.replace(/\/?\.git$/, ""))
        .filter((folder) => !isHidden(folder) && !folder.split("/").includes("node_modules"))
        .filter((folder) => folder.split("/").length <= 4);
    },

    makeDirectory: async (path) => {
      await run(`if not exist "${value(0)}\\" mkdir "${value(0)}"`, native(path));
    },

    move: async (from, to) => {
      await run(`if not exist "${value(1)}" move /y "${value(0)}" "${value(1)}" >nul`, native(from), native(to));
    },

    remove: async (...paths) => {
      await run(
        `del /f /q ${paths.map((_path, index) => `"${value(index)}"`).join(" ")} 2>nul & exit /b 0`,
        ...paths.map(native),
      );
    },

    removeEmptyDirectory: async (path) => {
      await run(`rd "${value(0)}"`, native(path));
    },

    // What git keeps is read-only, which rd does not remove.
    removeTree: async (path) => {
      await run(
        `if exist "${value(0)}\\" (attrib -r "${value(0)}\\*" /s /d >nul 2>&1 & rd /s /q "${value(0)}")`,
        native(path),
      );
    },

    // The program's errors are read with the rest, and its exit code after them: expanded after
    // it ran, as delayed expansion does.
    run: async (program, args, options) => {
      const { command, env } = withValues(
        `${program} ${args.map((_argument, index) => `"${value(index)}"`).join(" ")} 2>&1 & echo ${exitMarker}!errorlevel!`,
        args.map(escapedArgument),
      );
      const output = await runCliCommand(command, {
        cwd: options?.cwd && native(options.cwd),
        env: { ...options?.env, ...env },
      });
      const at = output.lastIndexOf(exitMarker);
      const printed = (at < 0 ? output : output.slice(0, at)).replace(/\r\n/g, "\n").trim();

      // No exit code at all: cmd did not get as far as running the program.
      return { code: at < 0 ? 1 : Number.parseInt(output.slice(at + exitMarker.length), 10) || 0, output: printed };
    },

    // Explorer answers 1 even when it showed the file.
    reveal: async (path) => {
      await run(`explorer /select,"${value(0)}" & exit /b 0`, native(path));
    },
  };
};

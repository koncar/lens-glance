export interface RunResult {
  /** 0 when the program succeeded; any other number when it did not. */
  readonly code: number;
  /** All it printed, its errors included. */
  readonly output: string;
}

export interface RunOptions {
  readonly cwd?: string;
  readonly env?: Readonly<Record<string, string>>;
}

export interface LibraryTree {
  /** Every folder, as `team` or `team/apps`, the top left out. */
  readonly folders: readonly string[];
  /** Every `*.json` file, as `team/cpu.json`. */
  readonly files: readonly string[];
}

// The files of the extension, on the user's machine. The extension surface has no file system,
// so files are read and written by commands, and a command is written for the shell of the
// platform Lens runs on: a POSIX shell on macOS and Linux, cmd.exe on Windows. Paths are given
// joined with "/", as the rest of the extension writes them, and made the platform's here.
// What lists or names files answers with paths joined with "/" too.
export interface HostFiles {
  readonly platform: "posix" | "windows";
  /** The user's home folder, as the platform writes paths. */
  home(): Promise<string>;
  /** The user's folder of downloads. */
  downloads(): Promise<string>;
  /** A path as the platform writes it. */
  native(path: string): string;
  /** A file's text, or undefined when there is no such file. */
  read(path: string): Promise<string | undefined>;
  /** Writes a file whole, its folder made when missing, so that no reader sees half of it. */
  write(path: string, content: string, options?: { readonly onlyIfMissing?: boolean }): Promise<void>;
  /** Whether any of the paths is there, a file or a folder. */
  exists(...paths: string[]): Promise<boolean>;
  /** The names in a folder, none when there is no such folder. */
  entries(directory: string): Promise<string[]>;
  /** The folders and dashboards below a folder, made when missing, leaving out what starts with a dot. */
  libraryTree(root: string): Promise<LibraryTree>;
  /** The folders below a folder, a few deep, that are git repositories: `""` for the folder itself. */
  repositories(root: string): Promise<string[]>;
  makeDirectory(path: string): Promise<void>;
  /** Moves a file, leaving it where it is when one is at the destination already. */
  move(from: string, to: string): Promise<void>;
  /** Removes files, those already gone included. */
  remove(...paths: string[]): Promise<void>;
  /** Removes a folder only when it is empty, and fails when it is not. */
  removeEmptyDirectory(path: string): Promise<void>;
  /** Removes a folder with all that is in it. */
  removeTree(path: string): Promise<void>;
  /** Runs a program such as git or curl with arguments that may hold anything, and reads what it printed. */
  run(program: string, args: readonly string[], options?: RunOptions): Promise<RunResult>;
  /** Shows a file in the platform's file manager. */
  reveal(path: string): Promise<void>;
}

export type RunCliCommand = (command: string, options?: RunOptions) => Promise<string>;

/** Whether Lens runs on Windows. */
export const runsOnWindows = () =>
  typeof navigator !== "undefined" && (/^win/i.test(navigator.platform) || /\bWindows\b/.test(navigator.userAgent));

// What starts with a dot is Lens's, the agent's or git's own: .lens, .claude, .git.
export const isHidden = (relativePath: string) => relativePath.split("/").some((segment) => segment.startsWith("."));

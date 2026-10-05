/** A folder of the library that is a git repository: synced with the team as a whole. */
export interface GitRepo {
  /** The folder in the library, `""` for the whole library. */
  readonly folder: string;
  readonly remote?: string;
  readonly branch?: string;
  /** The branch it follows, such as `origin/main`, once it has one. */
  readonly upstream?: string;
  /** Commits made here and not sent yet, and sent by others and not taken yet, as of the last fetch. */
  readonly ahead: number;
  readonly behind: number;
  /** Files changed here and not committed yet. */
  readonly changed: readonly string[];
  /** Files changed both here and by someone else, while a sync is stopped at them. */
  readonly conflicted: readonly string[];
  /** Whether a sync is stopped part of the way, at a conflict. */
  readonly rebasing: boolean;
}

export const statusMarker = "@@repo ";
export const remoteMarker = "@@remote ";
export const rebasingMarker = "@@rebasing";

// What the status command prints for each repository: its folder, `git status --porcelain=v2
// --branch`, its remote, and whether a rebase is under way.
export const parseRepos = (output: string): GitRepo[] => {
  const repos: GitRepo[] = [];
  let current: { -readonly [K in keyof GitRepo]: GitRepo[K] } | undefined;

  for (const line of output.split("\n")) {
    if (line.startsWith(statusMarker)) {
      const folder = line.slice(statusMarker.length).replace(/^\.\/?/, "");

      current = { folder, ahead: 0, behind: 0, changed: [], conflicted: [], rebasing: false };
      repos.push(current);
      continue;
    }

    if (!current) {
      continue;
    }

    const fields = line.split(" ");

    if (line.startsWith(remoteMarker)) {
      current.remote = line.slice(remoteMarker.length).trim() || undefined;
    } else if (line === rebasingMarker) {
      current.rebasing = true;
    } else if (line.startsWith("# branch.head ")) {
      current.branch = line.slice("# branch.head ".length) === "(detached)" ? undefined : fields[2];
    } else if (line.startsWith("# branch.upstream ")) {
      current.upstream = fields[2];
    } else if (line.startsWith("# branch.ab ")) {
      current.ahead = Math.abs(Number(fields[2]) || 0);
      current.behind = Math.abs(Number(fields[3]) || 0);
    } else if (line.startsWith("1 ")) {
      current.changed = [...current.changed, fields.slice(8).join(" ")];
    } else if (line.startsWith("2 ")) {
      current.changed = [...current.changed, fields.slice(9).join(" ").split("\t")[0]];
    } else if (line.startsWith("u ")) {
      current.conflicted = [...current.conflicted, fields.slice(10).join(" ")];
    } else if (line.startsWith("? ")) {
      current.changed = [...current.changed, line.slice(2)];
    }
  }

  return repos;
};

/** The repository a folder of the library is synced in: its own, or one it is inside. */
export const repoGoverning = (repos: readonly GitRepo[], folder: string) =>
  repos
    .filter((repo) => repo.folder === "" || folder === repo.folder || folder.startsWith(`${repo.folder}/`))
    .sort((one, other) => other.folder.length - one.folder.length)[0];

/** Whether any repository is inside the folder: a folder holding one cannot be synced as a whole. */
export const holdsRepo = (repos: readonly GitRepo[], folder: string) =>
  repos.some((repo) => repo.folder !== folder && (folder === "" || repo.folder.startsWith(`${folder}/`)));

const plural = (count: number, one: string, many: string) => `${count} ${count === 1 ? one : many}`;

/** What waits to be sent: changes not committed yet, and commits not pushed yet. */
export const toSendOf = (repo: GitRepo) => repo.changed.length + repo.ahead;

export const describeRepo = (repo: GitRepo) => {
  const where = repo.remote ?? "a repository with no remote";

  if (repo.rebasing || repo.conflicted.length) {
    return `Synced with ${where}. A sync stopped at a conflict in ${repo.conflicted.join(", ") || "the files"}: fix it, then Sync again, or cancel the sync.`;
  }

  const toSend = toSendOf(repo);
  const parts = [
    ...(toSend ? [`${plural(toSend, "change", "changes")} to send`] : []),
    ...(repo.behind ? [`${plural(repo.behind, "change", "changes")} to take`] : []),
  ];

  return `Synced with ${where}: ${parts.length ? parts.join(", ") : "up to date"}. Click to sync.`;
};

/** What git said when it failed, in words the user can act on. */
export const gitErrorOf = (doing: string, output: string) => {
  if (
    /terminal prompts disabled|could not read (Username|Password)|Authentication failed|Permission denied \(publickey|Host key verification failed|returned error: 403/i.test(
      output,
    )
  ) {
    return `Could not ${doing}: git could not sign in to the repository. Make sure git reaches it from a terminal without asking, with an SSH key in your agent or credentials kept by a credential helper (for GitHub, gh auth login).`;
  }

  if (/Repository not found|does not appear to be a git repository|not found/i.test(output)) {
    return `Could not ${doing}: the repository was not found, or your account has no access to it.`;
  }

  if (/Please tell me who you are|empty ident name|unable to auto-detect email/i.test(output)) {
    return `Could not ${doing}: git needs your name and email to record changes. Set them in a terminal with git config --global user.name "Your Name" and git config --global user.email you@example.com.`;
  }

  if (/\[rejected\]|non-fast-forward|fetch first/i.test(output)) {
    return `Could not ${doing}: someone sent changes in the meantime. Sync again.`;
  }

  if (/command not found|git: not found/i.test(output)) {
    return `Could not ${doing}: git is not installed, or not on the PATH Lens runs commands with.`;
  }

  const lastLines = output.trim().split("\n").slice(-4).join("\n");

  return `Could not ${doing}${lastLines ? `: ${lastLines}` : ""}`;
};

/** The web page of a repository on a host with one, from the URL git knows it by. */
export const webPageOf = (remote: string | undefined) => {
  if (!remote) {
    return undefined;
  }

  const scp = /^[\w.-]+@([\w.-]+):(.+?)(\.git)?\/?$/.exec(remote);

  if (scp) {
    return `https://${scp[1]}/${scp[2]}`;
  }

  const url = /^(?:ssh|git\+ssh|https?):\/\/(?:[^@/]+@)?([^/:]+)(?::\d+)?\/(.+?)(\.git)?\/?$/.exec(remote);

  return url ? `https://${url[1]}/${url[2]}` : undefined;
};

/** The name a repository's URL suggests for its folder: its last part, as a folder is named. */
export const folderNameOf = (remote: string) =>
  (remote.trim().replace(/\/+$/, "").split(/[/:]/).pop() ?? "")
    .replace(/\.git$/, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");

// Lens's own files, the agent's, and what is half written: kept out of every repository, in its
// own exclude file rather than a .gitignore it would share.
export const excludedEverywhere = ["*.lens-glance-tmp", ".DS_Store"];
export const excludedAtTheTop = ["/.lens/", "/.claude/", "/AGENTS.md", "/CLAUDE.md", "/GEMINI.md"];

// Finds the repositories in the library, a few folders deep, and prints what parseRepos reads.
// Run in the library's folder; every git error goes to the output, since a command that writes
// to its standard error fails.
export const statusScript = [
  `find . -maxdepth 4 \\( -name .lens -o -name .claude -o -name node_modules \\) -prune -o -name .git -print -prune 2>/dev/null |`,
  `while IFS= read -r g; do`,
  `  d="\${g%/.git}"; printf '${statusMarker}%s\\n' "$d"`,
  `  ( cd "$d" && git status --porcelain=v2 --branch 2>&1;`,
  `    printf '${remoteMarker}%s\\n' "$(git remote get-url origin 2>/dev/null)";`,
  `    if [ -d .git/rebase-merge ] || [ -d .git/rebase-apply ]; then echo '${rebasingMarker}'; fi )`,
  `done`,
].join("\n");

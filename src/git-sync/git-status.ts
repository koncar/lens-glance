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

// What `git status --porcelain=v2 --branch` says of a repository, with its remote and whether a
// rebase is under way, which it does not say.
export const parseStatus = (folder: string, output: string, remote: string | undefined, rebasing: boolean): GitRepo => {
  const repo: { -readonly [K in keyof GitRepo]: GitRepo[K] } = {
    folder,
    remote: remote?.trim() || undefined,
    ahead: 0,
    behind: 0,
    changed: [],
    conflicted: [],
    rebasing,
  };

  for (const line of output.split(/\r?\n/)) {
    const fields = line.split(" ");

    if (line.startsWith("# branch.head ")) {
      repo.branch = fields[2] === "(detached)" ? undefined : fields[2];
    } else if (line.startsWith("# branch.upstream ")) {
      repo.upstream = fields[2];
    } else if (line.startsWith("# branch.ab ")) {
      repo.ahead = Math.abs(Number(fields[2]) || 0);
      repo.behind = Math.abs(Number(fields[3]) || 0);
    } else if (line.startsWith("1 ")) {
      repo.changed = [...repo.changed, fields.slice(8).join(" ")];
    } else if (line.startsWith("2 ")) {
      repo.changed = [...repo.changed, fields.slice(9).join(" ").split("\t")[0]];
    } else if (line.startsWith("u ")) {
      repo.conflicted = [...repo.conflicted, fields.slice(10).join(" ")];
    } else if (line.startsWith("? ")) {
      repo.changed = [...repo.changed, line.slice(2)];
    }
  }

  return repo;
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

  if (/command not found|git: not found|is not recognized as an internal or external command/i.test(output)) {
    return `Could not ${doing}: git is not installed, or not on the PATH Lens runs commands with. On Windows, install Git for Windows.`;
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

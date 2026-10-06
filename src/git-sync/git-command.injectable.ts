import { getInjectable2 } from "@k8slens/injectable";
import { hostFilesInjectable } from "../platform/host-files.injectable";
import type { RunResult } from "../platform/host-files";

export type GitResult = RunResult;

// git never asks: a sign-in it cannot make fails rather than waiting for a terminal no one sees.
// Its messages stay in English, since what it says is read.
const gitEnvironment = { GIT_TERMINAL_PROMPT: "0", GIT_EDITOR: "true", LC_ALL: "C" };

// Runs git in a folder, with the user's own git, configuration and sign-in, and reads what it
// printed, its refusals included, and how it ended.
export const gitCommandInjectable = getInjectable2({
  id: "lens-glance-git-command",

  instantiate: (di) => {
    const files = di.inject(hostFilesInjectable)();

    return () => (directory: string, args: readonly string[]) =>
      files.run("git", args, { cwd: directory, env: gitEnvironment });
  },
});

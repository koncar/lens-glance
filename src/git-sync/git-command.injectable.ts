import { runCliCommandInjectionToken } from "@k8slens/cli-contracts";
import { getInjectable2 } from "@k8slens/injectable";

export interface GitResult {
  readonly code: number;
  readonly output: string;
}

const exitMarker = "@@exit:";

// git never asks: a sign-in it cannot make fails rather than waiting for a terminal no one sees.
// Its messages stay in English, since what it says is read.
const gitEnvironment = { GIT_TERMINAL_PROMPT: "0", GIT_EDITOR: "true", LC_ALL: "C" };

// Runs git commands in a folder, with the user's own git, configuration and sign-in. git tells of
// its progress and of what it refuses alike on its standard error, which makes a command fail,
// so all it prints is read as the output, and its exit code from there.
export const gitCommandInjectable = getInjectable2({
  id: "lens-glance-git-command",
  consumptions: [runCliCommandInjectionToken],

  instantiate: (di) => {
    const runCliCommand = di.inject(runCliCommandInjectionToken)();

    const runGit = async (directory: string, script: string): Promise<GitResult> => {
      const output = await runCliCommand(`{ ${script}\n} 2>&1; printf '\\n${exitMarker}%s' "$?"`, {
        cwd: directory,
        env: gitEnvironment,
      });
      const at = output.lastIndexOf(exitMarker);

      return { code: Number(output.slice(at + exitMarker.length)), output: output.slice(0, at).trim() };
    };

    return () => runGit;
  },
});

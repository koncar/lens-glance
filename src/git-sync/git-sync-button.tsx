import { Button, Span } from "@k8slens/element-components";
import { ArrowSpinnerIcon, AutoRenewIcon, ErrorOutlineIcon } from "@k8slens/icon";
import { useSyncInject } from "@k8slens/use-inject";
import { observer } from "mobx-react";
import { gitReposInjectable } from "./git-repos.injectable";
import { describeRepo, type GitRepo, toSendOf } from "./git-status";
import { gitSyncInjectable } from "./git-sync.injectable";

const glyphSize = { size: "s", min: "s" } as const;

const SyncButton = observer(({ repo }: { readonly repo: GitRepo }) => {
  const { sync, isBusy } = useSyncInject(gitSyncInjectable);
  const busy = isBusy(repo.folder);
  const conflict = repo.rebasing || repo.conflicted.length > 0;
  const toSend = toSendOf(repo);

  return (
    <Button
      $interactive
      $flex={{ verticalAlign: "center", gap: "4xs" }}
      $color={conflict ? "critical" : undefined}
      $tooltip={busy ? "Syncing…" : describeRepo(repo)}
      $onClick={() => void sync(repo.folder)}
    >
      {busy ? (
        <ArrowSpinnerIcon $size={glyphSize} />
      ) : conflict ? (
        <ErrorOutlineIcon $size={glyphSize} />
      ) : (
        <AutoRenewIcon $size={glyphSize} />
      )}
      {!busy && !conflict && (toSend > 0 || repo.behind > 0) && (
        <Span $font={{ size: "xs", noWrap: true }} $color="textMuted">
          {toSend > 0 ? `${toSend}↑` : ""}
          {repo.behind > 0 ? `${repo.behind}↓` : ""}
        </Span>
      )}
    </Button>
  );
});

// Among a row's actions, on a folder that is a git repository: how it stands against the
// repository, at a glance, and a sync with one click.
export const GitSyncButton = observer(({ folder }: { readonly folder: string }) => {
  const repo = useSyncInject(gitReposInjectable).repoAt(folder);

  return repo ? <SyncButton repo={repo} /> : null;
});

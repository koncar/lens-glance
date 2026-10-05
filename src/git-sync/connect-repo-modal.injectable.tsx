import { Div, Form, Span } from "@k8slens/element-components";
import { PlainButton, PrimaryButton, SingleSelect, TextInput } from "@k8slens/input-components";
import { ModalContainer, ModalContent, ModalFooter, ModalHeader } from "@k8slens/modal-components";
import { getModalInjectableBunch, getModalKind, type ModalProps, useRespondFromModal } from "@k8slens/modal-contracts";
import { useSyncInject } from "@k8slens/use-inject";
import { observer } from "mobx-react";
import { type ReactNode, useState } from "react";
import { toFileName } from "../dashboard-files/library-actions.injectable";
import { fleetFolder } from "../fleet/fleet-settings.injectable";
import { gitReposInjectable } from "./git-repos.injectable";
import { folderNameOf, holdsRepo } from "./git-status";

export interface ConnectAnswer {
  readonly url: string;
  /** The folder of the library synced with it, which may be new. */
  readonly folder: string;
}

// Asks for the repository a folder is synced with. Started from the top of a library, it asks
// too whether the repository goes into a folder of its own, a team's, or holds the whole library.
export const connectRepoModalKind = getModalKind<[folder: string, isRoot: boolean], ConnectAnswer | undefined>()(
  "connect-git-repository",
);

type Where = "new-folder" | "here";

const Field = ({ label, children }: { readonly label: string; readonly children: ReactNode }) => (
  <Div $flex={{ direction: "vertical", gap: "xxs" }}>
    <Span $font={{ size: "s" }} $color="textMuted">
      {label}
    </Span>
    {children}
  </Div>
);

const ConnectRepoModal = observer(({ input: [folder, isRoot] }: ModalProps<typeof connectRepoModalKind>) => {
  const respond = useRespondFromModal(connectRepoModalKind);
  const repos = useSyncInject(gitReposInjectable).repos.get();
  // What is typed lives only as long as the question; the answer is what the modal returns.
  const [url, setUrl] = useState("");
  const [where, setWhere] = useState<Where>(isRoot ? "new-folder" : "here");
  // Left alone, the new folder is named after the repository.
  const [typedName, setTypedName] = useState<string | undefined>(undefined);
  const wholeAllowed = !holdsRepo(repos, folder);
  const name = toFileName(typedName ?? folderNameOf(url));
  const target = where === "new-folder" ? (folder ? `${folder}/${name}` : name) : folder;
  const ready = url.trim() !== "" && (where === "here" ? wholeAllowed : name !== "");
  const answer = () => ready && respond({ url: url.trim(), folder: target });
  const wholeLabel = folder === fleetFolder ? "Every fleet dashboard" : folder ? folder : "The whole library";

  return (
    <ModalContainer $style={{ width: "min(560px, 90vw)" }}>
      <ModalHeader>Sync with a git repository</ModalHeader>
      <Form
        onSubmit={(event) => {
          event.preventDefault();
          answer();
        }}
      >
        <ModalContent>
          <Div $flex={{ direction: "vertical", gap: "m" }}>
            <Span $font={{ size: "s" }} $color="textDefault">
              Share dashboards with your team through a repository, on GitHub or anywhere git reaches. Lens uses your
              own git and its sign-in: a repository you can clone in a terminal works here.
            </Span>
            <Field label="Repository">
              <TextInput
                autoFocus
                placeholder="git@github.com:your-team/dashboards.git"
                value={url}
                onChange={(event) => setUrl(event.target.value)}
              />
            </Field>
            {isRoot && (
              <Field label="Where its dashboards go">
                <Div $border={{ color: "borderPrimary", width: "xxs", radius: "m" }}>
                  <SingleSelect
                    options={[
                      { id: "new-folder" as const, label: "A folder of its own, for one team" },
                      {
                        id: "here" as const,
                        label: wholeAllowed ? wholeLabel : `${wholeLabel} (folders in it are synced already)`,
                      },
                    ]}
                    selected={where}
                    onSelect={setWhere}
                  />
                </Div>
              </Field>
            )}
            {where === "new-folder" && (
              <Field label="Folder">
                <TextInput value={name} onChange={(event) => setTypedName(event.target.value)} />
              </Field>
            )}
            <Span $font={{ size: "xs" }} $color="textMuted">
              {where === "new-folder" || !isRoot
                ? "An empty folder takes what the repository has. A folder with dashboards already sends them to it, on top of what it has."
                : "The dashboards here are sent to the repository, on top of what it has. Lens's own files and the agent's stay out of it."}
            </Span>
          </Div>
        </ModalContent>
        <ModalFooter>
          <PlainButton onClick={() => respond(undefined)}>Cancel</PlainButton>
          <PrimaryButton type="submit" $disabled={!ready}>
            Sync
          </PrimaryButton>
        </ModalFooter>
      </Form>
    </ModalContainer>
  );
});

export const connectRepoModalBunch = getModalInjectableBunch({
  kind: connectRepoModalKind,
  Component: ConnectRepoModal,
  onClose: () => undefined,
});

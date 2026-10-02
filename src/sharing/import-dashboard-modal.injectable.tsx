import { json, jsonParseLinter } from "@codemirror/lang-json";
import { linter, lintGutter } from "@codemirror/lint";
import { Code, Div, Input, Span } from "@k8slens/element-components";
import { UploadFileIcon } from "@k8slens/icon";
import { DangerButton, PlainButton, PrimaryButton, SingleSelect, TextInput } from "@k8slens/input-components";
import { ModalContainer, ModalContent, ModalFooter, ModalHeader } from "@k8slens/modal-components";
import { getModalInjectableBunch, getModalKind, type ModalProps, useRespondFromModal } from "@k8slens/modal-contracts";
import { useSyncInject } from "@k8slens/use-inject";
import CodeMirror from "@uiw/react-codemirror";
import { observer } from "mobx-react";
import { type ChangeEvent, type ReactNode, useRef, useState } from "react";
import { dashboardLibraryInjectable } from "../dashboard-files/dashboard-library.injectable";
import { fleetFolder } from "../fleet/fleet-settings.injectable";
import { lensPersesThemeInjectable } from "../perses/lens-theme.injectable";
import {
  type ImportTarget,
  importTargetsOf,
  isFleetTarget,
  isTaken,
  looksLikeFleetDashboard,
  pathOf,
  suggestedNameOf,
  validationOf,
} from "./import-draft";

export interface ImportAnswer {
  /** The dashboard's JSON, as pasted or read from its file, and found to have no problems. */
  readonly text: string;
  readonly target: ImportTarget;
  /** Where in the library it is written. */
  readonly path: string;
  /** Whether a dashboard at that path is replaced, which is confirmed after this. */
  readonly replace: boolean;
}

// Asks for a dashboard to import, pasted or from its file, and for where it goes: the folder,
// preselected as the one it was started from, and its name. Nothing is answered while the
// dashboard has problems, so they are listed before anything is written.
export const importModalKind = getModalKind<
  [target: ImportTarget, clusterId: string | undefined],
  ImportAnswer | undefined
>()("import-dashboard");

const Field = ({ label, children }: { readonly label: string; readonly children: ReactNode }) => (
  <Div $flex={{ direction: "vertical", gap: "xxs" }}>
    <Span $font={{ size: "s" }} $color="textMuted">
      {label}
    </Span>
    {children}
  </Div>
);

const ImportModal = observer(({ input: [initialTarget, clusterId] }: ModalProps<typeof importModalKind>) => {
  const respond = useRespondFromModal(importModalKind);
  const library = useSyncInject(dashboardLibraryInjectable).library.get();
  const { mode } = useSyncInject(lensPersesThemeInjectable).get();
  // What is typed lives only as long as the question; the answer is what the modal returns.
  const [text, setText] = useState("");
  const [targetId, setTargetId] = useState(initialTarget.folder);
  // Left alone, the name is the dashboard's own.
  const [typedName, setTypedName] = useState<string | undefined>(undefined);
  const [readError, setReadError] = useState<string | undefined>(undefined);
  const fileInput = useRef<HTMLInputElement>(null);

  const validation = validationOf(text);
  const targets = importTargetsOf(library, clusterId);
  const target = targets.find((one) => one.id === targetId) ?? targets[0];
  const name = typedName ?? suggestedNameOf(validation);
  const path = pathOf(target, name);
  const valid = validation?.valid === true;
  const taken = valid && isTaken(library, path);
  const answer = (replace: boolean) => respond({ text, target, path, replace });

  const readFile = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];

    // Chosen again, the same file is read again.
    event.target.value = "";

    if (file) {
      file.text().then(
        (read) => {
          setReadError(undefined);
          setText(read);
        },
        (error: Error) => setReadError(`Could not read ${file.name}: ${error.message}`),
      );
    }
  };

  return (
    <ModalContainer $style={{ width: "min(760px, 90vw)" }}>
      <ModalHeader>Import dashboard</ModalHeader>
      <ModalContent>
        <Div $flex={{ direction: "vertical", gap: "m" }}>
          <Div $flex={{ verticalAlign: "center", gap: "s" }}>
            <Span $font={{ size: "s" }} $color="textMuted" $flexChild="shrinkable">
              Paste a Perses dashboard's JSON, such as one copied from Lens Glance, or choose its file.
            </Span>
            <Div $flexChild />
            <PlainButton Icon={UploadFileIcon} onClick={() => fileInput.current?.click()}>
              Choose a file…
            </PlainButton>
            <Input
              $ref={fileInput}
              type="file"
              accept=".json,application/json"
              $style={{ display: "none" }}
              onChange={readFile}
            />
          </Div>
          <CodeMirror
            value={text}
            onChange={setText}
            theme={mode}
            extensions={[json(), linter(jsonParseLinter()), lintGutter()]}
            basicSetup={{ foldGutter: true, highlightActiveLine: true }}
            height="260px"
            autoFocus
          />
          {readError && (
            <Span $font={{ size: "s" }} $color="critical">
              {readError}
            </Span>
          )}
          {validation && !validation.valid && (
            <Div $flex={{ direction: "vertical", gap: "xxs" }}>
              <Span $font={{ size: "s", bold: true }} $color="critical">
                {validation.errors.length} {validation.errors.length === 1 ? "problem" : "problems"} to fix before it
                can be imported
              </Span>
              {validation.errors.slice(0, 6).map((error) => (
                <Code key={error} $font={{ size: "xs" }}>
                  {error}
                </Code>
              ))}
              {validation.errors.length > 6 && (
                <Span $font={{ size: "xs" }} $color="textMuted">
                  …and {validation.errors.length - 6} more
                </Span>
              )}
            </Div>
          )}
          {valid && (
            <Div $flex={{ gap: "m" }}>
              <Div $style={{ flex: "1 1 0", minWidth: 0 }}>
                <Field label="Folder">
                  <Div
                    $border={{ color: "borderPrimary", width: "xxs", radius: "m" }}
                    $overflow={{ y: "auto" }}
                    $style={{ maxHeight: 160 }}
                  >
                    <SingleSelect
                      options={targets.map((one) => ({ id: one.id, label: one.label }))}
                      selected={target.id}
                      onSelect={setTargetId}
                    />
                  </Div>
                </Field>
              </Div>
              <Div $flex={{ direction: "vertical", gap: "s" }} $style={{ flex: "1 1 0", minWidth: 0 }}>
                <Field label="Name">
                  <TextInput value={name} onChange={(event) => setTypedName(event.target.value)} />
                </Field>
                <Span $font={{ size: "xs" }} $color="textMuted">
                  Saved as {path}
                </Span>
                {taken && (
                  <Span $font={{ size: "s" }} $color="warning">
                    A dashboard is at {path} already: give this one another name, or replace it.
                  </Span>
                )}
                {looksLikeFleetDashboard(text) && !isFleetTarget(target) && (
                  <Div $flex={{ direction: "vertical", gap: "xxs", horizontalAlign: "left" }}>
                    <Span $font={{ size: "s" }} $color="textDefault">
                      Its queries use $__cluster_label, which fleet dashboards fill in.
                    </Span>
                    <PlainButton onClick={() => setTargetId(fleetFolder)}>Put it in Fleet dashboards</PlainButton>
                  </Div>
                )}
              </Div>
            </Div>
          )}
        </Div>
      </ModalContent>
      <ModalFooter>
        <PlainButton onClick={() => respond(undefined)}>Cancel</PlainButton>
        {taken ? (
          <DangerButton onClick={() => answer(true)}>Replace…</DangerButton>
        ) : (
          <PrimaryButton $disabled={!valid || !name.trim()} onClick={() => answer(false)}>
            Import
          </PrimaryButton>
        )}
      </ModalFooter>
    </ModalContainer>
  );
});

export const importModalBunch = getModalInjectableBunch({
  kind: importModalKind,
  Component: ImportModal,
  onClose: () => undefined,
});

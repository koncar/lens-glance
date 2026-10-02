import { Div, Form, P, Span } from "@k8slens/element-components";
import { WarningIcon } from "@k8slens/icon";
import { getInjectable2 } from "@k8slens/injectable";
import { DangerButton, PlainButton, PrimaryButton, TextInput } from "@k8slens/input-components";
import { ModalContainer, ModalContent, ModalFooter, ModalHeader } from "@k8slens/modal-components";
import {
  getModalInjectableBunch,
  getModalKind,
  type ModalProps,
  openModalInjectionToken,
  useRespondFromModal,
} from "@k8slens/modal-contracts";
import { useState } from "react";

const modalWidth = { width: "calc(var(--unit) * 55)" };

// Asks for a name: of a new dashboard, a new folder, or one being renamed.
export const nameModalKind = getModalKind<
  [title: string, label: string, initialName: string, confirmLabel: string],
  string | undefined
>()("name");

const NameModal = ({ input: [title, label, initialName, confirmLabel] }: ModalProps<typeof nameModalKind>) => {
  const respond = useRespondFromModal(nameModalKind);
  // What is typed lives only as long as the question; the answer is what the modal returns.
  const [name, setName] = useState(initialName);
  const answer = () => name.trim() && respond(name.trim());

  return (
    <ModalContainer $style={modalWidth}>
      <ModalHeader>{title}</ModalHeader>
      <Form
        onSubmit={(event) => {
          event.preventDefault();
          answer();
        }}
      >
        <ModalContent>
          <Div $flex={{ direction: "vertical", gap: "xs" }}>
            <Span $font={{ size: "s" }} $color="textMuted">
              {label}
            </Span>
            <TextInput autoFocus value={name} onChange={(event) => setName(event.target.value)} />
          </Div>
        </ModalContent>
        <ModalFooter>
          <PlainButton onClick={() => respond(undefined)}>Cancel</PlainButton>
          <PrimaryButton type="submit" $disabled={!name.trim()}>
            {confirmLabel}
          </PrimaryButton>
        </ModalFooter>
      </Form>
    </ModalContainer>
  );
};

export const nameModalBunch = getModalInjectableBunch({
  kind: nameModalKind,
  Component: NameModal,
  onClose: () => undefined,
});

// Asks before something that cannot be taken back.
export const confirmModalKind = getModalKind<[title: string, message: string, confirmLabel: string], boolean>()(
  "confirm",
);

const ConfirmModal = ({ input: [title, message, confirmLabel] }: ModalProps<typeof confirmModalKind>) => {
  const respond = useRespondFromModal(confirmModalKind);

  return (
    <ModalContainer $style={modalWidth}>
      <ModalHeader icon={<WarningIcon />}>{title}</ModalHeader>
      <ModalContent>
        <P>{message}</P>
      </ModalContent>
      <ModalFooter>
        <PlainButton onClick={() => respond(false)}>Cancel</PlainButton>
        <DangerButton onClick={() => respond(true)}>{confirmLabel}</DangerButton>
      </ModalFooter>
    </ModalContainer>
  );
};

export const confirmModalBunch = getModalInjectableBunch({
  kind: confirmModalKind,
  Component: ConfirmModal,
  onClose: () => false,
});

export const askInjectable = getInjectable2({
  id: "lens-glance-ask",
  consumptions: [openModalInjectionToken],

  instantiate: (di) => {
    const askForName = di.inject(openModalInjectionToken.for(nameModalKind).for(di.scopeIds))();
    const askToConfirm = di.inject(openModalInjectionToken.for(confirmModalKind).for(di.scopeIds))();

    return () => ({ askForName, askToConfirm });
  },
});

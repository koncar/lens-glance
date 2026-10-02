import { PushOffIcon, PushPinIcon } from "@k8slens/icon";
import type { ComponentProps } from "react";

// Lens's pin glyphs leave their fill unset, so they draw black whatever they are in, where its
// other glyphs draw in `currentColor`. These are the same glyphs, filled the way the others are.
export const PinIcon = (props: ComponentProps<typeof PushPinIcon>) => <PushPinIcon {...props} fill="currentColor" />;

export const UnpinIcon = (props: ComponentProps<typeof PushOffIcon>) => <PushOffIcon {...props} fill="currentColor" />;

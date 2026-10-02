import { Button, type ButtonProps } from "@k8slens/element-components";

// An icon-only control of a toolbar, the way Lens draws its own: highlighted on hover, ringed
// while `active`. Give it a `$tooltip`, since it has no label of its own.
export const ToolbarButton = ({ active, ...props }: ButtonProps & { readonly active?: boolean }) => (
  <Button
    $interactive={{ active }}
    $flex={{ verticalAlign: "center", horizontalAlign: "center" }}
    $padding="xxs"
    $border={{ radius: "m" }}
    $color={{ normal: "textDefault", hover: "textHighlight" }}
    {...props}
  />
);

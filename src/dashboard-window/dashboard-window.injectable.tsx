import { Div } from "@k8slens/element-components";
import { getSubWindowKindInjectableBunch, type SubWindowContentProps } from "@k8slens/sub-window-contracts";
import { DashboardView } from "../dashboard-view/dashboard-view";
import { Contained } from "../ui/contained";
import { dashboardWindowKind } from "./dashboard-window-kind";

const DashboardWindow = ({ params }: SubWindowContentProps<typeof dashboardWindowKind>) => (
  <Div $style={{ height: "100vh" }} $backgroundColor="backgroundSecondary">
    <Contained what="The dashboard">
      <DashboardView clusterId={params.clusterId} fileName={params.fileName} />
    </Contained>
  </Div>
);

export const dashboardWindowKindBunch = getSubWindowKindInjectableBunch({
  kind: dashboardWindowKind,
  Component: DashboardWindow,
  configuration: {
    title: ({ title }) => `Lens Glance: ${title}`,
    defaultWidth: 1400,
    defaultHeight: 900,
    minWidth: 640,
    minHeight: 400,
  },
});

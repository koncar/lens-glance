import { Panel } from "@perses-dev/dashboards";
import { DataQueriesProvider, usePlugin, useSuggestedStepMs } from "@perses-dev/plugin-system";
import type { PanelDefinition } from "@perses-dev/spec";

const borderless = {
  border: "none",
  borderRadius: 0,
  backgroundColor: "transparent",
  backgroundImage: "none",
  boxShadow: "none",
};

export interface PersesPanelBodyProps {
  readonly panel: PanelDefinition;
  /** Roughly how wide the panel is drawn, for how many points its queries ask for. */
  readonly approximateWidth: number;
}

// The chart of one panel, as Perses draws it, without Perses's own frame and header: the frame
// around it is Lens's.
export const PersesPanelBody = ({ panel, approximateWidth }: PersesPanelBodyProps) => {
  const { data: plugin } = usePlugin("Panel", panel.spec.plugin.kind);
  const suggestedStepMs = useSuggestedStepMs(approximateWidth);
  const queryOptions =
    typeof plugin?.queryOptions === "function" ? plugin.queryOptions(panel.spec.plugin.spec) : plugin?.queryOptions;

  return (
    <DataQueriesProvider definitions={panel.spec.queries ?? []} options={{ suggestedStepMs, ...queryOptions }}>
      <Panel definition={panel} panelOptions={{ hideHeader: true }} sx={borderless} />
    </DataQueriesProvider>
  );
};

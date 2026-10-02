import { useSyncInject } from "@k8slens/use-inject";
import type { DashboardResource } from "@perses-dev/core";
import { observer } from "mobx-react";
import type { ReactNode } from "react";
import GridLayout, { type Layout } from "react-grid-layout";
import useResizeObserver from "use-resize-observer";
import type { DashboardViewModel } from "./dashboard-view-model.injectable";
import { saveLayoutInjectable } from "./save-layout.injectable";

export const gridColumns = 24;
const gridRowHeightPx = 30;
const gridGapPx = 8;

/** The element of a panel that drags it, its title bar, so dragging inside a chart still zooms it. */
export const dragHandleClassName = "lens-glance-drag-handle";

/** What is clicked inside the title bar, such as the panel's menu, and starts no drag. */
export const noDragClassName = "lens-glance-no-drag";

export interface GridItem {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
  readonly content: { readonly $ref: string };
}

export const panelKeyOf = ($ref: string) => $ref.slice("#/spec/panels/".length);

export interface DashboardGridProps {
  readonly viewModel: DashboardViewModel;
  readonly dashboard: DashboardResource;
  readonly groupIndex: number;
  readonly items: readonly GridItem[];
  readonly renderPanel: (key: string, item: GridItem) => ReactNode;
}

// The panels of a group on the 24-column grid of Perses's dashboards, where the user drags a
// panel by its title bar and resizes it by its corner. Where they leave it is written to the
// dashboard's file, unless the file has problems: then the agent is in the middle of changing
// it, and the panels stay put.
export const DashboardGrid = observer(
  ({ viewModel, dashboard, groupIndex, items, renderPanel }: DashboardGridProps) => {
    const saveLayout = useSyncInject(saveLayoutInjectable);
    const file = viewModel.file.get();
    // Panels move only while the user edits by hand, and only while the file has no problems:
    // with problems, the agent is in the middle of changing it.
    const movable = viewModel.editing.get() && file.status === "loaded" && file.errors.length === 0;

    const placed = items.filter((item) => dashboard.spec.panels[panelKeyOf(item.content.$ref)]);
    const layout: Layout[] = placed.map((item) => ({
      i: panelKeyOf(item.content.$ref),
      x: item.x,
      y: item.y,
      w: item.width,
      h: item.height,
      minW: 2,
      minH: 2,
    }));

    // The grid lays out to a width in pixels. react-grid-layout's own WidthProvider measures
    // an element it may already have let go of, so the width is measured here instead.
    const { ref, width } = useResizeObserver<HTMLDivElement>();

    const save = (next: Layout[]) =>
      void saveLayout(
        viewModel.fileName,
        groupIndex,
        next.map((one) => ({ key: one.i, x: one.x, y: one.y, width: one.w, height: one.h })),
      );

    return (
      <div ref={ref}>
        {width ? (
          <GridLayout
            width={width}
            className="lens-glance-grid"
            layout={layout}
            cols={gridColumns}
            rowHeight={gridRowHeightPx}
            margin={[gridGapPx, gridGapPx]}
            containerPadding={[0, 0]}
            compactType="vertical"
            isDraggable={movable}
            isResizable={movable}
            draggableHandle={`.${dragHandleClassName}`}
            draggableCancel={`.${noDragClassName}`}
            onDragStop={save}
            onResizeStop={save}
            useCSSTransforms
          >
            {placed.map((item) => {
              const key = panelKeyOf(item.content.$ref);

              // A plain element: the grid hands its child the position, size and ref it lays it out by.
              return <div key={key}>{renderPanel(key, item)}</div>;
            })}
          </GridLayout>
        ) : null}
      </div>
    );
  },
);

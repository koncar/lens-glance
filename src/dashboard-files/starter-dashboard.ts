// What a new dashboard file starts with: one panel, so the agent has the shape in front of it.
export const getStarterDashboard = (name: string, title: string) => ({
  kind: "Dashboard",
  metadata: { name, project: "lens" },
  spec: {
    display: { name: title },
    duration: "1h",
    refreshInterval: "30s",
    variables: [],
    panels: {
      targetsUp: {
        kind: "Panel",
        spec: {
          display: { name: "Scrape targets up" },
          plugin: { kind: "StatChart", spec: { calculation: "last-number", format: { unit: "decimal" } } },
          queries: [
            {
              kind: "TimeSeriesQuery",
              spec: { plugin: { kind: "PrometheusTimeSeriesQuery", spec: { query: "sum(up{$__cluster_filter})" } } },
            },
          ],
        },
      },
    },
    layouts: [
      {
        kind: "Grid",
        spec: {
          display: { title: "Overview", collapse: { open: true } },
          items: [{ x: 0, y: 0, width: 6, height: 6, content: { $ref: "#/spec/panels/targetsUp" } }],
        },
      },
    ],
  },
});

// What a new fleet dashboard starts with: its clusters side by side, asked in the way that works
// against a hub and against every cluster's own Prometheus alike.
export const getFleetStarterDashboard = (name: string, title: string) => ({
  kind: "Dashboard",
  metadata: { name, project: "lens" },
  spec: {
    display: { name: title },
    duration: "1h",
    refreshInterval: "30s",
    variables: [],
    panels: {
      targetsUpByCluster: {
        kind: "Panel",
        spec: {
          display: { name: "Scrape targets up, by cluster" },
          plugin: {
            kind: "TimeSeriesChart",
            spec: { legend: { position: "right", mode: "list" }, yAxis: { format: { unit: "decimal" }, min: 0 } },
          },
          queries: [
            {
              kind: "TimeSeriesQuery",
              spec: {
                plugin: {
                  kind: "PrometheusTimeSeriesQuery",
                  spec: { query: "sum by ($__cluster_label) (up{$__cluster_filter})", seriesNameFormat: "{{cluster}}" },
                },
              },
            },
          ],
        },
      },
      clusters: {
        kind: "Panel",
        spec: {
          display: { name: "Clusters" },
          plugin: {
            kind: "Table",
            spec: {
              density: "compact",
              columnSettings: [
                { name: "cluster", header: "Cluster" },
                { name: "value", header: "Targets up", format: { unit: "decimal" } },
                { name: "timestamp", hide: true },
              ],
            },
          },
          queries: [
            {
              kind: "TimeSeriesQuery",
              spec: {
                plugin: {
                  kind: "PrometheusTimeSeriesQuery",
                  spec: { query: "sum by ($__cluster_label) (up{$__cluster_filter})" },
                },
              },
            },
          ],
        },
      },
    },
    layouts: [
      {
        kind: "Grid",
        spec: {
          display: { title: "Fleet", collapse: { open: true } },
          items: [
            { x: 0, y: 0, width: 16, height: 8, content: { $ref: "#/spec/panels/targetsUpByCluster" } },
            { x: 16, y: 0, width: 8, height: 8, content: { $ref: "#/spec/panels/clusters" } },
          ],
        },
      },
    ],
  },
});

/** The starter for a dashboard at this path: a fleet dashboard's in the fleet's folder. */
export const starterFor = (path: string, name: string, title: string) =>
  path === "fleet" || path.startsWith("fleet/")
    ? getFleetStarterDashboard(name, title)
    : getStarterDashboard(name, title);

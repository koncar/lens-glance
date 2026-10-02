# Changelog

What changed in each version of this extension, newest first.

## 0.2.0

- Open a dashboard in a window of its own, to keep it on a second screen: from the button in its header, the right-click menu of its tab, or **Dashboards: Open in new window**. Opening it again brings the window forward, and changes to the dashboard show in both.

## 0.1.0

- Direct data sources: a Prometheus-compatible address outside the cluster, found in Grafana's or Perses's datasources or added by hand, is asked from your machine, so its dashboards need no cluster connected. Every data source found is flagged as needing its cluster connected or not.
- Data sources found cluster by cluster, in the extension's preferences: Prometheus, Thanos, VictoriaMetrics, Mimir, Loki, Tempo, Pyroscope and more, from Services, Grafana's provisioned datasources and Perses's, each said to be in the cluster or outside it.
- A data source picker on a cluster's dashboards too: its own Prometheus, or a hub that holds it, filtered to it.
- Fleet dashboards across clusters, at the top of the navigator, drawn from a data source: a hub such as Thanos Query, found in your clusters, or every chosen cluster's own Prometheus. A cluster picker above each, and the data sources in the extension's preferences.
- A library of dashboards in folders, under every cluster in the navigator, with new, rename and delete for dashboards and folders.
- Panels drawn with Lens's own look, in its light or dark theme: time series, stats, gauges, bar charts, tables and notes.
- An AI agent beside the dashboard, the tool chosen in Lens's preferences, which builds the dashboard as you ask. Choose the tool from the agent's header, and drag the line above it to resize it.
- Dashboards are Perses dashboard JSON files in `~/.k8slens/lens-glance/dashboards`, and every save shows on screen right away.
- Editing by hand, turned on with the pencil: drag and resize panels; add, edit, duplicate and delete panels; groups, variables and the JSON; and Undo.
- Time range, auto refresh and dashboard variables above the dashboard, with "Only" for a single value.
- A panel's queries, filled in and with what the cluster answered, from the panel's menu.
- Problems in a dashboard's file are listed above it, with the last good version still shown; a panel that fails shows its error in its own place.

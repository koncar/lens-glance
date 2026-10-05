# Changelog

What changed in each version of this extension, newest first.

## 0.3.0

- Sync dashboards with your team through git: make a folder, or the whole library, a git repository from its menu in the navigator, on GitHub or anywhere git reaches. Its sync button commits your changes, takes your team's and sends yours, with your own git and sign-in, and shows what waits to be sent or taken. A dashboard changed on both sides keeps its last good version on screen until it is fixed, by hand or by the agent; then Sync again, or cancel the sync.
- A new banner, and a README that reads right in Lens: no HTML tags showing, and pictures that fit the page.

## 0.2.1

- The pin in a dashboard's header, and Pin to hotbar / Unpin from hotbar in its menu, are drawn in the theme's colour like the icons beside them, rather than in black.

## 0.2.0

- Open a dashboard in a window of its own, to keep it on a second screen: from the button in its header, the right-click menu of its tab, or **Dashboards: Open in new window**. Opening it again brings the window forward, and changes to the dashboard show in both.
- Pin a dashboard to the hotbar, from the pin in its header or its menu in the navigator, and open it with one click from anywhere. Renaming or deleting a dashboard updates its pins, and a pin whose dashboard is gone offers to unpin itself.
- The menus of dashboards in the navigator close when one of their rows is chosen.
- A "+" at the end of **Dashboards**, **Fleet dashboards** and their folders in the navigator creates a dashboard there in one click, and opens it with the agent.
- Share dashboards as plain Perses JSON: **Copy JSON** or **Save to Downloads** from the share button in a dashboard's header, its menu in the navigator, or the commands of the same names.
- **Import dashboard…** from the menus of Dashboards, Fleet dashboards and their folders, or the command: paste the JSON or choose its file, see its problems listed before anything is written, pick the folder and the name, and confirm before an existing dashboard is replaced.

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

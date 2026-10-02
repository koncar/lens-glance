<p align="center">
  <img src="https://raw.githubusercontent.com/koncar/lens-glance/main/docs/images/banner.png" alt="Lens Glance" width="100%">
</p>

<h3 align="center">Describe a dashboard. Watch an AI agent build it, live, inside Lens.</h3>

<p align="center">
  Kubernetes metrics per cluster or across your whole fleet · Prometheus, Thanos and VictoriaMetrics · plain Perses JSON you own
</p>

<p align="center">
  <img src="https://raw.githubusercontent.com/koncar/lens-glance/main/docs/images/agent-building.png" alt="An agent building a dashboard in Lens while it renders live" width="100%">
</p>

## Why Lens Glance

- **💬 Talk, don't click.** "Add CPU and memory by namespace." "Which pods keep restarting?" The AI agent next to the dashboard writes it as you ask, and you watch every panel appear the moment it is saved.
- **✅ It checks its own work.** Each save is validated, and each panel's queries run against your cluster. Empty or failing panels are flagged to the agent, and it fixes them before it says it's done.
- **🌐 Your whole fleet in one place.** Lens Glance looks in your clusters for Thanos, VictoriaMetrics, Mimir and Grafana's datasources, turns what answers into data sources, and gives every fleet dashboard a cluster picker with **All** and **Only**.
- **🎨 Looks like Lens, because it is Lens.** Native components, your light or dark theme, panels you drag and resize, and a full panel and query editor when you'd rather edit by hand.
- **📁 Files, not lock-in.** Every dashboard is a standard [Perses](https://perses.dev) JSON file in `~/.k8slens/lens-glance/dashboards`. Keep them in git, review them in pull requests, and edit them in any editor.

## See it

| | |
| :---: | :---: |
| <img src="https://raw.githubusercontent.com/koncar/lens-glance/main/docs/images/ask.png" alt="Asking the agent for a cluster health dashboard"><br>**Ask in plain words**: the agent reads the dashboard first | <img src="https://raw.githubusercontent.com/koncar/lens-glance/main/docs/images/edit.png" alt="Editing a panel's query by hand in the side drawer"><br>**Edit by hand**: the panel editor, with a live preview |
| <img src="https://raw.githubusercontent.com/koncar/lens-glance/main/docs/images/drag.png" alt="Dragging a panel to a new place on the grid"><br>**Drag and resize**: every move is saved to the file | <img src="https://raw.githubusercontent.com/koncar/lens-glance/main/docs/images/variables.png" alt="A namespace picker with All and Only"><br>**Variables**: pick values, or **Only** one |

## Get started in a minute

1. **Install** it from **Extensions → Browse Marketplace** in Lens: search for **lens-glance**.
2. **Choose an AI tool** in Lens: Claude Code, GitHub Copilot CLI, Gemini CLI, Codex or OpenCode.
3. **Click + on a cluster's Dashboards** in the navigator, name the dashboard, and tell the agent what you want to see.

For dashboards across clusters, click **+** on **Fleet dashboards** at the top of the navigator.

## What's inside

| | |
| --- | --- |
| **Live dashboards** | Time series, stats, gauges, bar charts, tables and notes, in collapsible groups on a 24-column grid. Time range, auto refresh and variables, such as a namespace picker with **Only**. |
| **The agent** | Your AI tool in a terminal under the dashboard, which you resize by dragging its edge. It ships with a dashboard-building skill: the format, the panel types, PromQL recipes for Kubernetes, and a way to explore your cluster's metrics before it writes a query. |
| **Fleet dashboards** | Drawn from a hub such as Thanos Query, or from each cluster's own Prometheus at once. The same dashboard works with either. |
| **Data sources** | Found cluster by cluster: Services, Grafana's provisioned datasources and Perses's. Each one says whether it needs its cluster connected. A Prometheus-compatible address that answers from your machine is used directly, without connecting to the cluster at all. |
| **Edit by hand** | A pencil turns it on: drag and resize panels; add, edit, duplicate and delete panels and groups; edit variables and the JSON; and **Undo**, which takes back the last change, yours or the agent's. |
| **Hotbar pins** | Pin a dashboard to Lens's hotbar from its header or its menu in the navigator, and it opens with one click from anywhere. Pins follow renames and deletes. |
| **A window of its own** | Pop a dashboard out of Lens onto a second screen, from its header or its tab's menu. It stays live, with its own time range, variables and editing; the agent stays in the dashboard's tab. |
| **Safe by design** | A panel that fails shows its error in its own card, and the rest keep working. A file with a mistake keeps the last good version on screen, with the problems listed above it. |

## Data sources

| Source | In dashboards |
| --- | --- |
| The Prometheus Lens uses for a cluster | ✅ |
| Thanos Query, VictoriaMetrics, Mimir, Cortex | ✅ as a cluster's Prometheus in Lens, or at a URL of its own that answers from your machine |
| Loki, Tempo, Pyroscope, Alertmanager, Elasticsearch | 🔍 found and listed; not yet in dashboards |

## FAQ

**Do I need Grafana?** No. Lens Glance draws dashboards itself, with the Perses libraries, inside Lens. If Grafana is in your cluster, its datasources are read to find yours.

**Where do my metrics go?** From your cluster's Prometheus to Lens, as for Lens's own charts. The AI tool you choose reads the dashboard file and the query results Lens writes next to it, and talks to its own service as it always does.

**Can I use my dashboards elsewhere?** Yes. They are Perses dashboards, the format of a CNCF project.

**Which platforms?** macOS and Linux.

---

<p align="center">
  <a href="https://github.com/koncar/lens-glance/blob/main/CHANGELOG.md">Changelog</a> · <a href="https://github.com/koncar/lens-glance/issues">Report a problem</a> · <a href="https://github.com/koncar/lens-glance/blob/main/LICENSE">MIT License</a> · <a href="https://github.com/koncar/lens-glance/blob/main/THIRD-PARTY-NOTICES.md">Third-party notices</a>
</p>

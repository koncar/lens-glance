![Lens Glance: describe a dashboard, and watch an AI agent build it live in Lens](https://raw.githubusercontent.com/koncar/lens-glance/main/assets/banner.svg)

### Describe a dashboard. Watch an AI agent build it, live, inside Lens.

Kubernetes metrics per cluster or across your whole fleet · Prometheus, Thanos and VictoriaMetrics · plain Perses JSON you own

![An agent building a dashboard in Lens while it renders live](https://raw.githubusercontent.com/koncar/lens-glance/main/docs/images/agent-building.png)

## Why Lens Glance

- **💬 Talk, don't click.** "Add CPU and memory by namespace." "Which pods keep restarting?" The AI agent next to the dashboard writes it as you ask, and you watch every panel appear the moment it is saved.
- **✅ It checks its own work.** Each save is validated, and each panel's queries run against your cluster. Empty or failing panels are flagged to the agent, and it fixes them before it says it's done.
- **🌐 Your whole fleet in one place.** Lens Glance looks in your clusters for Thanos, VictoriaMetrics, Mimir and Grafana's datasources, turns what answers into data sources, and gives every fleet dashboard a cluster picker with **All** and **Only**.
- **🎨 Looks like Lens, because it is Lens.** Native components, your light or dark theme, panels you drag and resize, and a full panel and query editor when you'd rather edit by hand.
- **📁 Files, not lock-in.** Every dashboard is a standard [Perses](https://perses.dev) JSON file in `~/.k8slens/lens-glance/dashboards`. Sync them with your team through git, review them in pull requests, and edit them in any editor.

## See it

#### 💬 Ask in plain words

The agent reads the dashboard first, then builds what you asked for.

![Asking the agent for a cluster health dashboard](https://raw.githubusercontent.com/koncar/lens-glance/main/docs/images/ask.png)

#### ✏️ Edit by hand

The panel editor, with a live preview of what you change.

![Editing a panel's query by hand in the side drawer](https://raw.githubusercontent.com/koncar/lens-glance/main/docs/images/edit.png)

#### ↔️ Drag and resize

Every move is saved to the file.

![Dragging a panel to a new place on the grid](https://raw.githubusercontent.com/koncar/lens-glance/main/docs/images/drag.png)

#### 🎚️ Variables

Pick the values to show, or **Only** one.

![A namespace picker with All and Only](https://raw.githubusercontent.com/koncar/lens-glance/main/docs/images/variables.png)

## Get started in a minute

1. **Install** it from **Extensions → Browse Marketplace** in Lens: search for **lens-glance**.
2. **Choose an AI tool** in Lens: Claude Code, GitHub Copilot CLI, Gemini CLI, Codex or OpenCode.
3. **Click + on a cluster's Dashboards** in the navigator, name the dashboard, and tell the agent what you want to see.

For dashboards across clusters, click **+** on **Fleet dashboards** at the top of the navigator.

## What's inside

- **Live dashboards.** Time series, stats, gauges, bar charts, tables and notes, in collapsible groups on a 24-column grid. Time range, auto refresh and variables, such as a namespace picker with **Only**.
- **The agent.** Your AI tool in a terminal under the dashboard, which you resize by dragging its edge. It ships with a dashboard-building skill: the format, the panel types, PromQL recipes for Kubernetes, and a way to explore your cluster's metrics before it writes a query.
- **Fleet dashboards.** Drawn from a hub such as Thanos Query, or from each cluster's own Prometheus at once. The same dashboard works with either.
- **Data sources.** Found cluster by cluster: Services, Grafana's provisioned datasources and Perses's. Each one says whether it needs its cluster connected. A Prometheus-compatible address that answers from your machine is used directly, without connecting to the cluster at all.
- **Edit by hand.** A pencil turns it on: drag and resize panels; add, edit, duplicate and delete panels and groups; edit variables and the JSON; and **Undo**, which takes back the last change, yours or the agent's.
- **Share with your team.** **Copy JSON** or **Save to Downloads** from a dashboard's share button, and **Import dashboard…** from the navigator: paste it or pick the file, and its problems are listed before anything is written. What travels is the plain Perses dashboard, nothing of yours.
- **Team sync through git.** Make a folder, or the whole library, a git repository your team shares, from its menu in the navigator. Its sync button commits your changes, takes your team's and sends yours, with your own git and sign-in. A dashboard changed on both sides keeps its last good version on screen until it's fixed, by you or by the agent.
- **Hotbar pins.** Pin a dashboard to Lens's hotbar from its header or its menu in the navigator, and it opens with one click from anywhere. Pins follow renames and deletes.
- **A window of its own.** Pop a dashboard out of Lens onto a second screen, from its header or its tab's menu. It stays live, with its own time range, variables and editing; the agent stays in the dashboard's tab.
- **Safe by design.** A panel that fails shows its error in its own card, and the rest keep working. A file with a mistake keeps the last good version on screen, with the problems listed above it.

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

[Changelog](https://github.com/koncar/lens-glance/blob/main/CHANGELOG.md) · [Report a problem](https://github.com/koncar/lens-glance/issues) · [MIT License](https://github.com/koncar/lens-glance/blob/main/LICENSE) · [Third-party notices](https://github.com/koncar/lens-glance/blob/main/THIRD-PARTY-NOTICES.md)

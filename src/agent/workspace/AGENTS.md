# Lens dashboards

This folder holds the dashboards Lens shows for a cluster. Every `*.json` file here is one dashboard, in the Perses dashboard format. Lens reads the file about twice a second while its tab is open, so every save shows up on screen right away. The user is watching it as you work.

Before you change a dashboard, read the `lens-dashboard` skill: `.claude/skills/lens-dashboard/SKILL.md`, and the files in its `references/` folder when you need them. It covers the format, the panel types, the layout grid, variables, and PromQL for Kubernetes.

The short version:

- Edit only the dashboard file you were pointed at. Always write the whole file as valid JSON, without comments.
- Read the file again right before every edit. The user can also change the dashboard by hand in Lens: moving and resizing panels, editing queries and variables. Writing an older copy would throw their changes away.
- Do not add a datasource. The user picks where the dashboard is drawn from above it: the cluster's own Prometheus, or a hub such as Thanos that holds it too. So put `$__cluster_filter` into every selector of every query, in every dashboard: Lens fills it in with the cluster, or matches everything where the source holds this cluster alone.
- To find out which metrics and labels the cluster has, write queries to `.lens/<name>.query.json`. Lens runs them against the cluster and writes the answer to `.lens/<name>.query.result.json`.
- After every save, wait about two seconds and read `.lens/<name>.status.json`. It says whether Lens accepted the file, and what each panel's queries returned against the cluster. Fix what it reports before you say you are done.
- Answer in a line or two: what you changed, and where it is on the dashboard.

`<name>` is the dashboard's path in this folder without `.json`: for `cluster.json` it is `cluster`, and for `team/cpu.json` it is `team/cpu`, so its status is `.lens/team/cpu.status.json`. Dashboards may be in folders here; each folder is just a directory. Files in `.lens/` are written by Lens, except the `.query.json` files, which you write.

## Fleet dashboards

The dashboards in `fleet/` show many clusters at once, drawn from a data source the user picks: a hub such as Thanos, or each cluster's own Prometheus. In their queries, put `$__cluster_filter` into every selector and `$__cluster_label` into every `by (...)`, and name series by `{{cluster}}`. Read `.claude/skills/lens-dashboard/references/fleet.md` before you change one.

## Folders synced with git

A folder here, or all of this one, may be a git repository the team shares dashboards through. Lens syncs it when the user asks, so leave git to Lens: do not commit, pull, push or rebase yourself.

A dashboard holding conflict markers (`<<<<<<<`, `=======`, `>>>>>>>`) is a sync stopped at it: the file was changed both here and in the repository, and Lens shows its last version without problems meanwhile. When the user asks you to fix it, write one valid dashboard that keeps what each side meant, with no markers left, check its status as for any edit, and tell the user to Sync again.

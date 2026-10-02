import { shellQuote } from "@k8slens/ai-tools-contracts";
import { runCliCommandInjectionToken } from "@k8slens/cli-contracts";
import { getInjectable2 } from "@k8slens/injectable";
import { computed, observable, onBecomeObserved, onBecomeUnobserved, runInAction } from "mobx";
import { dashboardsDirectoryInjectable } from "../dashboard-files/dashboards-directory.injectable";
import { metricsRouteInjectable } from "../metrics/metrics-route.injectable";
import { writeFileInjectable } from "../dashboard-files/write-file.injectable";

const pollIntervalMs = 1000;
const rowsPerQuery = 50;

const requestFileOf = (directory: string, fileName: string) =>
  `${directory}/.lens/${fileName.replace(/\.json$/, "")}.query.json`;
const resultFileOf = (directory: string, fileName: string) =>
  `${directory}/.lens/${fileName.replace(/\.json$/, "")}.query.result.json`;

const queriesOf = (text: string): string[] => {
  const request = JSON.parse(text) as { queries?: unknown };

  if (!Array.isArray(request.queries) || !request.queries.every((query) => typeof query === "string")) {
    throw new Error('Expected { "queries": ["<PromQL>", ...] }');
  }

  return request.queries;
};

// The agent cannot reach the dashboard's metrics itself, so while a dashboard is open it may
// ask through a file: the queries it writes to .lens/<name>.query.json are run against the
// cluster, and what came back is written to .lens/<name>.query.result.json.
export const agentQueryResponderInjectable = getInjectable2({
  id: "lens-glance-agent-query-responder",
  consumptions: [runCliCommandInjectionToken],

  instantiate: (di) => {
    const runCliCommand = di.inject(runCliCommandInjectionToken)();
    const routeOf = di.inject(metricsRouteInjectable);
    const getDirectory = di.inject(dashboardsDirectoryInjectable);
    const writeFile = di.inject(writeFileInjectable)();

    return (clusterId: string, fileName: string) => {
      const route = routeOf(clusterId, fileName);
      const answered = observable.box(0);
      let lastRequest: string | undefined;
      let timer: ReturnType<typeof setTimeout> | undefined;
      let listening = false;

      const answer = async (directory: string, text: string) => {
        const now = Math.floor(Date.now() / 1000);
        let results: unknown[];

        try {
          results = await Promise.all(
            queriesOf(text).map(async (query) => {
              try {
                const series = await route.query(query, { start: now, end: now, step: 60 });

                return {
                  query,
                  ok: true,
                  series: series.length,
                  rows: series
                    .slice(0, rowsPerQuery)
                    .map((one) => ({ labels: one.metric, value: one.values.at(-1)?.[1] })),
                };
              } catch (error) {
                return { query, ok: false, error: String((error as Error).message ?? error) };
              }
            }),
          );
        } catch (error) {
          results = [{ ok: false, error: `Could not read the request: ${(error as Error).message}` }];
        }

        const result = { answeredAt: new Date().toISOString(), results };

        await writeFile(resultFileOf(directory, fileName), `${JSON.stringify(result, null, 2)}\n`);
        runInAction(() => answered.set(answered.get() + 1));
      };

      const listen = async () => {
        try {
          const directory = await getDirectory();
          const request = shellQuote(requestFileOf(directory, fileName));
          const text = await runCliCommand(`if [ -f ${request} ]; then cat ${request}; fi`);

          if (text.trim() && text !== lastRequest) {
            lastRequest = text;
            await answer(directory, text);
          }
        } catch {
          // A request that cannot be read now is read again on the next round.
        } finally {
          if (listening) {
            timer = setTimeout(() => void listen(), pollIntervalMs);
          }
        }
      };

      onBecomeObserved(answered, () => {
        listening = true;
        void listen();
      });

      onBecomeUnobserved(answered, () => {
        listening = false;
        clearTimeout(timer);
      });

      return computed(() => answered.get());
    };
  },
});

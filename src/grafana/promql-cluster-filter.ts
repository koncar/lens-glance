// Puts Lens's $__cluster_filter into every selector of a PromQL query written for Grafana, and
// takes out the matchers that chose the cluster by a Grafana variable Lens replaces with its own
// choice of cluster. The query is read as tokens rather than parsed whole: Grafana's variables,
// `$__rate_interval` in a range or `$namespace` where a number goes, are not PromQL, and only
// selectors are changed, which tokens tell apart well enough.

type TokenKind = "space" | "string" | "number" | "identifier" | "variable" | "punctuation";

interface Token {
  readonly kind: TokenKind;
  readonly text: string;
  readonly start: number;
  readonly end: number;
}

export const clusterFilter = "$__cluster_filter";

const hasClusterFilter = (text: string) => /\$\{?__cluster_filter\b/.test(text);

const tokenize = (query: string): Token[] => {
  const tokens: Token[] = [];
  let at = 0;

  const push = (kind: TokenKind, end: number) => {
    tokens.push({ kind, text: query.slice(at, end), start: at, end });
    at = end;
  };

  while (at < query.length) {
    const char = query[at];
    const rest = query.slice(at);

    if (/\s/.test(char)) {
      push("space", at + (/^\s+/.exec(rest)?.[0].length ?? 1));
    } else if (char === "#") {
      const newline = query.indexOf("\n", at);

      push("space", newline === -1 ? query.length : newline);
    } else if (char === '"' || char === "'" || char === "`") {
      let end = at + 1;

      while (end < query.length && query[end] !== char) {
        end += query[end] === "\\" && char !== "`" ? 2 : 1;
      }

      push("string", Math.min(end + 1, query.length));
    } else if (char === "$") {
      const braced = /^\$\{[^}]*\}/.exec(rest);
      const plain = /^\$\w+/.exec(rest);

      push("variable", at + (braced?.[0].length ?? plain?.[0].length ?? 1));
    } else if (/[0-9]/.test(char) || (char === "." && /[0-9]/.test(query[at + 1] ?? ""))) {
      // Numbers and durations alike: 0.5, 1e3, 0x1f, 5m, 1h30m.
      push("number", at + (/^[0-9.][\w.]*/.exec(rest)?.[0].length ?? 1));
    } else if (/[a-zA-Z_]/.test(char)) {
      push("identifier", at + (/^[a-zA-Z_][\w:]*/.exec(rest)?.[0].length ?? 1));
    } else {
      push("punctuation", at + 1);
    }
  }

  return tokens;
};

// What is not a metric however it stands: the operators and keywords of PromQL, and the
// aggregations, which may be followed by `by (...)` rather than their parentheses.
const keywords = new Set([
  "and",
  "or",
  "unless",
  "bool",
  "offset",
  "inf",
  "nan",
  "by",
  "without",
  "on",
  "ignoring",
  "group_left",
  "group_right",
  "atan2",
  "start",
  "end",
]);

const aggregations = new Set([
  "sum",
  "min",
  "max",
  "avg",
  "group",
  "stddev",
  "stdvar",
  "count",
  "count_values",
  "bottomk",
  "topk",
  "quantile",
  "limitk",
  "limit_ratio",
]);

const groupings = new Set(["by", "without", "on", "ignoring", "group_left", "group_right"]);

/** Whether a piece of text refers to one of the variables, as `$name`, `${name}` or `${name:format}`. */
const refersTo = (text: string, variables: ReadonlySet<string>) =>
  [...variables].some((name) => new RegExp(`\\$(\\{${name}([:.}])|${name}\\b)`).test(text));

const indexOfClosing = (tokens: readonly Token[], from: number, open: string, close: string) => {
  let depth = 0;

  for (let index = from; index < tokens.length; index++) {
    if (tokens[index].kind !== "punctuation") {
      continue;
    }

    if (tokens[index].text === open) {
      depth++;
    } else if (tokens[index].text === close) {
      depth--;

      if (depth === 0) {
        return index;
      }
    }
  }

  return tokens.length - 1;
};

const nextSignificant = (tokens: readonly Token[], from: number) => {
  for (let index = from; index < tokens.length; index++) {
    if (tokens[index].kind !== "space") {
      return tokens[index];
    }
  }

  return undefined;
};

// The matchers between a selector's braces, those choosing a dropped variable taken out and the
// cluster filter put in.
const rewriteMatchers = (tokens: readonly Token[], droppedVariables: ReadonlySet<string>) => {
  const matchers: string[] = [];
  let current: Token[] = [];

  const flush = () => {
    const text = current
      .map((token) => token.text)
      .join("")
      .trim();

    if (text && !refersTo(text, droppedVariables)) {
      matchers.push(text);
    }

    current = [];
  };

  for (const token of tokens) {
    if (token.kind === "punctuation" && token.text === ",") {
      flush();
    } else {
      current.push(token);
    }
  }

  flush();

  return `{${[...matchers, ...(matchers.some(hasClusterFilter) ? [] : [clusterFilter])].join(", ")}}`;
};

/**
 * The query with `$__cluster_filter` in every selector, and without the matchers that refer to
 * the variables dropped, such as Grafana's `cluster`.
 */
export const withClusterFilter = (query: string, droppedVariables: ReadonlySet<string> = new Set()) => {
  const tokens = tokenize(query);
  const edits: { start: number; end: number; text: string }[] = [];

  for (let index = 0; index < tokens.length; index++) {
    const token = tokens[index];

    if (token.kind === "punctuation" && token.text === "{") {
      const closing = indexOfClosing(tokens, index, "{", "}");

      edits.push({
        start: token.start,
        end: tokens[closing].end,
        text: rewriteMatchers(tokens.slice(index + 1, closing), droppedVariables),
      });
      index = closing;
    } else if (token.kind === "punctuation" && token.text === "[") {
      // A range or a subquery's: durations only.
      index = indexOfClosing(tokens, index, "[", "]");
    } else if (token.kind === "identifier") {
      const next = nextSignificant(tokens, index + 1);
      const name = token.text.toLowerCase();

      if (groupings.has(name) && next?.text === "(") {
        // The labels of `by (...)`, `on (...)` and the like.
        index = indexOfClosing(tokens, tokens.indexOf(next), "(", ")");
      } else if (next?.text === "(" || next?.text === "{" || keywords.has(name) || aggregations.has(name)) {
        // A function, a selector whose braces come next, or a keyword.
      } else {
        edits.push({ start: token.end, end: token.end, text: `{${clusterFilter}}` });
      }
    }
  }

  return edits
    .sort((one, other) => other.start - one.start)
    .reduce((text, edit) => text.slice(0, edit.start) + edit.text + text.slice(edit.end), query);
};

/** Grafana's old `[[name]]` and `[[name:format]]` written as `${name}` and `${name:format}`. */
export const withModernVariables = (text: string) =>
  text.replace(/\[\[(\w+)(?::(\w+))?\]\]/g, (_, name: string, format?: string) =>
    format ? `\${${name}:${format}}` : `\${${name}}`,
  );

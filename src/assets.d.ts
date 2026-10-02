// Markdown files are bundled as their text: the instructions the agent finds in the dashboards folder.
declare module "*.md" {
  const text: string;

  export default text;
}

// A css module exports its class names, scoped by the build.
declare module "*.module.scss" {
  const classNames: Readonly<Record<string, string>>;

  export default classNames;
}

// Writes THIRD-PARTY-NOTICES.md: the licenses of every package bundled into dist/index.js.
// Run with `npm run notices` before publishing a version whose dependencies changed.
const fs = require("fs"), path = require("path");
const meta = JSON.parse(fs.readFileSync("bundle-meta.json", "utf8"));
const roots = new Set();
for (const input of Object.keys(meta.inputs)) {
  if (input.startsWith("(disabled):")) continue;
  const i = input.lastIndexOf("node_modules/");
  if (i < 0) continue;
  const rest = input.slice(i + 13).split("/");
  roots.add(input.slice(0, i + 13) + (rest[0].startsWith("@") ? rest[0] + "/" + rest[1] : rest[0]));
}
const read = (dir, pattern) => { const f = fs.readdirSync(dir).find((n) => pattern.test(n)); return f ? fs.readFileSync(path.join(dir, f), "utf8").trim() : undefined; };
const licenseOf = (j) => typeof j.license === "string" ? j.license : (j.license?.type ?? ((j.licenses || []).map((l) => l.type).join(" OR ") || "see package"));
const pkgs = [...roots]
  .map((dir) => { const j = JSON.parse(fs.readFileSync(path.join(dir, "package.json"), "utf8")); return { name: j.name, version: j.version, license: licenseOf(j), text: read(dir, /^(license|licence|copying)(\.|$)/i), notice: read(dir, /^notice/i) }; })
  .filter((p, i, a) => a.findIndex((o) => o.name === p.name && o.version === p.version) === i)
  .sort((a, b) => a.name.localeCompare(b.name));
const counts = {};
for (const p of pkgs) counts[p.license] = (counts[p.license] || 0) + 1;
let md = "# Third-party notices\n\nLens Glance bundles the following open-source packages into `dist/index.js`. Their licenses and notices follow.\n\n| Package | Version | License |\n| --- | --- | --- |\n" + pkgs.map((p) => `| ${p.name} | ${p.version} | ${p.license} |`).join("\n") + "\n";
for (const p of pkgs) {
  md += `\n---\n\n## ${p.name} ${p.version}\n\nLicense: ${p.license}\n`;
  if (p.notice) md += "\n```\n" + p.notice + "\n```\n";
  md += p.text ? "\n```\n" + p.text + "\n```\n" : "\n(No license file in the package; see its license field above.)\n";
}
fs.writeFileSync("THIRD-PARTY-NOTICES.md", md);
console.log(pkgs.length, "packages:", JSON.stringify(counts));
console.log("without a license file:", pkgs.filter((p) => !p.text).map((p) => `${p.name}@${p.version} (${p.license})`).join(", ") || "none");

// Some packages, among them Perses's, are Apache-2.0 without shipping the license text: it is added once.
const apache = fs.readdirSync("node_modules/@perses-dev").map((one) => path.join("node_modules/@perses-dev", one, "LICENSE")).find((file) => fs.existsSync(file));

if (apache) {
  fs.appendFileSync(
    "THIRD-PARTY-NOTICES.md",
    "\n---\n\n## Apache License 2.0\n\nThe full text of the Apache License 2.0, which applies to the packages listed above as Apache-2.0 that do not ship a license file of their own, among them the @perses-dev packages.\n\n```\n" +
      fs.readFileSync(apache, "utf8").trim() +
      "\n```\n",
  );
}

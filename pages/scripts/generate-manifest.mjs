import { readdir, readFile, writeFile } from "node:fs/promises";
import { extname, relative, basename, join } from "node:path";

const contentDir = new URL("../content/", import.meta.url);
const outputFile = new URL("../content/manifest.json", import.meta.url);

async function findMarkdownFiles(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const results = [];

  for (const entry of entries) {
    const path = join(directory.pathname, entry.name);

    if (entry.isDirectory()) {
      results.push(...await findMarkdownFiles(new URL(`${entry.name}/`, directory)));
    } else if (extname(entry.name) === ".md") {
      results.push(path);
    }
  }

  return results;
}

function parseFrontMatter(source) {
  const match = source.match(
    /^(?:<!-- raw-markdown -->\s*)?---\n([\s\S]*?)\n---/
  );

  if (!match) return {};

  const metadata = {};

  for (const line of match[1].split("\n")) {
    const separator = line.indexOf(":");
    if (separator === -1) continue;

    const key = line.slice(0, separator).trim();
    let value = line.slice(separator + 1).trim();

    if (value.startsWith("[") && value.endsWith("]")) {
      value = value
        .slice(1, -1)
        .split(",")
        .map(item => item.trim());
    }

    metadata[key] = value;
  }

  return metadata;
}

const files = await findMarkdownFiles(contentDir);

const documents = [];

for (const absolutePath of files) {
  const source = await readFile(absolutePath, "utf8");
  const metadata = parseFrontMatter(source);
  const file = relative(contentDir.pathname, absolutePath).replaceAll("\\", "/");

  documents.push({
    slug: metadata.slug || basename(file, ".md"),
    file,
    title: metadata.title || basename(file, ".md"),
    category: metadata.category || "미분류",
    date: metadata.date || "",
    tags: metadata.tags || [],
    summary: metadata.summary || ""
  });
}

documents.sort((a, b) => b.date.localeCompare(a.date));

await writeFile(
  outputFile,
  JSON.stringify({ documents }, null, 2) + "\n"
);

console.log(`${documents.length}개 문서를 manifest.json에 등록했습니다.`);

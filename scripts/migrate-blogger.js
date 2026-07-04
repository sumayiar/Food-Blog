const fs = require("fs/promises");
const path = require("path");

const ROOT = path.resolve(__dirname, "..");
const IMAGE_DIR = path.join(ROOT, "assets", "images");
const POST_DIR = path.join(ROOT, "posts");

const SOURCE_FILES = [
  "/private/tmp/someofsumi-page1.json",
  "/private/tmp/someofsumi-page2.json",
];

const EXCLUDED_SLUGS = new Set(["personal-business", "ramadan", "strawberry-milkshake"]);

const MANUAL_POSTS = [
  {
    title: "Ugly Chicken",
    slug: "ugly-chicken",
    date: "2026-06-19",
    paragraphs: [
      "Korean fried chicken from Ugly Chicken, crispy and saucy with a tiny Korean flag on top.",
    ],
    images: [
      {
        src: "assets/images/ugly-chicken-01.jpg",
        alt: "Korean fried chicken from Ugly Chicken at an outdoor food event",
        width: 1350,
        height: 1800,
      },
    ],
    tags: ["Food", "Meals", "NYC Eats"],
  },
  {
    title: "Dave's Hot Chicken",
    slug: "daves-hot-chicken",
    date: "2026-06-23",
    paragraphs: [
      "Dave's Hot Chicken with crinkle fries, pickles, sauce, and a spicy chicken slider.",
    ],
    images: [
      {
        src: "assets/images/daves-hot-chicken-01.jpg",
        alt: "Dave's Hot Chicken tray with chicken, crinkle fries, pickles, and sauce",
        width: 1350,
        height: 1800,
      },
    ],
    tags: ["Food", "Meals"],
  },
];

const MONTH_FORMAT = new Intl.DateTimeFormat("en", {
  month: "long",
  day: "numeric",
  year: "numeric",
  timeZone: "UTC",
});

function decodeHtml(value = "") {
  const namedEntities = {
    amp: "&",
    apos: "'",
    gt: ">",
    lt: "<",
    nbsp: " ",
    quot: "\"",
    rsquo: "'",
    lsquo: "'",
    rdquo: "\"",
    ldquo: "\"",
    hellip: "...",
    ndash: "-",
    mdash: "-",
  };

  return value.replace(/&(#x?[0-9a-f]+|[a-z]+);/gi, (match, entity) => {
    if (entity[0] === "#") {
      const radix = entity[1]?.toLowerCase() === "x" ? 16 : 10;
      const codePoint = parseInt(entity.replace(/^#x?/i, ""), radix);
      return Number.isFinite(codePoint) ? String.fromCodePoint(codePoint) : match;
    }

    return namedEntities[entity.toLowerCase()] ?? match;
  });
}

function escapeHtml(value = "") {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function slugify(value) {
  const slug = decodeHtml(value)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");

  return slug || "post";
}

function normalizeWhitespace(value = "") {
  return value.replace(/\s+/g, " ").trim();
}

function stripHtml(value = "") {
  return normalizeWhitespace(
    decodeHtml(
      value
        .replace(/<script[\s\S]*?<\/script>/gi, " ")
        .replace(/<style[\s\S]*?<\/style>/gi, " ")
        .replace(/<br\s*\/?>/gi, "\n")
        .replace(/<\/(p|div|li|h[1-6])>/gi, "\n")
        .replace(/<[^>]+>/g, " ")
    )
  );
}

function extractParagraphs(html = "") {
  const withoutImages = html
    .replace(/<a\b[^>]*>\s*<img[\s\S]*?<\/a>/gi, " ")
    .replace(/<img[\s\S]*?>/gi, " ")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/(p|div|li|h[1-6])>/gi, "\n");

  const lines = decodeHtml(withoutImages.replace(/<[^>]+>/g, " "))
    .split(/\n+/)
    .map(normalizeWhitespace)
    .filter(Boolean);

  if (lines.length > 0) {
    return lines;
  }

  const fallback = stripHtml(html);
  return fallback ? [fallback] : [];
}

function extractImages(html = "") {
  const images = [];
  const imagePattern = /<img\b([^>]+)>/gi;
  let imageMatch;

  while ((imageMatch = imagePattern.exec(html)) !== null) {
    const attrs = imageMatch[1];
    const attrMap = {};

    for (const attrMatch of attrs.matchAll(/([\w:-]+)=["']([^"']*)["']/g)) {
      attrMap[attrMatch[1].toLowerCase()] = decodeHtml(attrMatch[2]);
    }

    const src = attrMap.src;
    if (!src) {
      continue;
    }

    images.push({
      src,
      alt: attrMap.alt || "",
      width: Number.parseInt(attrMap["data-original-width"] || attrMap.width || "", 10) || null,
      height: Number.parseInt(attrMap["data-original-height"] || attrMap.height || "", 10) || null,
    });
  }

  return images;
}

function getAlternateUrl(entry) {
  return entry.link?.find((link) => link.rel === "alternate")?.href || "";
}

function inferTags(title, paragraphs) {
  const text = `${title} ${paragraphs.join(" ")}`.toLowerCase();
  const tags = new Set(["Food"]);

  if (/(cake|cheesecake|macaron|donut|pancake|tart|chocolate|chocalate|sweet|dessert|affogato|strawberr|milkshake|pastel)/.test(text)) {
    tags.add("Dessert");
  }

  if (/(coffee|latte|chai|tea|martini|mocktail|drink|milkshake|affogato|juice|lemon)/.test(text)) {
    tags.add("Drinks");
  }

  if (/(brunch|lunch|dinner|meal|burger|ramen|sushi|salmon|thai|katsu|fries|salad|bagel|dumpling|yemeni|bangladeshi)/.test(text)) {
    tags.add("Meals");
  }

  if (/(new york|nyc|brooklyn|dumbo|little italy|ave|street|cafe|restaurant|club|bagel blvd|paris baguette|laduree|tao|mito|bubby|amber)/.test(text)) {
    tags.add("NYC Eats");
  }

  if (/(home|cooked|personal|go-to|fuel)/.test(text)) {
    tags.add("Home");
  }

  if (/(birthday|bestie|ladies|friends|summer|18th|16)/.test(text)) {
    tags.add("Celebrations");
  }

  return Array.from(tags);
}

function imageDownloadUrl(src) {
  return src.replace(/\/s\d+\//, "/s1000/");
}

function extFromContentType(contentType = "") {
  if (contentType.includes("png")) {
    return ".png";
  }

  if (contentType.includes("webp")) {
    return ".webp";
  }

  return ".jpg";
}

async function downloadImage(image, filenameBase) {
  const cachedJpg = path.join(IMAGE_DIR, `${filenameBase}.jpg`);

  try {
    await fs.access(cachedJpg);
    return `assets/images/${filenameBase}.jpg`;
  } catch {
    // The first migration run has not downloaded this image yet.
  }

  const url = imageDownloadUrl(image.src);
  const response = await fetch(url);

  if (!response.ok) {
    throw new Error(`${response.status} ${response.statusText}`);
  }

  const contentType = response.headers.get("content-type") || "";
  const extension = extFromContentType(contentType);
  const filename = `${filenameBase}${extension}`;
  const filePath = path.join(IMAGE_DIR, filename);
  const bytes = Buffer.from(await response.arrayBuffer());
  await fs.writeFile(filePath, bytes);

  return `assets/images/${filename}`;
}

function buildPost(entry, usedSlugs) {
  const title = decodeHtml(entry.title?.$t || "Untitled");
  const published = entry.published?.$t || entry.updated?.$t || new Date().toISOString();
  const date = published.slice(0, 10);
  const year = date.slice(0, 4);
  const content = entry.content?.$t || "";
  const paragraphs = extractParagraphs(content);
  const images = extractImages(content);
  const baseSlug = slugify(title);
  let slug = baseSlug;
  let suffix = 2;

  while (usedSlugs.has(slug)) {
    slug = `${baseSlug}-${suffix}`;
    suffix += 1;
  }

  usedSlugs.add(slug);

  const excerpt = paragraphs[0] || "A small food memory from Some of Sumi.";

  return {
    title,
    slug,
    date,
    year,
    prettyDate: MONTH_FORMAT.format(new Date(`${date}T00:00:00Z`)),
    originalUrl: getAlternateUrl(entry),
    paragraphs,
    excerpt,
    images,
    tags: inferTags(title, paragraphs),
  };
}

function buildManualPost(post, usedSlugs) {
  let slug = post.slug;
  let suffix = 2;

  while (usedSlugs.has(slug)) {
    slug = `${post.slug}-${suffix}`;
    suffix += 1;
  }

  usedSlugs.add(slug);

  return {
    ...post,
    slug,
    year: post.date.slice(0, 4),
    prettyDate: MONTH_FORMAT.format(new Date(`${post.date}T00:00:00Z`)),
    originalUrl: "",
    excerpt: post.paragraphs[0] || "A small food memory from Some of Sumi.",
  };
}

async function loadPosts() {
  const pages = await Promise.all(
    SOURCE_FILES.map(async (sourceFile) => JSON.parse(await fs.readFile(sourceFile, "utf8")))
  );
  const entries = pages.flatMap((page) => page.feed?.entry || []);
  const usedSlugs = new Set();
  const bloggerPosts = entries
    .map((entry) => buildPost(entry, usedSlugs))
    .filter((post) => !EXCLUDED_SLUGS.has(post.slug));
  const manualPosts = MANUAL_POSTS.map((post) => buildManualPost(post, usedSlugs));

  return [...bloggerPosts, ...manualPosts]
    .sort((firstPost, secondPost) => secondPost.date.localeCompare(firstPost.date));
}

async function localizeImages(posts) {
  await fs.mkdir(IMAGE_DIR, { recursive: true });

  for (const post of posts) {
    const localizedImages = [];

    for (const [imageIndex, image] of post.images.entries()) {
      if (image.src.startsWith("assets/")) {
        localizedImages.push(image);
        continue;
      }

      const filenameBase = `${post.slug}-${String(imageIndex + 1).padStart(2, "0")}`;

      try {
        const localSrc = await downloadImage(image, filenameBase);
        localizedImages.push({ ...image, src: localSrc });
        console.log(`downloaded ${localSrc}`);
      } catch (error) {
        console.warn(`keeping remote image for ${post.slug}: ${error.message}`);
        localizedImages.push({ ...image, src: image.src });
      }
    }

    post.images = localizedImages;
    post.heroImage = localizedImages[0]?.src || "";
  }
}

function tagMarkup(tags) {
  return tags.map((tag) => `<span>${escapeHtml(tag)}</span>`).join("");
}

function imageMarkup(post, prefix = "") {
  if (post.images.length === 0) {
    return `<div class="post-placeholder" aria-hidden="true"><span>Some of Sumi</span></div>`;
  }

  if (post.images.length === 1) {
    const image = post.images[0];
    return `<img src="${prefix}${escapeHtml(image.src)}" alt="${escapeHtml(image.alt || post.title)}" loading="lazy">`;
  }

  return `<div class="image-stack">${post.images
    .slice(0, 3)
    .map((image, imageIndex) => `<img src="${prefix}${escapeHtml(image.src)}" alt="${escapeHtml(image.alt || `${post.title} photo ${imageIndex + 1}`)}" loading="lazy">`)
    .join("")}</div>`;
}

function cardMarkup(post) {
  return `
        <article class="post-card" data-title="${escapeHtml(post.title.toLowerCase())}" data-tags="${escapeHtml(post.tags.join(" ").toLowerCase())}" data-date="${escapeHtml(`${post.date} ${post.year}`)}" data-excerpt="${escapeHtml(post.excerpt.toLowerCase())}">
          <a class="card-image" href="posts/${escapeHtml(post.slug)}.html" aria-label="Read ${escapeHtml(post.title)}">
            ${imageMarkup(post)}
          </a>
          <div class="card-body">
            <p class="post-meta">${escapeHtml(post.prettyDate)}</p>
            <h3><a href="posts/${escapeHtml(post.slug)}.html">${escapeHtml(post.title)}</a></h3>
            <p>${escapeHtml(post.excerpt)}</p>
            <div class="tag-row">${tagMarkup(post.tags.slice(0, 3))}</div>
          </div>
        </article>`;
}

function buildIndex(posts) {
  const latest = posts[0];
  const heroImage = latest.heroImage || posts.find((post) => post.heroImage)?.heroImage || "";
  const tags = Array.from(new Set(posts.flatMap((post) => post.tags))).sort((firstTag, secondTag) => {
    if (firstTag === "Food") return -1;
    if (secondTag === "Food") return 1;
    return firstTag.localeCompare(secondTag);
  });
  const years = Array.from(new Set(posts.map((post) => post.year))).sort((firstYear, secondYear) => secondYear.localeCompare(firstYear));

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta name="description" content="Some of Sumi is a migrated food blog and NYC food diary by Sumayia Rashid.">
  <title>Some of Sumi | Food Blog</title>
  <link rel="stylesheet" href="style.css">
</head>
<body>
  <header class="site-header">
    <a class="brand" href="index.html">Some of Sumi</a>
    <nav aria-label="Primary navigation">
      <a href="#journal">Journal</a>
      <a href="#archive">Archive</a>
      <a href="#about">About</a>
    </nav>
  </header>

  <main>
    <section class="hero" style="--hero-image: url('${escapeHtml(heroImage)}')">
      <div class="hero-content">
        <p class="eyebrow">Migrated from Blogger</p>
        <h1>Some of Sumi</h1>
        <p>A personal food diary of NYC meals, sweet treats, cafe stops, birthdays, and little cravings worth remembering.</p>
        <a class="primary-link" href="#journal">Browse ${posts.length} posts</a>
      </div>
    </section>

    <section class="intro-band" aria-label="Blog summary">
      <div>
        <p class="stat-number">${posts.length}</p>
        <p>Food notes migrated</p>
      </div>
      <div>
        <p class="stat-number">${years[years.length - 1]}-${years[0]}</p>
        <p>Archive years</p>
      </div>
      <div>
        <p class="stat-number">${posts.filter((post) => post.heroImage).length}</p>
        <p>Photo posts</p>
      </div>
    </section>

    <section id="journal" class="section-shell">
      <div class="section-heading">
        <p class="eyebrow">Latest bites</p>
        <h2>Food Journal</h2>
      </div>

      <div class="controls" aria-label="Filter posts">
        <label class="search-field">
          <span>Search</span>
          <input id="post-search" type="search" placeholder="Search dishes, places, memories">
        </label>
        <div class="filter-row" role="list" aria-label="Filter by tag">
          <button class="filter-button is-active" type="button" data-filter="all">All</button>
          ${tags.map((tag) => `<button class="filter-button" type="button" data-filter="${escapeHtml(tag.toLowerCase())}">${escapeHtml(tag)}</button>`).join("")}
        </div>
      </div>

      <p class="result-count" aria-live="polite"><span id="visible-count">${posts.length}</span> posts showing</p>

      <div class="post-grid" id="post-grid">
${posts.map(cardMarkup).join("\n")}
      </div>
    </section>

    <section id="archive" class="archive-band">
      <div class="section-heading">
        <p class="eyebrow">Archive</p>
        <h2>By year</h2>
      </div>
      <div class="year-list">
        ${years.map((year) => `<a href="#journal" data-year="${year}">${year}<span>${posts.filter((post) => post.year === year).length} posts</span></a>`).join("")}
      </div>
    </section>

    <section id="about" class="about-section">
      <div class="section-heading">
        <p class="eyebrow">About</p>
        <h2>A softer home for the archive</h2>
      </div>
      <p>This site preserves the public Blogger archive for <strong>Some of Sumi</strong> as a clean static food blog. Each entry keeps its original date, title, photos, and a link back to the Blogger post.</p>
    </section>
  </main>

  <footer>
    <p>© 2026 Some of Sumi. Migrated from <a href="https://someofsumi.blogspot.com/">Blogger</a>.</p>
  </footer>

  <script src="script.js"></script>
</body>
</html>
`;
}

function postBodyMarkup(post) {
  const paragraphs = post.paragraphs.length > 0
    ? post.paragraphs.map((paragraph) => `<p>${escapeHtml(paragraph)}</p>`).join("\n")
    : `<p>A small food memory from Some of Sumi.</p>`;
  const gallery = post.images.length > 0
    ? `<div class="post-gallery">${post.images.map((image, imageIndex) => `<figure><img src="../${escapeHtml(image.src)}" alt="${escapeHtml(image.alt || `${post.title} photo ${imageIndex + 1}`)}"><figcaption>${escapeHtml(post.title)}${post.images.length > 1 ? `, photo ${imageIndex + 1}` : ""}</figcaption></figure>`).join("")}</div>`
    : `<div class="post-placeholder post-placeholder-large" aria-hidden="true"><span>Some of Sumi</span></div>`;

  return `${paragraphs}
${gallery}`;
}

function buildPostPage(post, previousPost, nextPost) {
  const heroImage = post.heroImage ? ` style="--hero-image: url('../${escapeHtml(post.heroImage)}')"` : "";
  const originalLink = post.originalUrl
    ? `<p class="original-link"><a href="${escapeHtml(post.originalUrl)}">View original Blogger post</a></p>`
    : "";

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta name="description" content="${escapeHtml(post.excerpt)}">
  <title>${escapeHtml(post.title)} | Some of Sumi</title>
  <link rel="stylesheet" href="../style.css">
</head>
<body>
  <header class="site-header">
    <a class="brand" href="../index.html">Some of Sumi</a>
    <nav aria-label="Primary navigation">
      <a href="../index.html#journal">Journal</a>
      <a href="../index.html#archive">Archive</a>
      <a href="../index.html#about">About</a>
    </nav>
  </header>

  <main>
    <article class="single-post">
      <header class="post-hero"${heroImage}>
        <div>
          <a class="back-link" href="../index.html#journal">Back to journal</a>
          <p class="post-meta">${escapeHtml(post.prettyDate)}</p>
          <h1>${escapeHtml(post.title)}</h1>
          <div class="tag-row">${tagMarkup(post.tags)}</div>
        </div>
      </header>

      <div class="post-content">
${postBodyMarkup(post)}
        ${originalLink}
      </div>

      <nav class="post-nav" aria-label="Adjacent posts">
        ${previousPost ? `<a href="${escapeHtml(previousPost.slug)}.html"><span>Previous</span>${escapeHtml(previousPost.title)}</a>` : "<span></span>"}
        ${nextPost ? `<a href="${escapeHtml(nextPost.slug)}.html"><span>Next</span>${escapeHtml(nextPost.title)}</a>` : "<span></span>"}
      </nav>
    </article>
  </main>

  <footer>
    <p>© 2026 Some of Sumi. Migrated from <a href="https://someofsumi.blogspot.com/">Blogger</a>.</p>
  </footer>
</body>
</html>
`;
}

function buildStyles() {
  return `:root {
  --ink: #17211f;
  --paper: #fffdf8;
  --soft-paper: #fff6ea;
  --tomato: #d94f3d;
  --berry: #8c2f5a;
  --mint: #4f8f74;
  --butter: #ffd166;
  --line: rgba(23, 33, 31, 0.16);
  --shadow: rgba(23, 33, 31, 0.12);
  --font-body: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
  --font-display: Georgia, "Times New Roman", serif;
}

* {
  box-sizing: border-box;
}

html {
  scroll-behavior: smooth;
  scroll-padding-top: 5rem;
}

body {
  margin: 0;
  background: var(--paper);
  color: var(--ink);
  font-family: var(--font-body);
  line-height: 1.6;
}

img {
  display: block;
  max-width: 100%;
}

a {
  color: inherit;
}

.site-header {
  position: sticky;
  top: 0;
  z-index: 10;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 1rem;
  padding: 1rem clamp(1rem, 4vw, 3rem);
  border-bottom: 1px solid var(--line);
  background: rgba(255, 253, 248, 0.92);
  backdrop-filter: blur(18px);
}

.brand {
  color: var(--berry);
  font-family: var(--font-display);
  font-size: 1.35rem;
  font-weight: 700;
  text-decoration: none;
}

.site-header nav {
  display: flex;
  flex-wrap: wrap;
  gap: 0.8rem;
  font-size: 0.92rem;
  font-weight: 700;
}

.site-header nav a {
  text-decoration: none;
}

.site-header nav a:hover,
.brand:hover {
  color: var(--tomato);
}

.hero {
  min-height: 82vh;
  display: grid;
  align-items: end;
  padding: clamp(2rem, 6vw, 5rem);
  color: #fffdf8;
  background:
    linear-gradient(90deg, rgba(16, 21, 20, 0.76), rgba(16, 21, 20, 0.28)),
    var(--hero-image) center / cover;
}

.hero-content {
  max-width: 48rem;
  padding-bottom: 3rem;
}

.eyebrow,
.post-meta {
  margin: 0 0 0.7rem;
  color: var(--tomato);
  font-size: 0.78rem;
  font-weight: 800;
  letter-spacing: 0.12em;
  text-transform: uppercase;
}

.hero .eyebrow {
  color: var(--butter);
}

h1,
h2,
h3 {
  margin: 0;
  font-family: var(--font-display);
  line-height: 1.02;
}

h1 {
  max-width: 12ch;
  font-size: clamp(4rem, 13vw, 8.5rem);
  letter-spacing: 0;
}

.hero p:not(.eyebrow) {
  max-width: 42rem;
  margin: 1.2rem 0 0;
  font-size: clamp(1.1rem, 2vw, 1.45rem);
}

.primary-link,
.original-link a,
.back-link {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-height: 2.8rem;
  margin-top: 1.5rem;
  padding: 0.72rem 1rem;
  border: 1px solid currentColor;
  border-radius: 8px;
  color: inherit;
  font-weight: 800;
  text-decoration: none;
}

.primary-link {
  color: #fffdf8;
  background: rgba(255, 255, 255, 0.12);
}

.primary-link:hover,
.original-link a:hover,
.back-link:hover {
  background: var(--ink);
  color: var(--paper);
}

.intro-band {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  border-bottom: 1px solid var(--line);
  background: var(--ink);
  color: var(--paper);
}

.intro-band div {
  padding: 1.5rem clamp(1rem, 4vw, 3rem);
  border-right: 1px solid rgba(255, 253, 248, 0.18);
}

.intro-band p {
  margin: 0;
}

.stat-number {
  color: var(--butter);
  font-family: var(--font-display);
  font-size: clamp(2rem, 5vw, 4rem);
  line-height: 1;
}

.section-shell,
.archive-band,
.about-section,
footer {
  padding: clamp(3rem, 7vw, 6rem) clamp(1rem, 4vw, 3rem);
}

.section-heading {
  max-width: 42rem;
  margin-bottom: 1.5rem;
}

.section-heading h2 {
  font-size: clamp(2.4rem, 6vw, 5rem);
}

.controls {
  display: grid;
  gap: 1rem;
  margin-bottom: 1rem;
}

.search-field {
  display: grid;
  gap: 0.35rem;
  max-width: 42rem;
  font-weight: 800;
}

.search-field input {
  width: 100%;
  min-height: 3rem;
  padding: 0.8rem 1rem;
  border: 1px solid var(--line);
  border-radius: 8px;
  background: #fff;
  color: var(--ink);
  font: inherit;
}

.filter-row {
  display: flex;
  flex-wrap: wrap;
  gap: 0.55rem;
}

.filter-button {
  min-height: 2.6rem;
  padding: 0.62rem 0.9rem;
  border: 1px solid var(--line);
  border-radius: 8px;
  background: var(--soft-paper);
  color: var(--ink);
  cursor: pointer;
  font: inherit;
  font-weight: 800;
}

.filter-button:hover,
.filter-button.is-active {
  border-color: var(--tomato);
  background: var(--tomato);
  color: #fff;
}

.result-count {
  margin: 0 0 1.5rem;
  color: rgba(23, 33, 31, 0.72);
  font-weight: 700;
}

.post-grid {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 1rem;
}

.post-card {
  min-width: 0;
  border: 1px solid var(--line);
  border-radius: 8px;
  background: #fff;
  box-shadow: 0 14px 34px var(--shadow);
  overflow: hidden;
}

.post-card.is-hidden {
  display: none;
}

.card-image {
  display: block;
  aspect-ratio: 4 / 3;
  overflow: hidden;
  background: var(--soft-paper);
}

.card-image img,
.image-stack img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.image-stack {
  display: grid;
  grid-template-columns: 1.4fr 1fr;
  grid-template-rows: 1fr 1fr;
  height: 100%;
}

.image-stack img:first-child {
  grid-row: 1 / span 2;
}

.card-body {
  padding: 1rem;
}

.card-body h3 {
  font-size: 1.55rem;
}

.card-body h3 a {
  text-decoration: none;
}

.card-body h3 a:hover {
  color: var(--tomato);
}

.card-body p {
  margin: 0.75rem 0 0;
}

.tag-row {
  display: flex;
  flex-wrap: wrap;
  gap: 0.45rem;
  margin-top: 1rem;
}

.tag-row span {
  padding: 0.28rem 0.5rem;
  border-radius: 8px;
  background: #edf8f1;
  color: var(--mint);
  font-size: 0.72rem;
  font-weight: 900;
}

.post-placeholder {
  display: grid;
  width: 100%;
  height: 100%;
  min-height: 14rem;
  place-items: center;
  background:
    linear-gradient(135deg, rgba(79, 143, 116, 0.18), rgba(217, 79, 61, 0.2)),
    var(--soft-paper);
  color: var(--berry);
  font-family: var(--font-display);
  font-size: 1.4rem;
  font-weight: 700;
}

.archive-band {
  border-top: 1px solid var(--line);
  border-bottom: 1px solid var(--line);
  background: #edf8f1;
}

.year-list {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 1rem;
}

.year-list a {
  display: grid;
  gap: 0.3rem;
  padding: 1rem;
  border: 1px solid rgba(79, 143, 116, 0.28);
  border-radius: 8px;
  background: #fff;
  color: var(--mint);
  font-family: var(--font-display);
  font-size: 2rem;
  font-weight: 700;
  text-decoration: none;
}

.year-list span {
  color: var(--ink);
  font-family: var(--font-body);
  font-size: 0.88rem;
}

.about-section {
  max-width: 68rem;
}

.about-section p {
  max-width: 46rem;
  margin: 0;
  font-size: 1.12rem;
}

.single-post {
  background: var(--paper);
}

.post-hero {
  min-height: 64vh;
  display: grid;
  align-items: end;
  padding: clamp(2rem, 6vw, 5rem);
  color: #fffdf8;
  background:
    linear-gradient(90deg, rgba(16, 21, 20, 0.78), rgba(16, 21, 20, 0.24)),
    var(--hero-image, linear-gradient(135deg, var(--berry), var(--mint))) center / cover;
}

.post-hero h1 {
  max-width: 13ch;
  font-size: clamp(3rem, 10vw, 7rem);
}

.post-hero .tag-row span {
  background: rgba(255, 255, 255, 0.88);
}

.post-content {
  max-width: 54rem;
  margin: 0 auto;
  padding: clamp(2.5rem, 6vw, 5rem) 1rem;
}

.post-content > p {
  margin: 0 0 1rem;
  font-size: clamp(1.08rem, 2vw, 1.24rem);
}

.post-gallery {
  display: grid;
  gap: 1rem;
  margin-top: 2rem;
}

.post-gallery figure {
  margin: 0;
}

.post-gallery img {
  width: 100%;
  max-height: 78vh;
  object-fit: contain;
  border-radius: 8px;
  background: #fff;
}

.post-gallery figcaption {
  margin-top: 0.45rem;
  color: rgba(23, 33, 31, 0.68);
  font-size: 0.88rem;
}

.post-nav {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 1rem;
  padding: 0 clamp(1rem, 4vw, 3rem) clamp(3rem, 6vw, 5rem);
}

.post-nav a {
  display: grid;
  gap: 0.25rem;
  min-height: 5rem;
  padding: 1rem;
  border: 1px solid var(--line);
  border-radius: 8px;
  background: #fff;
  font-family: var(--font-display);
  font-size: 1.25rem;
  font-weight: 700;
  text-decoration: none;
}

.post-nav a:last-child {
  text-align: right;
}

.post-nav span {
  color: var(--tomato);
  font-family: var(--font-body);
  font-size: 0.72rem;
  font-weight: 900;
  letter-spacing: 0.12em;
  text-transform: uppercase;
}

footer {
  border-top: 1px solid var(--line);
  color: rgba(23, 33, 31, 0.7);
}

footer p {
  margin: 0;
}

@media (max-width: 920px) {
  .post-grid {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }

  .year-list {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
}

@media (max-width: 640px) {
  .site-header {
    align-items: flex-start;
    flex-direction: column;
  }

  .hero {
    min-height: 74vh;
  }

  .intro-band {
    grid-template-columns: 1fr;
  }

  .intro-band div {
    border-right: 0;
    border-bottom: 1px solid rgba(255, 253, 248, 0.18);
  }

  .post-grid,
  .year-list,
  .post-nav {
    grid-template-columns: 1fr;
  }

  .post-nav a:last-child {
    text-align: left;
  }
}
`;
}

function buildScript() {
  return `const cards = Array.from(document.querySelectorAll(".post-card"));
const searchInput = document.querySelector("#post-search");
const filterButtons = Array.from(document.querySelectorAll(".filter-button"));
const visibleCount = document.querySelector("#visible-count");
const yearLinks = Array.from(document.querySelectorAll(".year-list a"));

let activeFilter = "all";

function updateCards() {
  const query = searchInput?.value.trim().toLowerCase() || "";
  let shown = 0;

  for (const card of cards) {
    const haystack = [
      card.dataset.title,
      card.dataset.tags,
      card.dataset.date,
      card.dataset.excerpt,
    ].join(" ");
    const matchesQuery = !query || haystack.includes(query);
    const matchesFilter = activeFilter === "all" || haystack.includes(activeFilter);
    const isVisible = matchesQuery && matchesFilter;

    card.classList.toggle("is-hidden", !isVisible);
    if (isVisible) {
      shown += 1;
    }
  }

  if (visibleCount) {
    visibleCount.textContent = String(shown);
  }
}

searchInput?.addEventListener("input", updateCards);

for (const button of filterButtons) {
  button.addEventListener("click", () => {
    activeFilter = button.dataset.filter || "all";
    filterButtons.forEach((item) => item.classList.toggle("is-active", item === button));
    updateCards();
  });
}

for (const link of yearLinks) {
  link.addEventListener("click", () => {
    const year = link.dataset.year || "";
    if (searchInput) {
      searchInput.value = year;
      searchInput.focus({ preventScroll: true });
    }
    activeFilter = "all";
    filterButtons.forEach((item) => item.classList.toggle("is-active", item.dataset.filter === "all"));
    updateCards();
  });
}
`;
}

function buildReadme(posts) {
  const bloggerPostCount = posts.filter((post) => post.originalUrl).length;
  const manualPostCount = posts.length - bloggerPostCount;

  return `# Some of Sumi Food Blog

This repository is a static migration of the public Blogger archive for [Some of Sumi](https://someofsumi.blogspot.com/).

## What was migrated

- ${bloggerPostCount} Blogger posts
- ${manualPostCount} added local photo posts
- Original post titles and publish dates
- Post text from the Blogger feed
- ${posts.reduce((total, post) => total + post.images.length, 0)} food photos stored in \`assets/images\`
- Individual static pages in \`posts/\`
- A searchable and filterable archive on \`index.html\`

## Publish

The site is plain HTML, CSS, and JavaScript. It can be served directly with GitHub Pages from the repository root.

## Source

Original Blogger feed: \`https://www.blogger.com/feeds/8058903963184184677/posts/default\`
`;
}

async function writeSite(posts) {
  await fs.mkdir(POST_DIR, { recursive: true });
  await fs.writeFile(path.join(ROOT, "index.html"), buildIndex(posts));
  await fs.writeFile(path.join(ROOT, "style.css"), buildStyles());
  await fs.writeFile(path.join(ROOT, "script.js"), buildScript());
  await fs.writeFile(path.join(ROOT, "README.md"), buildReadme(posts));
  await fs.writeFile(path.join(ROOT, ".nojekyll"), "");

  for (const [postIndex, post] of posts.entries()) {
    const previousPost = posts[postIndex + 1] || null;
    const nextPost = posts[postIndex - 1] || null;
    await fs.writeFile(
      path.join(POST_DIR, `${post.slug}.html`),
      buildPostPage(post, previousPost, nextPost)
    );
  }
}

async function main() {
  const posts = await loadPosts();
  await localizeImages(posts);
  await writeSite(posts);
  console.log(`migrated ${posts.length} posts`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});

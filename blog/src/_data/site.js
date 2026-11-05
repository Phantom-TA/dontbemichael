// Global site config — single source of truth for SEO defaults. Per-page
// values live in each post's frontmatter. Keep absolute origin in one place.
export default {
  name: "Munder Difflin",
  blogName: "Munder Difflin Blog",
  // Origin with no trailing slash; pathPrefix (/blog/) is applied by Eleventy.
  origin: "https://munderdiffl.in",
  baseUrl: "https://munderdiffl.in/blog/",
  // Blog-index description.
  description:
    "Guides, deep dives, and comparisons on running multi-agent Claude Code: orchestration, agent memory, automation, and the tooling landscape.",
  tagline: "Notes from the office floor.",
  lang: "en",
  locale: "en_US",
  author: {
    name: "Chaitanya Giri",
    twitter: "",
    url: "https://munderdiffl.in",
  },
  // Home-page pillar anchors blog posts link UP to.
  pillars: {
    what: "https://munderdiffl.in/#what",
    how: "https://munderdiffl.in/#how",
    why: "https://munderdiffl.in/#why",
    install: "https://munderdiffl.in/#install",
    claude: "https://munderdiffl.in/#claude",
    opensource: "https://munderdiffl.in/#opensource",
  },
  social: {
    github: "https://github.com/chaitanyagiri/munder-difflin",
    site: "https://munderdiffl.in",
  },
  // Default OG image (absolute). Per-post `ogImage` overrides this.
  defaultOgImage: "https://munderdiffl.in/media/og.png",
  themeColor: "#F5F2E8",
  // Topic clusters (categories), split technical and non-technical. A post's
  // `category` field picks one of these; the index/topics pages derive the live
  // list from posts.
  clusters: [
    { key: "guides", label: "Guides", kind: "technical" },
    { key: "orchestration", label: "Orchestration", kind: "technical" },
    { key: "memory", label: "Memory", kind: "technical" },
    { key: "internals", label: "Internals", kind: "technical" },
    { key: "concepts", label: "Concepts", kind: "non-technical" },
    { key: "comparisons", label: "Comparisons", kind: "non-technical" },
    { key: "use-cases", label: "Use Cases", kind: "non-technical" },
    { key: "story", label: "Story", kind: "non-technical" },
  ],
};

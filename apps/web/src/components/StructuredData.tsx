import config from "@/generated/product.config.json";

/**
 * Machine-readable identity for search and AI answer engines.
 *
 * Two problems this solves. The site never stated who built it, so a search
 * for the author's name could not surface it however good the work was. And
 * answer engines increasingly cite structured entities rather than parsing
 * prose, so an unstructured page is one they can read but not attribute.
 *
 * Person and WebSite are site-wide. SoftwareSourceCode is emitted per project
 * page, where the claims are specific enough to be worth structuring.
 */

const AUTHOR = {
  "@type": "Person",
  "@id": `${config.frontendUrl}/#author`,
  name: "Sandeep Chavan",
  givenName: "Sandeep",
  familyName: "Chavan",
  jobTitle: "Technical Product Manager · Forward Deployed AI Engineer",
  description:
    "Builds systems that know when to say no — agent reliability, evidence " +
    "gating and delivery governance. Author of SandScope and Charter.",
  url: config.frontendUrl,
  address: {
    "@type": "PostalAddress",
    addressLocality: "Hyderabad",
    addressRegion: "Telangana",
    addressCountry: "IN",
  },
  knowsAbout: [
    "Agent reliability", "Retrieval-augmented generation", "Evidence gating",
    "LLM infrastructure", "Multi-agent orchestration", "Model Context Protocol",
    "Forward deployed engineering", "Technical program management",
    "AI governance", "Enterprise delivery",
  ],
  sameAs: [
    `https://github.com/${config.repo.split("/")[0]}`,
    "https://www.linkedin.com/in/sandeep-c04",
    `https://github.com/${config.repo}`,
    "https://github.com/224Sand/charter",
  ],
};

export function SiteStructuredData() {
  const graph = [
    AUTHOR,
    {
      "@type": "WebSite",
      "@id": `${config.frontendUrl}/#website`,
      url: config.frontendUrl,
      name: config.name,
      description: config.description,
      author: { "@id": `${config.frontendUrl}/#author` },
      publisher: { "@id": `${config.frontendUrl}/#author` },
      inLanguage: "en",
    },
    {
      "@type": "SoftwareSourceCode",
      "@id": `${config.frontendUrl}/#sandscope`,
      name: "SandScope",
      description:
        "An agent that answers incident and change-management questions over a " +
        "fixed corpus and refuses when the retrieved evidence will not support " +
        "an answer. Refusal thresholds are read off the ROC curve against " +
        "explicit error budgets over 715 labelled questions.",
      codeRepository: `https://github.com/${config.repo}`,
      programmingLanguage: ["Python", "TypeScript"],
      author: { "@id": `${config.frontendUrl}/#author` },
      applicationCategory: "DeveloperApplication",
      keywords:
        "AI agent, RAG, evidence gating, hallucination, refusal, ONNX, " +
        "LangGraph, agent reliability",
    },
    {
      "@type": "SoftwareApplication",
      "@id": "https://github.com/224Sand/charter#software",
      name: "Charter",
      description:
        "An open-source MCP server that governs an AI coding agent through a " +
        "delivery lifecycle. Each named role must produce a machine-checkable " +
        "artifact before it may sign off, and no role may sign off its own work.",
      applicationCategory: "DeveloperApplication",
      operatingSystem: "macOS, Linux, Windows",
      url: `${config.frontendUrl}/charter`,
      downloadUrl: "https://github.com/224Sand/charter",
      author: { "@id": `${config.frontendUrl}/#author` },
      license: "https://opensource.org/licenses/MIT",
      offers: { "@type": "Offer", price: "0", priceCurrency: "USD" },
      keywords:
        "MCP server, Model Context Protocol, Claude Code, code review, " +
        "AI governance, SDLC, agent governance",
    },
  ];

  return (
    <script
      type="application/ld+json"
      // Serialised from a literal above; no user input reaches this string.
      dangerouslySetInnerHTML={{
        __html: JSON.stringify({ "@context": "https://schema.org", "@graph": graph }),
      }}
    />
  );
}

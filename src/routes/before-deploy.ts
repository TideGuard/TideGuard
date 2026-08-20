import { renderBeforeDeployRoadmapPage } from "../html/before-deploy-roadmap";

const HTML_HEADERS = {
  "content-type": "text/html; charset=utf-8",
  "cache-control": "public, max-age=3600",
} as const;

export function handleBeforeDeployPage(): Response {
  return new Response(renderBeforeDeployRoadmapPage(), { headers: HTML_HEADERS });
}

export function handleBeforeDeployDownload(): Response {
  return new Response(renderBeforeDeployRoadmapPage({ standalone: true }), {
    headers: {
      ...HTML_HEADERS,
      "content-disposition": 'attachment; filename="tideguard-before-you-deploy.html"',
    },
  });
}

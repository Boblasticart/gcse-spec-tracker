import { getDocsRoute, putDocsRoute } from "@/server/docs/routes";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const GET = getDocsRoute;
export const PUT = putDocsRoute;

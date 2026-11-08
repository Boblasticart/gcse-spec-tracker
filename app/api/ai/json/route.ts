import { aiJsonRoute } from "@/server/ai/routes";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
// Writing a full revision note can take a while.
export const maxDuration = 120;

export const POST = aiJsonRoute;

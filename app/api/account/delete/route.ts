import { deleteAccountRoute } from "@/server/account/routes";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const POST = deleteAccountRoute;

import { handleCallEnded } from "@/lib/handlers";
import { vaaniRoute } from "@/lib/vaani/route-handler";

export const POST = vaaniRoute(handleCallEnded);

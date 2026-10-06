import { CHANNELS, getPart, normalizeTicker, research } from "@/lib/market.mjs";
export const dynamic = "force-dynamic";
export async function GET(request: Request, context: { params: Promise<{code: string; section?: string[]}> }) {
  try {
    const {code,section}=await context.params;
    normalizeTicker(code);
    if (section && (section.length!==1 || !CHANNELS.includes(section[0]))) return Response.json({error:"数据类型不存在"},{status:404});
    const data=section?.length ? await getPart(code,section[0]):await research(code);
    return Response.json(data,{headers:{"Cache-Control":"private, no-store","X-Content-Type-Options":"nosniff"}});
  } catch (e) { return Response.json({error:e instanceof Error?e.message:"请求失败"},{status:400}); }
}

export async function GET(){return Response.json({status:"ok",app:"a-stock-research",version:"1.0.0",time:new Date().toISOString(),note:"服务健康状态不代表上游数据接口均可用；请检查各数据项status。"});}

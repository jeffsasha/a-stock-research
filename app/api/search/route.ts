import { searchStocks } from "@/lib/market.mjs";
export const dynamic="force-dynamic";
export async function GET(request:Request){
  const query=new URL(request.url).searchParams.get("q")||"";
  if(query.trim().length<2||query.length>30)return Response.json({error:"请输入2—30个字符的名称或完整代码"},{status:400});
  try{return Response.json({query,results:await searchStocks(query),fetched_at:new Date().toISOString()},{headers:{"Cache-Control":"private, no-store"}});}
  catch(e){return Response.json({error:e instanceof Error?e.message:"搜索失败",results:[]},{status:422});}
}

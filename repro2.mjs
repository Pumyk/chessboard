import postgres from "postgres";
const res = await fetch("http://localhost:3100/api/me", { method: "POST", headers: {"content-type":"application/json"}, body: JSON.stringify({}) });
console.log("status:", res.status, "body:", JSON.stringify(await res.json().catch(()=>null)).slice(0,80));

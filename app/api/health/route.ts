export function GET() {
  return Response.json({ ok: true, app: "finn", time: new Date().toISOString() });
}

// Client reader for a streamed execution (generalizes the JobCard build reader). POSTs the body,
// streams the step log live via onLog(accumulatedText), then parses the `[[result]]<json>` sentinel
// and resolves the structured result. Throws on a non-ok HTTP response.
export async function runStreamed<T = unknown>(url: string, body: unknown, onLog: (text: string) => void): Promise<T> {
  const res = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  if (!res.body) throw new Error("no stream");
  const reader = res.body.getReader();
  const dec = new TextDecoder();
  let acc = "";
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    acc += dec.decode(value, { stream: true });
    // show everything up to the result sentinel as the live log
    const cut = acc.indexOf("[[result]]");
    onLog(cut >= 0 ? acc.slice(0, cut).trimEnd() : acc);
  }
  const m = acc.match(/\[\[result\]\]([\s\S]*)$/);
  try { return (m ? JSON.parse(m[1]) : {}) as T; } catch { return {} as T; }
}

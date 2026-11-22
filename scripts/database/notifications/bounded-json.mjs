export async function boundedJson(message, limit) {
  const reader = message.body?.getReader();
  if (!reader) throw Error("INVALID_JSON");
  const decoder = new TextDecoder("utf-8", { fatal: true });
  let size = 0;
  let text = "";
  try {
    for (;;) {
      const { value, done } = await reader.read();
      if (done) return JSON.parse(text + decoder.decode());
      size += value.byteLength;
      if (size > limit) throw Error("INVALID_JSON");
      text += decoder.decode(value, { stream: true });
    }
  } finally {
    await reader.cancel();
  }
}

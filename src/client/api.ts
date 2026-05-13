export async function apiFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const headers = new Headers(init?.headers);
  if (typeof init?.body === "string" && !headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }
  const res = await fetch(path, {
    ...init,
    credentials: "include",
    headers,
  });
  if (!res.ok) {
    const text = await res.text();
    let code: string | undefined;
    let detail: string | undefined;
    try {
      const j = JSON.parse(text) as { error?: string; detail?: string };
      code = j.error;
      detail = j.detail;
    } catch {
      /* not JSON */
    }
    const err = new Error(text || res.statusText) as Error & { apiCode?: string; apiDetail?: string };
    err.apiCode = code;
    err.apiDetail = detail;
    throw err;
  }
  if (res.status === 204) return undefined as T;
  return (await res.json()) as T;
}

export async function apiUpload(path: string, form: FormData): Promise<{ photoId: string }> {
  const res = await fetch(path, { method: "POST", body: form, credentials: "include" });
  if (!res.ok) throw new Error(await res.text());
  return (await res.json()) as { photoId: string };
}

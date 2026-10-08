import { createSign } from "node:crypto";

export const DEFAULT_SHEET_ID = "1emv6gWelcVeKFFvZQlHIC5V2d2PT2p5t";
const MAX_FILE_SIZE = 20 * 1024 * 1024;

async function fetchChecked(url, options = {}, fetcher = fetch) {
  const response = await fetcher(url, {
    ...options,
    signal: AbortSignal.timeout(8000),
  });
  if (!response.ok)
    throw new Error(
      `Google respondeu HTTP ${response.status}. Verifique compartilhamento, credenciais e ID da planilha.`,
    );
  return response;
}

export async function serviceAccountToken(rawCredentials, fetcher = fetch) {
  let credentials;
  try {
    credentials = JSON.parse(rawCredentials);
  } catch {
    throw new Error(
      "GOOGLE_SERVICE_ACCOUNT_JSON precisa conter um JSON válido de conta de serviço.",
    );
  }
  if (!credentials.client_email || !credentials.private_key)
    throw new Error("Conta de serviço sem client_email ou private_key.");
  const issued = Math.floor(Date.now() / 1000);
  const encode = (value) =>
    Buffer.from(JSON.stringify(value)).toString("base64url");
  const unsigned = `${encode({ alg: "RS256", typ: "JWT" })}.${encode({ iss: credentials.client_email, scope: "https://www.googleapis.com/auth/drive.readonly", aud: "https://oauth2.googleapis.com/token", iat: issued, exp: issued + 3600 })}`;
  let signature;
  try {
    signature = createSign("RSA-SHA256")
      .update(unsigned)
      .sign(credentials.private_key)
      .toString("base64url");
  } catch {
    throw new Error("Chave privada da conta de serviço inválida.");
  }
  const response = await fetchChecked(
    "https://oauth2.googleapis.com/token",
    {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
        assertion: `${unsigned}.${signature}`,
      }),
    },
    fetcher,
  );
  const body = await response.json();
  if (!body.access_token)
    throw new Error("Google não retornou um token de acesso.");
  return body.access_token;
}

async function readLimited(response, { html = false } = {}) {
  if (Number(response.headers.get("content-length")) > MAX_FILE_SIZE)
    throw new Error("Planilha excede o limite de 20 MB.");
  const reader = response.body.getReader();
  const chunks = [];
  let size = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.length;
    if (size > MAX_FILE_SIZE) {
      await reader.cancel();
      throw new Error("Planilha excede o limite de 20 MB.");
    }
    chunks.push(Buffer.from(value));
  }
  const buffer = Buffer.concat(chunks);
  if (html) {
    if (!buffer.toString("utf8").includes('class="waffle'))
      throw new Error("A página não contém a tabela pública da planilha.");
    return buffer;
  }
  if (buffer[0] !== 0x50 || buffer[1] !== 0x4b)
    throw new Error(
      "O arquivo não está disponível como XLSX. A planilha pode exigir login ou ser um Excel armazenado no Drive.",
    );
  return buffer;
}

export async function downloadSheet(env = process.env, fetcher = fetch) {
  const id = env.SHEET_ID || DEFAULT_SHEET_ID;
  if (!/^[a-zA-Z0-9_-]{20,100}$/.test(id))
    throw new Error(
      "SHEET_ID inválido. Use apenas o ID do arquivo, sem a URL.",
    );
  if (env.GOOGLE_SERVICE_ACCOUNT_JSON) {
    const token = await serviceAccountToken(
      env.GOOGLE_SERVICE_ACCOUNT_JSON,
      fetcher,
    );
    const headers = { Authorization: `Bearer ${token}` };
    const metadata = await fetchChecked(
      `https://www.googleapis.com/drive/v3/files/${id}?fields=mimeType&supportsAllDrives=true`,
      { headers },
      fetcher,
    );
    const { mimeType } = await metadata.json();
    const url =
      mimeType === "application/vnd.google-apps.spreadsheet"
        ? `https://www.googleapis.com/drive/v3/files/${id}/export?mimeType=application%2Fvnd.openxmlformats-officedocument.spreadsheetml.sheet`
        : `https://www.googleapis.com/drive/v3/files/${id}?alt=media&supportsAllDrives=true`;
    return readLimited(await fetchChecked(url, { headers }, fetcher));
  }
  // O link informado também pode representar um XLSX armazenado no Drive.
  // Cada rota usa HTTPS e nenhum cabeçalho com credenciais é enviado a redirecionamentos.
  try {
    return await readLimited(
      await fetchChecked(
        `https://docs.google.com/spreadsheets/d/${id}/export?format=xlsx`,
        {},
        fetcher,
      ),
    );
  } catch {
    /* tentar a tabela pública */
  }
  // A tabela renderizada preserva células mescladas e valores textuais que
  // podem ser omitidos pela inferência de tipos da exportação gviz/CSV.
  try {
    const response = await fetchChecked(
      `https://docs.google.com/spreadsheets/d/${id}/edit`,
      {},
      fetcher,
    );
    return {
      format: "html",
      buffer: await readLimited(response, { html: true }),
    };
  } catch {
    /* arquivo Excel público no Drive */
  }
  try {
    return await readLimited(
      await fetchChecked(
        `https://drive.google.com/uc?export=download&id=${id}`,
        {},
        fetcher,
      ),
    );
  } catch {
    /* diagnóstico abaixo */
  }
  throw new Error(
    "Não foi possível ler a planilha. Verifique se o arquivo permite leitura por link ou configure uma conta de serviço no Netlify.",
  );
}

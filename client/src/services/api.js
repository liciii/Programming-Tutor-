const BASE = '/api';

function getToken() {
  return localStorage.getItem('token');
}

function headers(extra = {}) {
  const token = getToken();
  return {
    'Content-Type': 'application/json',
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
    ...extra,
  };
}

async function request(method, path, body) {
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: headers(),
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'Request failed');
  return data;
}

export const api = {
  get: (path) => request('GET', path),
  post: (path, body) => request('POST', path, body),
  put: (path, body) => request('PUT', path, body),
  delete: (path) => request('DELETE', path),
  uploadFile: async (file) => {
    const token = getToken();
    const form = new FormData();
    form.append('file', file);

    const res = await fetch(`${BASE}/files/upload`, {
      method: 'POST',
      headers: {
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: form,
    });

    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Upload failed');
    return data;
  },
  saveChatHistory: async (messages) => {
    return request('POST', '/profile/chat-history', { messages });
  },
};

// Streaming chat — returns a ReadableStream reader
export async function streamChat(messages, templateId) {
  const token = getToken();
  const res = await fetch(`${BASE}/chat/message`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify({ messages, templateId }),
  });

  if (!res.ok) {
    const err = await res.json();
    throw new Error(err.error || 'Chat request failed');
  }

  return res.body.getReader();
}

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

  // Safely parse the response — guard against empty bodies and non-JSON
  // responses (e.g. a 502 proxy error page or an accidental res.end()).
  let data = {};
  const ct = res.headers.get('content-type') || '';
  if (ct.includes('application/json')) {
    data = await res.json();
  } else {
    const text = await res.text();
    if (text) data = { error: text };
  }

  if (!res.ok) throw new Error(data.error || `Request failed (${res.status})`);
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
  deleteFile: (fileId) => request('DELETE', `/files/${fileId}`),
  downloadFile: async (fileId, filename) => {
    const token = getToken();
    const res = await fetch(`${BASE}/files/${fileId}`, {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    });
    if (!res.ok) throw new Error('Download failed');
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  },
  saveChatHistory: async (messages) => {
    return request('POST', '/profile/chat-history', { messages });
  },
  forgotPassword: (email) => request('POST', '/auth/forgot-password', { email }),
  resetPassword: (token, password) => request('POST', '/auth/reset-password', { token, password }),
};

// Streaming chat — returns a ReadableStream reader.
// Pass an AbortSignal to support mid-stream cancellation.
export async function streamChat(messages, templateId, signal) {
  const token = getToken();
  const res = await fetch(`${BASE}/chat/message`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify({ messages, templateId }),
    signal,
  });

  if (!res.ok) {
    const err = await res.json();
    throw new Error(err.error || 'Chat request failed');
  }

  return res.body.getReader();
}

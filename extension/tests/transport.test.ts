import { describe, it, expect, vi, afterEach } from 'vitest';
import { HttpTransport } from '../src/platform/transport-http';
import { UploadError, type Destination } from '../src/platform/transport';

const dest: Destination = { id: 'd1', name: 'HCA-Worker-01', url: 'http://10.2.50.13:9922', token: 'tok123' };
const png = new Blob(['fake-png-bytes'], { type: 'image/png' });

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('HttpTransport.upload', () => {
  it('POSTs to <url>/upload with the token header and multipart fields', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ path: '/abs/shot.png', filename: 'shot.png', bytes: 5 }), { status: 200 })
    );
    vi.stubGlobal('fetch', fetchMock);

    const result = await new HttpTransport().upload(dest, png, 'login-bug');

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('http://10.2.50.13:9922/upload');
    expect(init.method).toBe('POST');
    expect(init.headers['X-Snapdrop-Token']).toBe('tok123');

    const form = init.body as FormData;
    expect(form.get('image')).toBeInstanceOf(Blob);
    expect(form.get('shortname')).toBe('login-bug');

    expect(result).toEqual({ path: '/abs/shot.png', filename: 'shot.png', bytes: 5 });
  });

  it('throws an auth UploadError on 401', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('{}', { status: 401 })));
    await expect(new HttpTransport().upload(dest, png, '')).rejects.toMatchObject({ kind: 'auth' });
  });

  it('throws an auth UploadError on 403', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('{}', { status: 403 })));
    await expect(new HttpTransport().upload(dest, png, '')).rejects.toMatchObject({ kind: 'auth' });
  });

  it('throws a network UploadError when fetch rejects', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('fetch failed')));
    await expect(new HttpTransport().upload(dest, png, '')).rejects.toMatchObject({ kind: 'network' });
  });

  it('throws a server UploadError on 500', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('{}', { status: 500 })));
    await expect(new HttpTransport().upload(dest, png, '')).rejects.toMatchObject({ kind: 'server' });
  });

  it('throws a bad-response UploadError on malformed JSON', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('not json', { status: 200 })));
    await expect(new HttpTransport().upload(dest, png, '')).rejects.toMatchObject({ kind: 'bad-response' });
  });

  it('throws a bad-response UploadError when required fields are missing', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify({ path: '/x' }), { status: 200 })));
    await expect(new HttpTransport().upload(dest, png, '')).rejects.toBeInstanceOf(UploadError);
  });
});

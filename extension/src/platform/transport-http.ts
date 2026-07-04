import type { Destination, Transport, UploadResult } from './transport';
import { UploadError } from './transport';

export class HttpTransport implements Transport {
  async upload(dest: Destination, png: Blob, shortname: string): Promise<UploadResult> {
    const form = new FormData();
    form.append('image', png, 'shot.png');
    form.append('shortname', shortname);

    const base = dest.url.replace(/\/+$/, '');

    let response: Response;
    try {
      response = await fetch(`${base}/upload`, {
        method: 'POST',
        headers: { 'X-Snapdrop-Token': dest.token },
        body: form
      });
    } catch {
      throw new UploadError('network', `Could not reach ${dest.name} at ${dest.url}`);
    }

    if (response.status === 401 || response.status === 403) {
      throw new UploadError('auth', `${dest.name} rejected the request (check the token)`);
    }

    if (!response.ok) {
      throw new UploadError('server', `${dest.name} returned status ${response.status}`);
    }

    let data: unknown;
    try {
      data = await response.json();
    } catch {
      throw new UploadError('bad-response', `${dest.name} returned a response that was not valid JSON`);
    }

    if (
      typeof data !== 'object' ||
      data === null ||
      typeof (data as UploadResult).path !== 'string' ||
      typeof (data as UploadResult).filename !== 'string' ||
      typeof (data as UploadResult).bytes !== 'number'
    ) {
      throw new UploadError('bad-response', `${dest.name} returned an unexpected response shape`);
    }

    return data as UploadResult;
  }
}
